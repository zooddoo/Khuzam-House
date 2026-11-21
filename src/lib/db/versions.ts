import { db } from './db';
import { addReferenceFromBlob } from './references';
import { moveToTrash } from './trash';
import { trashOrphanedReferences } from './rooms';
import { snapshotRequirements, snapshotRoom } from './snapshots';
import { advanceRoomStatus } from './rooms';
import { copyName, newId, nowIso } from '../ids';
import type { DesignVersion, ID, RoomStatus, VersionStatus } from '../types';

export type NewVersion = Omit<DesignVersion, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'roomId'>;

/** Create a new version with the next number for its room. Never overwrites earlier versions. */
export async function createVersion(roomId: ID, data: NewVersion): Promise<DesignVersion> {
  const version = await db.transaction('rw', db.versions, async () => {
    const existing = await db.versions.where('roomId').equals(roomId).toArray();
    const number = existing.reduce((m, v) => Math.max(m, v.number), 0) + 1;
    const now = nowIso();
    const v: DesignVersion = { ...data, id: newId('ver'), roomId, number, title: data.title || `Concept ${number}`, createdAt: now, updatedAt: now };
    await db.versions.add(v);
    return v;
  });
  if (data.origin === 'generated' || data.origin === 'imported') await advanceRoomStatus(roomId, 'designing');
  return version;
}

export async function updateVersion(id: ID, patch: Partial<DesignVersion>): Promise<void> {
  await db.versions.update(id, { ...patch, updatedAt: nowIso() });
}

/**
 * Change a version's status. Approving records it as the room's approved
 * design; other versions are left untouched.
 */
export async function setVersionStatus(id: ID, status: VersionStatus): Promise<void> {
  await db.transaction('rw', [db.versions, db.rooms], async () => {
    const v = await db.versions.get(id);
    if (!v) return;
    await db.versions.update(id, { status, updatedAt: nowIso() });
    const room = await db.rooms.get(v.roomId);
    if (!room) return;
    if (status === 'approved') {
      await db.rooms.update(room.id, { approvedVersionId: id, status: 'approved', updatedAt: nowIso() });
      return;
    }
    if (room.approvedVersionId === id) {
      const others = (await db.versions.where('roomId').equals(room.id).toArray())
        .filter((x) => x.id !== id && x.status === 'approved')
        .sort((a, b) => b.number - a.number);
      const nextStatus: RoomStatus = others.length ? 'approved' : status === 'rejected' ? 'needs-revision' : 'review';
      await db.rooms.update(room.id, { approvedVersionId: others[0]?.id ?? null, status: nextStatus, updatedAt: nowIso() });
    } else if (status === 'under-review' && ['designing', 'ready', 'requirements-added', 'not-started'].includes(room.status)) {
      await db.rooms.update(room.id, { status: 'review', updatedAt: nowIso() });
    }
  });
}

export async function duplicateVersion(id: ID): Promise<DesignVersion | null> {
  const src = await db.versions.get(id);
  if (!src) return null;
  const copy = await createVersion(src.roomId, {
    ...structuredClone(src),
    title: copyName(src.title),
    status: 'draft',
    origin: 'duplicate',
    basedOnVersionId: src.id,
    notes: src.notes ? `Duplicated from v${src.number}.\n\n${src.notes}` : `Duplicated from v${src.number}.`,
  });
  if (src.referenceId) {
    const ref = await db.references.get(src.referenceId);
    if (ref) await db.references.update(ref.id, { versionIds: [...ref.versionIds, copy.id] });
  }
  return copy;
}

/** Move a design version to Recently Deleted (with its design image if nothing else uses it). */
export async function deleteVersion(id: ID): Promise<void> {
  const v = await db.versions.get(id);
  if (!v) return;
  const label = { en: v.title || `v${v.number}`, ar: v.title || `الإصدار ${v.number}` };
  await moveToTrash('version', label, v.roomId, async (rec) => {
    await rec.remove('versions', id);
    await trashOrphanedReferences(rec, { versions: new Set([id]) });
    const room = await db.rooms.get(v.roomId);
    if (room?.approvedVersionId === id) {
      const others = (await db.versions.where('roomId').equals(room.id).toArray()).filter((x) => x.status === 'approved').sort((a, b) => b.number - a.number);
      await rec.setField('rooms', room.id, 'approvedVersionId', others[0]?.id ?? null);
      await rec.setField('rooms', room.id, 'status', others.length ? 'approved' : 'review');
    }
  });
}

/**
 * Add a design image created outside the app (e.g. by a designer) as a
 * version. It is clearly labelled "Imported", never "Generated".
 */
export async function importDesignImage(roomId: ID, file: File, title: string, notes: string): Promise<DesignVersion> {
  const room = await db.rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  const reqs = await db.requirements.where('roomId').equals(roomId).toArray();
  const refs = await db.references.where('roomIds').equals(roomId).toArray();
  const { ref, image } = await addReferenceFromBlob(file, file.name, {
    kind: 'generated',
    origin: 'imported',
    title: title || file.name,
    roomIds: [roomId],
  });
  const version = await createVersion(roomId, {
    title,
    status: 'under-review',
    origin: 'imported',
    imageId: image.id,
    referenceId: ref.id,
    prompt: '',
    settings: null,
    provider: null,
    inputImages: [],
    requirementsSnapshot: snapshotRequirements(reqs, refs),
    roomSnapshot: snapshotRoom(room),
    doNotChange: [],
    basedOnVersionId: null,
    notes,
  });
  await db.references.update(ref.id, { versionIds: [version.id] });
  return version;
}
