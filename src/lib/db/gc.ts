import { db } from './db';
import type { Reference } from '../types';

/**
 * Delete stored images that nothing points to any more. Images used as
 * inputs or outputs of design versions are kept so version history stays
 * complete even after a reference is removed from the library.
 */
export async function collectGarbage(): Promise<number> {
  return db.transaction('rw', [db.images, db.references, db.versions], async () => {
    const used = new Set<string>();
    await db.references.each((r) => used.add(r.imageId));
    await db.versions.each((v) => {
      if (v.imageId) used.add(v.imageId);
      for (const i of v.inputImages) if (i.imageId) used.add(i.imageId);
    });
    const all = (await db.images.toCollection().primaryKeys()) as string[];
    const orphan = all.filter((id) => !used.has(id));
    if (orphan.length) await db.images.bulkDelete(orphan);
    return orphan.length;
  });
}

/** A reference with no remaining links to anything in the project. */
export function hasNoLinks(r: Reference): boolean {
  return (
    r.roomIds.length === 0 &&
    r.requirementIds.length === 0 &&
    r.versionIds.length === 0 &&
    r.wallKeys.length === 0 &&
    r.elementIds.length === 0 &&
    r.directionRoomIds.length === 0 &&
    r.libraryItemIds.length === 0
  );
}

/** Requirement attachments that no longer belong to any requirement or other context. */
export function isOrphanAttachment(r: Reference): boolean {
  return (
    r.origin === 'requirement' &&
    r.requirementIds.length === 0 &&
    r.versionIds.length === 0 &&
    r.wallKeys.length === 0 &&
    r.elementIds.length === 0 &&
    r.directionRoomIds.length === 0 &&
    r.libraryItemIds.length === 0
  );
}
