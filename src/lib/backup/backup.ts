import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { z } from 'zod';
import { db } from '../db/db';
import { createRoomRecord, defaultChecks, emptyDirection, withSettingsDefaults } from '../db/factories';
import { syncWalls } from '../geometry/room';
import { newId, nowIso } from '../ids';
import { extensionFor } from '../images/ingest';
import type {
  AppSettings,
  BackupSummary,
  Comparison,
  DesignTask,
  DesignVersion,
  DirectionPreset,
  Floor,
  LibraryItem,
  Project,
  Reference,
  Requirement,
  RestorePoint,
  Room,
  StoredImage,
} from '../types';

export const BACKUP_APP = 'bait-khuzam-studio';
export const BACKUP_FORMAT = 1;
const MAX_RESTORE_POINTS = 5;

type ImageMeta = Omit<StoredImage, 'blob' | 'display' | 'thumb'> & {
  files: { original: string; display?: string; thumb?: string };
  sha256?: string;
};

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
  settings: Partial<AppSettings> | null;
  images: ImageMeta[];
}

export interface BackupManifest {
  app: string;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  includesApiKeys: boolean;
  checksums: 'sha-256' | 'none';
  summary: BackupSummary;
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

/**
 * Export the whole project to a ZIP: data.json, manifest.json and every
 * stored image (original bytes, unmodified) with SHA-256 checksums.
 */
export async function exportBackup(
  opts: { includeKeys?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ blob: Blob; summary: BackupSummary; filename: string }> {
  const [project, floors, rooms, requirements, references, versions, library, presets, comparisons, tasks, settingsRaw] = await Promise.all([
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
    db.settings.get('app'),
  ]);
  const settings = withSettingsDefaults(settingsRaw);
  const imageIds = (await db.images.toCollection().primaryKeys()) as string[];

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

  let summary: BackupSummary;
  try {
    const imagesMeta: ImageMeta[] = [];
    let i = 0;
    for (const id of imageIds) {
      const img = await db.images.get(id);
      opts.onProgress?.(++i, imageIds.length);
      if (!img) continue;
      const original = new Uint8Array(await img.blob.arrayBuffer());
      const files: ImageMeta['files'] = { original: `images/${id}/original.${extensionFor(img.type, img.name)}` };
      addStored(files.original, original);
      if (img.display) {
        files.display = `images/${id}/display.jpg`;
        addStored(files.display, new Uint8Array(await img.display.arrayBuffer()));
      }
      if (img.thumb) {
        const ext = extensionFor(img.thumb.type);
        files.thumb = `images/${id}/thumb.${ext === 'bin' ? 'webp' : ext}`;
        addStored(files.thumb, new Uint8Array(await img.thumb.arrayBuffer()));
      }
      const { blob: _b, display: _d, thumb: _t, ...meta } = img;
      imagesMeta.push({ ...meta, files, sha256: await sha256(original) });
    }
    const data: BackupData = {
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
      settings: opts.includeKeys ? settings : stripKeys(settings),
      images: imagesMeta,
    };
    summary = summarize(data);
    const manifest: BackupManifest = {
      app: BACKUP_APP,
      formatVersion: BACKUP_FORMAT,
      schemaVersion: db.verno,
      createdAt: nowIso(),
      includesApiKeys: !!opts.includeKeys,
      checksums: imagesMeta.some((m) => m.sha256) ? 'sha-256' : 'none',
      summary,
    };
    addDeflated('data.json', JSON.stringify(data));
    addDeflated('manifest.json', JSON.stringify(manifest, null, 2));
    addDeflated(
      'README.txt',
      'Bait Khuzam Studio backup.\nRestore it from Settings & Backup → Import backup.\n\ndata.json holds all project data; images/ holds every uploaded and generated image (original files, unmodified).\n',
    );
    zip.end();
  } catch (e) {
    zip.terminate();
    throw e;
  }
  await finished;
  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  return { blob, summary, filename: backupFilename() };
}

export function summarize(data: Pick<BackupData, 'project' | 'rooms' | 'requirements' | 'references' | 'images' | 'versions' | 'library'>): BackupSummary {
  return {
    createdAt: nowIso(),
    projectName: data.project?.name ?? 'Project',
    rooms: data.rooms.length,
    requirements: data.requirements.length,
    references: data.references.length,
    images: data.images.length,
    versions: data.versions.length,
    libraryItems: data.library.length,
  };
}

/* ------------------------------------------------------------------ */
/* Import                                                               */
/* ------------------------------------------------------------------ */

const withId = z.object({ id: z.string().min(1) }).passthrough();
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
  settings: z.object({}).passthrough().nullable(),
  images: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), files: z.object({ original: z.string() }).passthrough() }).passthrough()),
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
  files: Record<string, Uint8Array>;
  issues: string[];
  /** Image ids whose original file is missing or damaged. */
  brokenImages: string[];
}

export class BackupError extends Error {}

export async function readBackup(file: Blob): Promise<ParsedBackup> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupError('This file is not a valid ZIP backup.');
  }
  if (!files['manifest.json'] || !files['data.json']) throw new BackupError('This ZIP is not a Bait Khuzam Studio backup (manifest or data missing).');
  let manifest: BackupManifest;
  let data: BackupData;
  try {
    const m = manifestSchema.parse(JSON.parse(strFromU8(files['manifest.json'])));
    if (m.app !== BACKUP_APP) throw new BackupError('This backup was made by a different application.');
    if (m.formatVersion > BACKUP_FORMAT) throw new BackupError('This backup was made by a newer version of the studio. Update the app first.');
    manifest = m as unknown as BackupManifest;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('The backup manifest is damaged.');
  }
  try {
    const parsed = dataSchema.safeParse(JSON.parse(strFromU8(files['data.json'])));
    if (!parsed.success) throw new BackupError(`The backup data is incomplete or damaged (${parsed.error.issues[0]?.path.join('.') || 'structure'}).`);
    data = parsed.data as unknown as BackupData;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('The backup data could not be read.');
  }
  const issues: string[] = [];
  const brokenImages: string[] = [];
  for (const img of data.images) {
    const bytes = files[img.files.original];
    if (!bytes) {
      brokenImages.push(img.id);
      continue;
    }
    if (img.sha256) {
      const h = await sha256(bytes);
      if (h && h !== img.sha256) brokenImages.push(img.id);
    }
  }
  if (brokenImages.length) issues.push(`${brokenImages.length} image(s) are missing or failed their checksum and will be skipped.`);
  const imageIds = new Set(data.images.map((i) => i.id));
  const danglingRefs = data.references.filter((r) => !imageIds.has(r.imageId)).length;
  if (danglingRefs) issues.push(`${danglingRefs} reference(s) point to images not in the backup.`);
  return { manifest, data, files, issues, brokenImages };
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

/**
 * Replace the current project with a parsed backup. API keys on this device
 * are kept unless the backup includes keys and `useBackupKeys` is set.
 */
export async function restoreBackup(parsed: ParsedBackup, opts: { createRestorePoint: boolean; useBackupKeys?: boolean; reason?: string }): Promise<void> {
  if (opts.createRestorePoint) await createRestorePoint(opts.reason ?? 'Before restoring a backup');
  const { data, files } = parsed;
  const broken = new Set(parsed.brokenImages);
  const images: StoredImage[] = data.images
    .filter((m) => !broken.has(m.id))
    .map((m) => {
      const { files: f, sha256: _s, ...meta } = m;
      const original = files[f.original];
      const display = f.display ? files[f.display] : undefined;
      const thumb = f.thumb ? files[f.thumb] : undefined;
      return {
        ...meta,
        blob: new Blob([original as BlobPart], { type: m.type }),
        display: display ? new Blob([display as BlobPart], { type: 'image/jpeg' }) : null,
        thumb: thumb ? new Blob([thumb as BlobPart], { type: f.thumb?.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' }) : null,
      };
    });

  const current = withSettingsDefaults(await db.settings.get('app'));
  const incoming = withSettingsDefaults((data.settings ?? undefined) as Partial<AppSettings> | undefined);
  const settings: AppSettings = {
    ...incoming,
    imageProvider: {
      ...incoming.imageProvider,
      keys: opts.useBackupKeys && parsed.manifest.includesApiKeys ? incoming.imageProvider.keys : current.imageProvider.keys,
    },
    textProvider: {
      ...incoming.textProvider,
      keys: opts.useBackupKeys && parsed.manifest.includesApiKeys ? incoming.textProvider.keys : current.textProvider.keys,
    },
  };

  await db.transaction(
    'rw',
    [db.project, db.floors, db.rooms, db.requirements, db.references, db.images, db.versions, db.library, db.presets, db.comparisons, db.tasks, db.settings],
    async () => {
      await Promise.all([
        db.project.clear(),
        db.floors.clear(),
        db.rooms.clear(),
        db.requirements.clear(),
        db.references.clear(),
        db.images.clear(),
        db.versions.clear(),
        db.library.clear(),
        db.presets.clear(),
        db.comparisons.clear(),
        db.tasks.clear(),
      ]);
      const now = nowIso();
      await db.project.put(
        data.project ?? {
          id: 'project',
          name: 'Bait Khuzam',
          location: 'Riyadh, Saudi Arabia',
          description: '',
          coverReferenceId: null,
          createdAt: now,
          updatedAt: now,
        },
      );
      await db.floors.bulkAdd(data.floors);
      await db.rooms.bulkAdd(data.rooms.map(normalizeRoom));
      await db.requirements.bulkAdd(data.requirements);
      await db.references.bulkAdd(data.references);
      await db.images.bulkAdd(images);
      await db.versions.bulkAdd(data.versions);
      await db.library.bulkAdd(data.library);
      await db.presets.bulkAdd(data.presets);
      await db.comparisons.bulkAdd(data.comparisons);
      await db.tasks.bulkAdd(data.tasks);
      await db.settings.put(settings);
    },
  );
}

export async function createRestorePoint(reason: string): Promise<RestorePoint> {
  const { blob, summary } = await exportBackup({ includeKeys: false });
  const point: RestorePoint = { id: newId('rp'), createdAt: nowIso(), reason, size: blob.size, blob, summary };
  await db.restorePoints.add(point);
  const all = await db.restorePoints.orderBy('createdAt').toArray();
  const excess = all.length - MAX_RESTORE_POINTS;
  if (excess > 0) await db.restorePoints.bulkDelete(all.slice(0, excess).map((p) => p.id));
  return point;
}

export async function restoreFromPoint(id: string): Promise<void> {
  const point = await db.restorePoints.get(id);
  if (!point) throw new BackupError('Restore point not found.');
  const parsed = await readBackup(point.blob);
  await restoreBackup(parsed, { createRestorePoint: true, reason: 'Before returning to an earlier restore point' });
}

export async function getRestorePointBlob(id: string): Promise<Blob | null> {
  return (await db.restorePoints.get(id))?.blob ?? null;
}

export async function deleteRestorePoint(id: string): Promise<void> {
  await db.restorePoints.delete(id);
}
