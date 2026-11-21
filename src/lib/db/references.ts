import { db } from './db';
import { createReferenceRecord } from './factories';
import { collectGarbage, isOrphanAttachment } from './gc';
import { ingestImage, ImageError } from '../images/ingest';
import { nowIso } from '../ids';
import type { ID, Reference, StoredImage } from '../types';

export type LinkField = 'roomIds' | 'requirementIds' | 'versionIds' | 'wallKeys' | 'elementIds' | 'directionRoomIds' | 'libraryItemIds';

export interface AddResult {
  added: Reference[];
  errors: string[];
}

/**
 * Store uploaded files (originals untouched) and create library references
 * with the given defaults/links. Each image and its reference are written in
 * one transaction so clean-up never sees a half-created item.
 */
export async function addReferencesFromFiles(files: File[] | Blob[], defaults: Partial<Reference> = {}, names?: string[]): Promise<AddResult> {
  const added: Reference[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = names?.[i] ?? (f instanceof File ? f.name : `image-${i + 1}`);
    let img: StoredImage;
    try {
      img = await ingestImage(f, name);
    } catch (e) {
      errors.push(e instanceof ImageError ? e.message : `${name}: ${(e as Error).message}`);
      continue;
    }
    const ref = createReferenceRecord(img.id, structuredClone(defaults));
    await db.transaction('rw', [db.images, db.references], async () => {
      await db.images.add(img);
      await db.references.add(ref);
    });
    added.push(ref);
  }
  return { added, errors };
}

/** Store an already-encoded image (e.g. a generated output) with its reference. */
export async function addReferenceFromBlob(blob: Blob, name: string, defaults: Partial<Reference>): Promise<{ ref: Reference; image: StoredImage }> {
  const image = await ingestImage(blob, name);
  const ref = createReferenceRecord(image.id, structuredClone(defaults));
  await db.transaction('rw', [db.images, db.references], async () => {
    await db.images.add(image);
    await db.references.add(ref);
  });
  return { ref, image };
}

export async function updateReference(id: ID, patch: Partial<Reference>): Promise<void> {
  await db.references.update(id, { ...patch, updatedAt: nowIso() });
}

export async function linkReferences(ids: ID[], field: LinkField, value: string): Promise<void> {
  await db.transaction('rw', db.references, async () => {
    for (const id of ids) {
      const r = await db.references.get(id);
      if (!r || r[field].includes(value)) continue;
      await db.references.put({ ...r, [field]: [...r[field], value], updatedAt: nowIso() });
    }
  });
}

export async function unlinkReferences(ids: ID[], field: LinkField, value: string): Promise<void> {
  await db.transaction('rw', db.references, async () => {
    for (const id of ids) {
      const r = await db.references.get(id);
      if (!r || !r[field].includes(value)) continue;
      await db.references.put({ ...r, [field]: r[field].filter((x) => x !== value), updatedAt: nowIso() });
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

/**
 * Delete references from the library. Images used by design versions stay
 * stored so version history remains complete.
 */
export async function deleteReferences(ids: ID[]): Promise<void> {
  const set = new Set(ids);
  await db.transaction('rw', [db.references, db.rooms, db.requirements, db.project, db.floors, db.comparisons, db.versions], async () => {
    await db.references.bulkDelete(ids);
    await db.rooms.filter((r) => !!r.coverReferenceId && set.has(r.coverReferenceId)).modify({ coverReferenceId: null });
    await db.requirements.filter((r) => !!r.primaryReferenceId && set.has(r.primaryReferenceId)).modify({ primaryReferenceId: null });
    const project = await db.project.get('project');
    if (project?.coverReferenceId && set.has(project.coverReferenceId)) await db.project.update('project', { coverReferenceId: null });
    await db.floors.filter((f) => !!f.planReferenceId && set.has(f.planReferenceId)).modify({ planReferenceId: null, planCalibration: null });
    await db.comparisons.toCollection().modify((c) => {
      c.items = c.items.filter((it) => !(it.type === 'reference' && set.has(it.id)));
    });
    await db.versions.filter((v) => !!v.referenceId && set.has(v.referenceId)).modify({ referenceId: null });
  });
  await collectGarbage();
}

/** Remove an attachment from a requirement; deletes it if it was only attached there. */
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

export async function getImage(id: ID): Promise<StoredImage | undefined> {
  return db.images.get(id);
}
