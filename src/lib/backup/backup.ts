import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { z } from 'zod';
import { db } from '../db/db';
import { createRoomRecord, defaultChecks, emptyDirection, withSettingsDefaults } from '../db/factories';
import { syncWalls } from '../geometry/room';
import { newId, nowIso } from '../ids';
import { blobKey, fetchBlob } from '../files/repo';
import { extOf, fileKindOf } from '../files/kind';
import { syncEngine } from '../sync/engine';
import { tr } from '../../i18n/messages';
import type {
  AppSettings,
  BackupSummary,
  Comparison,
  DesignTask,
  DesignVersion,
  DirectionPreset,
  FileBlob,
  FileVariant,
  Floor,
  LibraryItem,
  Project,
  Reference,
  Requirement,
  RestorePoint,
  Room,
  StoredFile,
  Translation,
  TrashEntry,
} from '../types';

/**
 * Backups.
 *
 * Export: one ZIP with data.json (every record), manifest.json, and every
 * file — originals byte-for-byte plus previews — with SHA-256 checksums.
 * Files not yet on this device are downloaded from the cloud first.
 *
 * Import: validated, previewed, and applied only after confirmation. A
 * restore point is saved first. Files are never deleted by a restore.
 */

export const BACKUP_APP = 'bait-khuzam-studio';
export const BACKUP_FORMAT = 2;
const MAX_RESTORE_POINTS = 5;

type FileEntry = StoredFile & { files: { original: string; display?: string; thumb?: string } };

export interface BackupData {
  project: Project | null;
  floors: Floor[];
  rooms: Room[];
  requirements: Requirement[];
  references: Reference[];
  versions: DesignVersion[];
  library: LibraryItem[];
  presets: DirectionPreset[];
  comparisons: Comparison[];
  tasks: DesignTask[];
  translations: Translation[];
  trash: TrashEntry[];
  settings: Partial<AppSettings> | null;
  files: FileEntry[];
}

export interface BackupManifest {
  app: string;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  includesApiKeys: boolean;
  checksums: 'sha-256' | 'none';
  summary: BackupSummary;
  /** Files whose bytes could not be included (e.g. offline and not on this device). */
  missingFiles?: string[];
}

async function sha256(bytes: Uint8Array): Promise<string | undefined> {
  try {
    if (!crypto?.subtle) return undefined;
    const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

function stripKeys(s: AppSettings): Partial<AppSettings> {
  const copy = structuredClone(s);
  copy.imageProvider.keys = {};
  copy.textProvider.keys = {};
  return copy;
}

export function backupFilename(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `bait-khuzam-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.zip`;
}

async function collectData(includeKeys: boolean): Promise<Omit<BackupData, 'files'> & { fileRecords: StoredFile[] }> {
  const [project, floors, rooms, requirements, references, versions, library, presets, comparisons, tasks, translations, trash, settingsRaw, fileRecords] =
    await Promise.all([
      db.project.get('project'),
      db.floors.toArray(),
      db.rooms.toArray(),
      db.requirements.toArray(),
      db.references.toArray(),
      db.versions.toArray(),
      db.library.toArray(),
      db.presets.toArray(),
      db.comparisons.toArray(),
      db.tasks.toArray(),
      db.translations.toArray(),
      db.trash.toArray(),
      db.settings.get('app'),
      db.files.toArray(),
    ]);
  const settings = withSettingsDefaults(settingsRaw);
  return {
    project: project ?? null,
    floors,
    rooms,
    requirements,
    references,
    versions,
    library,
    presets,
    comparisons,
    tasks,
    translations,
    trash,
    settings: includeKeys ? settings : stripKeys(settings),
    fileRecords,
  };
}

export type ExportProgress = (stage: 'files' | 'packing', done: number, total: number) => void;

/**
 * Export everything to a ZIP. Missing file bytes are downloaded from the
 * cloud; anything that cannot be fetched is listed in the manifest.
 */
export async function exportBackup(opts: { includeKeys?: boolean; onProgress?: ExportProgress } = {}): Promise<{
  blob: Blob;
  summary: BackupSummary;
  filename: string;
  missingFiles: string[];
}> {
  const { fileRecords, ...rest } = await collectData(!!opts.includeKeys);

  const chunks: Uint8Array[] = [];
  let resolveDone!: () => void;
  let rejectDone!: (e: unknown) => void;
  const finished = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      rejectDone(err);
      return;
    }
    chunks.push(chunk);
    if (final) resolveDone();
  });
  const addStored = (path: string, bytes: Uint8Array) => {
    const f = new ZipPassThrough(path);
    zip.add(f);
    f.push(bytes, true);
  };
  const addDeflated = (path: string, text: string) => {
    const f = new ZipDeflate(path, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };

  const missingFiles: string[] = [];
  let summary: BackupSummary;
  try {
    const files: FileEntry[] = [];
    let i = 0;
    for (const file of fileRecords) {
      opts.onProgress?.('files', ++i, fileRecords.length);
      const original = await fetchBlob(file, 'original').catch(() => null);
      if (!original) {
        missingFiles.push(file.name || file.id);
        continue;
      }
      const bytes = new Uint8Array(await original.arrayBuffer());
      const paths: FileEntry['files'] = { original: `files/${file.id}/original${file.ext ? `.${file.ext}` : ''}` };
      addStored(paths.original, bytes);
      for (const variant of ['display', 'thumb'] as FileVariant[]) {
        const has = variant === 'display' ? file.hasDisplay : file.hasThumb;
        if (!has) continue;
        const b = await fetchBlob(file, variant).catch(() => null);
        if (!b) continue;
        paths[variant] = `files/${file.id}/${variant}`;
        addStored(paths[variant]!, new Uint8Array(await b.arrayBuffer()));
      }
      files.push({ ...file, sha256: file.sha256 ?? (await sha256(bytes)) ?? null, files: paths });
    }
    const data: BackupData = { ...rest, files };
    summary = summarize(data);
    const manifest: BackupManifest = {
      app: BACKUP_APP,
      formatVersion: BACKUP_FORMAT,
      schemaVersion: db.verno,
      createdAt: nowIso(),
      includesApiKeys: !!opts.includeKeys,
      checksums: files.some((m) => m.sha256) ? 'sha-256' : 'none',
      summary,
      missingFiles,
    };
    opts.onProgress?.('packing', 0, 1);
    addDeflated('data.json', JSON.stringify(data));
    addDeflated('manifest.json', JSON.stringify(manifest, null, 2));
    addDeflated(
      'README.txt',
      [
        'Bait Khuzam Studio backup / نسخة احتياطية من استوديو بيت خزام',
        '',
        'Restore it from Settings & Backup → Choose backup file.',
        'data.json holds all studio data; files/ holds every photo and attachment (original files, unmodified).',
        '',
        'للاستعادة: الإعدادات والنسخ الاحتياطي ← اختيار ملف النسخة الاحتياطية.',
      ].join('\n'),
    );
    zip.end();
  } catch (e) {
    zip.terminate();
    throw e;
  }
  await finished;
  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  return { blob, summary, filename: backupFilename(), missingFiles };
}

export function summarize(data: Pick<BackupData, 'project' | 'rooms' | 'requirements' | 'references' | 'files' | 'versions' | 'library'>): BackupSummary {
  return {
    createdAt: nowIso(),
    projectName: data.project?.name ?? 'Project',
    rooms: data.rooms.length,
    requirements: data.requirements.length,
    references: data.references.length,
    images: data.files.length,
    versions: data.versions.length,
    libraryItems: data.library.length,
  };
}

/* ------------------------------------------------------------------ */
/* Import                                                               */
/* ------------------------------------------------------------------ */

const withId = z.object({ id: z.string().min(1) }).passthrough();
const fileEntrySchema = z.object({ id: z.string(), name: z.string(), type: z.string(), files: z.object({ original: z.string() }).passthrough() }).passthrough();
const dataSchema = z.object({
  project: z
    .object({ id: z.literal('project'), name: z.string() })
    .passthrough()
    .nullable(),
  floors: z.array(withId),
  rooms: z.array(withId.extend({ name: z.string(), geometry: z.object({ shape: z.string() }).passthrough(), walls: z.array(z.any()) })),
  requirements: z.array(withId.extend({ roomId: z.string(), title: z.string() })),
  references: z.array(withId.extend({ imageId: z.string() })),
  versions: z.array(withId.extend({ roomId: z.string(), number: z.number() })),
  library: z.array(withId),
  presets: z.array(withId),
  comparisons: z.array(withId),
  tasks: z.array(withId),
  translations: z.array(withId).optional(),
  trash: z.array(withId).optional(),
  settings: z.object({}).passthrough().nullable(),
  // Format 2: files of any type. Format 1: images.
  files: z.array(fileEntrySchema).optional(),
  images: z.array(fileEntrySchema).optional(),
});

const manifestSchema = z.object({
  app: z.string(),
  formatVersion: z.number(),
  createdAt: z.string(),
  includesApiKeys: z.boolean().optional(),
  summary: z.object({}).passthrough(),
});

export interface ParsedBackup {
  manifest: BackupManifest;
  data: BackupData;
  zipFiles: Record<string, Uint8Array>;
  issues: string[];
  /** File ids whose original is missing or damaged. */
  brokenFiles: string[];
}

export class BackupError extends Error {}

/** Older backups stored images only; turn them into files of the current format. */
function upgradeFileEntry(raw: Record<string, unknown> & { id: string; name: string; type: string; files: FileEntry['files'] }): FileEntry {
  const name = raw.name || raw.id;
  return {
    id: raw.id,
    name,
    type: raw.type || '',
    size: Number(raw.size ?? 0),
    kind: (raw.kind as StoredFile['kind']) ?? fileKindOf(raw.type || '', name),
    ext: (raw.ext as string) ?? extOf(name),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    hasDisplay: (raw.hasDisplay as boolean) ?? !!raw.files.display,
    hasThumb: (raw.hasThumb as boolean) ?? !!raw.files.thumb,
    sha256: (raw.sha256 as string) ?? null,
    createdAt: (raw.createdAt as string) ?? nowIso(),
    files: raw.files,
  };
}

export async function readBackup(file: Blob): Promise<ParsedBackup> {
  const t = tr().backup;
  let zipFiles: Record<string, Uint8Array>;
  try {
    zipFiles = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupError(t.notZip);
  }
  if (!zipFiles['manifest.json'] || !zipFiles['data.json']) throw new BackupError(t.notStudioBackup);
  let manifest: BackupManifest;
  try {
    const m = manifestSchema.parse(JSON.parse(strFromU8(zipFiles['manifest.json'])));
    if (m.app !== BACKUP_APP) throw new BackupError(t.otherApp);
    if (m.formatVersion > BACKUP_FORMAT) throw new BackupError(t.newerVersion);
    manifest = m as unknown as BackupManifest;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(t.manifestDamaged);
  }
  let data: BackupData;
  try {
    const parsed = dataSchema.safeParse(JSON.parse(strFromU8(zipFiles['data.json'])));
    if (!parsed.success) throw new BackupError(t.dataDamaged(parsed.error.issues[0]?.path.join('.') || 'structure'));
    const raw = parsed.data as unknown as Record<string, unknown> & { files?: unknown[]; images?: unknown[] };
    const fileList = (raw.files ?? raw.images ?? []) as Parameters<typeof upgradeFileEntry>[0][];
    data = {
      ...(raw as unknown as BackupData),
      translations: (raw.translations as Translation[]) ?? [],
      trash: (raw.trash as TrashEntry[]) ?? [],
      files: fileList.map(upgradeFileEntry),
    };
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(t.dataUnreadable);
  }
  const issues: string[] = [];
  const brokenFiles: string[] = [];
  for (const f of data.files) {
    const bytes = zipFiles[f.files.original];
    if (!bytes) {
      brokenFiles.push(f.id);
      continue;
    }
    if (f.sha256) {
      const h = await sha256(bytes);
      if (h && h !== f.sha256) brokenFiles.push(f.id);
    }
  }
  if (brokenFiles.length) issues.push(t.brokenFiles(brokenFiles.length));
  if (manifest.missingFiles?.length) issues.push(t.missingAtExport(manifest.missingFiles.length));
  const fileIds = new Set(data.files.map((i) => i.id));
  const dangling = data.references.filter((r) => !fileIds.has(r.imageId)).length;
  if (dangling) issues.push(t.danglingRefs(dangling));
  return { manifest, data, zipFiles, issues, brokenFiles };
}

/** Fill fields added in later versions so older backups stay usable. */
function normalizeRoom(r: Room): Room {
  const base = createRoomRecord({ name: r.name, type: r.type ?? 'other' });
  const merged: Room = {
    ...base,
    ...r,
    geometry: {
      ...base.geometry,
      ...r.geometry,
      lCutout: { ...base.geometry.lCutout, ...(r.geometry?.lCutout ?? {}) },
      customOrigin: r.geometry?.customOrigin ?? { x: 0, y: 0 },
    },
    layout: { ...base.layout, ...(r.layout ?? {}), checks: { ...defaultChecks(), ...(r.layout?.checks ?? {}) }, items: r.layout?.items ?? [] },
    direction: { ...emptyDirection(), ...(r.direction ?? {}) },
    elements: r.elements ?? [],
    fixedConstraints: r.fixedConstraints ?? [],
  };
  merged.walls = syncWalls(merged.geometry, merged.walls ?? []);
  return merged;
}

function normalizeReference(r: Reference): Reference {
  return { ...r, referenceIds: r.referenceIds ?? [] };
}

/** Tables replaced by a restore. Files are added, never removed. */
const REPLACED = ['project', 'floors', 'rooms', 'requirements', 'references', 'versions', 'library', 'presets', 'comparisons', 'tasks', 'translations', 'trash'] as const;

/**
 * Replace the studio's data with a parsed backup (or restore point). A
 * restore point of the current data is saved first. API keys on this device
 * are kept unless the backup includes keys and `useBackupKeys` is set.
 */
export async function restoreBackup(parsed: ParsedBackup, opts: { createRestorePoint: boolean; useBackupKeys?: boolean; reason?: string }): Promise<void> {
  if (opts.createRestorePoint) await createRestorePoint(opts.reason ?? tr().backup.reasonBeforeRestore);
  const { data, zipFiles } = parsed;
  const broken = new Set(parsed.brokenFiles);
  const now = nowIso();
  const files: StoredFile[] = [];
  const blobs: FileBlob[] = [];
  // Files the cloud already has (known on this device) are cached, not uploaded again.
  const known = new Set((await db.files.toCollection().primaryKeys()) as string[]);
  for (const entry of data.files) {
    const { files: paths, ...meta } = entry;
    const original = zipFiles[paths.original];
    if (broken.has(entry.id) && !original) {
      // Keep the record (the cloud may still have the bytes).
      files.push(meta);
      continue;
    }
    files.push(meta);
    const pending: 0 | 1 = known.has(entry.id) ? 0 : 1;
    if (original) blobs.push({ key: blobKey(entry.id, 'original'), fileId: entry.id, variant: 'original', blob: new Blob([original as BlobPart], { type: meta.type }), pending, cachedAt: now });
    const display = paths.display ? zipFiles[paths.display] : undefined;
    if (display) blobs.push({ key: blobKey(entry.id, 'display'), fileId: entry.id, variant: 'display', blob: new Blob([display as BlobPart], { type: 'image/jpeg' }), pending, cachedAt: now });
    const thumb = paths.thumb ? zipFiles[paths.thumb] : undefined;
    if (thumb) blobs.push({ key: blobKey(entry.id, 'thumb'), fileId: entry.id, variant: 'thumb', blob: new Blob([thumb as BlobPart], { type: 'image/webp' }), pending, cachedAt: now });
  }

  const current = withSettingsDefaults(await db.settings.get('app'));
  const incoming = withSettingsDefaults((data.settings ?? undefined) as Partial<AppSettings> | undefined);
  const settings: AppSettings = {
    ...incoming,
    imageProvider: { ...incoming.imageProvider, keys: opts.useBackupKeys && parsed.manifest.includesApiKeys ? incoming.imageProvider.keys : current.imageProvider.keys },
    textProvider: { ...incoming.textProvider, keys: opts.useBackupKeys && parsed.manifest.includesApiKeys ? incoming.textProvider.keys : current.textProvider.keys },
  };

  syncEngine.setForceArchive(true);
  const tables = [...REPLACED.map((t) => db.table(t)), db.files, db.blobs, db.settings];
  await db.transaction('rw', tables, async () => {
    for (const t of REPLACED) {
      const keys = (await db.table(t).toCollection().primaryKeys()) as string[];
      if (keys.length) await db.table(t).bulkDelete(keys);
    }
    await db.project.put(
      data.project ?? {
        id: 'project',
        name: 'Bait Khuzam',
        nameAr: 'بيت خزام',
        location: 'Riyadh, Saudi Arabia',
        locationAr: 'الرياض، المملكة العربية السعودية',
        description: '',
        coverReferenceId: null,
        createdAt: now,
        updatedAt: now,
      },
    );
    await db.floors.bulkPut(data.floors);
    await db.rooms.bulkPut(data.rooms.map(normalizeRoom));
    await db.requirements.bulkPut(data.requirements);
    await db.references.bulkPut(data.references.map(normalizeReference));
    await db.versions.bulkPut(data.versions);
    await db.library.bulkPut(data.library);
    await db.presets.bulkPut(data.presets);
    await db.comparisons.bulkPut(data.comparisons);
    await db.tasks.bulkPut(data.tasks);
    await db.translations.bulkPut(data.translations ?? []);
    await db.trash.bulkPut(data.trash ?? []);
    await db.files.bulkPut(files);
    await db.blobs.bulkPut(blobs);
    await db.settings.put(settings);
  });
}

/* ------------------------------------------------------------------ */
/* Restore points (on this device; data only — files stay in storage)   */
/* ------------------------------------------------------------------ */

export async function createRestorePoint(reason: string): Promise<RestorePoint> {
  const { fileRecords, ...rest } = await collectData(false);
  const data: BackupData = { ...rest, files: fileRecords.map((f) => ({ ...f, files: { original: '' } })) };
  const summary = summarize(data);
  const json = JSON.stringify({ manifest: { app: BACKUP_APP, formatVersion: BACKUP_FORMAT, createdAt: nowIso(), includesApiKeys: false, summary }, data });
  const blob = new Blob([json], { type: 'application/json' });
  const point: RestorePoint = { id: newId('rp'), createdAt: nowIso(), reason, size: blob.size, format: 'data', blob, summary };
  await db.restorePoints.add(point);
  const all = await db.restorePoints.orderBy('createdAt').toArray();
  const excess = all.length - MAX_RESTORE_POINTS;
  if (excess > 0) await db.restorePoints.bulkDelete(all.slice(0, excess).map((p) => p.id));
  return point;
}

async function parseRestorePoint(point: RestorePoint): Promise<ParsedBackup> {
  if (point.format !== 'data') return readBackup(point.blob);
  const parsed = JSON.parse(await point.blob.text()) as { manifest: BackupManifest; data: BackupData };
  return { manifest: parsed.manifest, data: { ...parsed.data, translations: parsed.data.translations ?? [], trash: parsed.data.trash ?? [] }, zipFiles: {}, issues: [], brokenFiles: [] };
}

export async function restoreFromPoint(id: string): Promise<void> {
  const point = await db.restorePoints.get(id);
  if (!point) throw new BackupError(tr().backup.pointNotFound);
  const parsed = await parseRestorePoint(point);
  await restoreBackup(parsed, { createRestorePoint: true, reason: tr().backup.reasonBeforePoint });
}

export async function getRestorePointBlob(id: string): Promise<{ blob: Blob; ext: string } | null> {
  const p = await db.restorePoints.get(id);
  if (!p) return null;
  return { blob: p.blob, ext: p.format === 'data' ? 'json' : 'zip' };
}

export async function deleteRestorePoint(id: string): Promise<void> {
  await db.restorePoints.delete(id);
}
