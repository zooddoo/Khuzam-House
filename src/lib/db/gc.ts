import type { Reference } from '../types';

/** A reference with no remaining links to anything in the project. */
export function hasNoLinks(r: Reference): boolean {
  return (
    r.roomIds.length === 0 &&
    r.requirementIds.length === 0 &&
    r.versionIds.length === 0 &&
    r.wallKeys.length === 0 &&
    r.elementIds.length === 0 &&
    r.directionRoomIds.length === 0 &&
    r.libraryItemIds.length === 0 &&
    (r.referenceIds ?? []).length === 0
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
    r.libraryItemIds.length === 0 &&
    (r.referenceIds ?? []).length === 0
  );
}
