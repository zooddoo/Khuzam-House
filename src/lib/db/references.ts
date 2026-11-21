import { db } from './db';
import { createReferenceRecord } from './factories';
import { isOrphanAttachment } from './gc';
import { getSettings } from './settings';
import { moveToTrash } from './trash';
import { FileError, ingestFile, DEFAULT_MAX_UPLOAD_MB } from '../files/ingest';
import { putIngested } from '../files/repo';
import { nowIso } from '../ids';
import { msgs } from '../../i18n/messages';
import type { ID, Reference, StoredFile } from '../types';

export type LinkField = 'roomIds' | 'requirementIds' | 'versionIds' | 'wallKeys' | 'elementIds' | 'directionRoomIds' | 'libraryItemIds' | 'referenceIds';

export interface AddResult {
  added: Reference[];
  errors: string[];
}

export interface AddOptions {
  /** Only accept photos (e.g. room photos used as AI inputs). */
  requireImage?: boolean;
  /** Called after each file with the number processed so far. */
  onProgress?: (done: number, total: number) => void;
}

export async function maxUploadBytes(): Promise<number> {
  const s = await getSettings();
  return Math.max(1, s.maxUploadMb || DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}

/**
 * Store picked / dropped / pasted files (any type, originals untouched) and
 * create a reference for each with the given defaults and links. The file,
 * its bytes and its reference are written in one transaction. Problems are
 * returned per file — nothing fails silently.
 */
export async function addReferencesFromFiles(files: File[] | Blob[], defaults: Partial<Reference> = {}, names?: string[], opts: AddOptions = {}): Promise<AddResult> {
  const added: Reference[] = [];
  const errors: string[] = [];
  const maxBytes = await maxUploadBytes();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = names?.[i] ?? (f instanceof File && f.name ? f.name : `file-${i + 1}`);
    try {
      const ing = await ingestFile(f, name, { maxBytes, requireImage: opts.requireImage });
      const ref = createReferenceRecord(ing.file.id, {
        ...(ing.file.kind === 'image' ? {} : { kind: ing.file.kind === 'drawing' ? 'plan' : 'document' }),
        ...structuredClone(defaults),
      });
      await db.transaction('rw', [db.files, db.blobs, db.references], async () => {
        await putIngested(ing);
        await db.references.add(ref);
      });
      added.push(ref);
    } catch (e) {
      errors.push(e instanceof FileError ? e.message : `${name}: ${(e as Error).message || String(e)}`);
    }
    opts.onProgress?.(i + 1, files.length);
  }
  return { added, errors };
}

/** Store an already-encoded image (e.g. a generated or imported design) with its reference. */
export async function addReferenceFromBlob(blob: Blob, name: string, defaults: Partial<Reference>): Promise<{ ref: Reference; image: StoredFile }> {
  const ing = await ingestFile(blob, name, { maxBytes: await maxUploadBytes(), requireImage: true });
  const ref = createReferenceRecord(ing.file.id, structuredClone(defaults));
  await db.transaction('rw', [db.files, db.blobs, db.references], async () => {
    await putIngested(ing);
    await db.references.add(ref);
  });
  return { ref, image: ing.file };
}

export async function updateReference(id: ID, patch: Partial<Reference>): Promise<void> {
  await db.references.update(id, { ...patch, updatedAt: nowIso() });
}

export async function linkReferences(ids: ID[], field: LinkField, value: string): Promise<void> {
  await db.transaction('rw', db.references, async () => {
    for (const id of ids) {
      const r = await db.references.get(id);
      if (!r) continue;
      const list = (r[field] as string[] | undefined) ?? [];
      if (list.includes(value)) continue;
      await db.references.put({ ...r, [field]: [...list, value], updatedAt: nowIso() });
    }
  });
}

export async function unlinkReferences(ids: ID[], field: LinkField, value: string): Promise<void> {
  await db.transaction('rw', db.references, async () => {
    for (const id of ids) {
      const r = await db.references.get(id);
      if (!r) continue;
      const list = (r[field] as string[] | undefined) ?? [];
      if (!list.includes(value)) continue;
      await db.references.put({ ...r, [field]: list.filter((x) => x !== value), updatedAt: nowIso() });
    }
  });
}

export async function addTags(ids: ID[], tags: string[]): Promise<void> {
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  await db.transaction('rw', db.references, async () => {
    for (const id of ids) {
      const r = await db.references.get(id);
      if (!r) continue;
      await db.references.put({ ...r, tags: Array.from(new Set([...r.tags, ...clean])), updatedAt: nowIso() });
    }
  });
}

/** Where a reference is used, for delete confirmations. */
export async function referenceUsage(id: ID): Promise<{ versions: number; covers: number; requirements: number }> {
  const r = await db.references.get(id);
  if (!r) return { versions: 0, covers: 0, requirements: 0 };
  const versions = await db.versions.filter((v) => v.referenceId === id || v.inputImages.some((i) => i.referenceId === id)).count();
  const covers = (await db.rooms.filter((room) => room.coverReferenceId === id).count()) + ((await db.project.get('project'))?.coverReferenceId === id ? 1 : 0);
  return { versions, covers, requirements: r.requirementIds.length };
}

async function referenceLabel(ids: ID[]): Promise<{ en: string; ar: string }> {
  if (ids.length === 1) {
    const r = await db.references.get(ids[0]);
    const f = r ? await db.files.get(r.imageId) : undefined;
    const name = r?.title || f?.name || msgs('en').enums.trashKind.reference;
    return { en: name, ar: r?.title || f?.name || msgs('ar').enums.trashKind.reference };
  }
  return { en: msgs('en').common.file(ids.length), ar: msgs('ar').common.file(ids.length) };
}

/**
 * Move references (attachments) to Recently Deleted. Their files stay stored
 * until the entry is deleted permanently, so design versions keep their images.
 */
export async function deleteReferences(ids: ID[]): Promise<void> {
  if (!ids.length) return;
  const label = await referenceLabel(ids);
  const first = await db.references.get(ids[0]);
  await moveToTrash('reference', label, first?.roomIds[0] ?? null, async (rec) => {
    for (const id of ids) await rec.remove('references', id);
  });
}

/** Remove an attachment from a requirement; it goes to Recently Deleted if it was only attached there. */
export async function detachFromRequirement(refId: ID, requirementId: ID): Promise<void> {
  const r = await db.references.get(refId);
  if (!r) return;
  const next = { ...r, requirementIds: r.requirementIds.filter((x) => x !== requirementId), updatedAt: nowIso() };
  await db.transaction('rw', [db.references, db.requirements], async () => {
    await db.references.put(next);
    const req = await db.requirements.get(requirementId);
    if (req?.primaryReferenceId === refId) await db.requirements.update(requirementId, { primaryReferenceId: null });
  });
  if (isOrphanAttachment(next)) await deleteReferences([refId]);
}
