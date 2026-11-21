import { produce } from 'immer';
import { db } from './db';
import { createRoomRecord } from './factories';
import { moveToTrash, type TrashRecorder } from './trash';
import { syncWalls } from '../geometry/room';
import { newId, nowIso } from '../ids';
import type { ID, Room, RoomStatus, RoomType } from '../types';
import { getSettings } from './settings';

export async function addRoom(input: { name: string; nameAr?: string; type: RoomType; floorId?: ID | null; description?: string }): Promise<Room> {
  const settings = await getSettings();
  const last = await db.rooms.orderBy('order').last();
  const room = createRoomRecord(
    {
      name: input.name.trim(),
      nameAr: input.nameAr?.trim() || undefined,
      type: input.type,
      floorId: input.floorId ?? null,
      description: input.description ?? '',
      displayUnit: settings.defaultUnit,
    },
    (last?.order ?? -1) + 1,
  );
  room.layout.clearanceMm = settings.defaultClearanceMm;
  await db.rooms.add(room);
  return room;
}

/** Apply an in-place edit to a room. Walls are re-synced with the geometry afterwards. */
export async function updateRoom(id: ID, recipe: (draft: Room) => void): Promise<void> {
  await db.transaction('rw', db.rooms, async () => {
    const room = await db.rooms.get(id);
    if (!room) throw new Error('Room not found');
    const next = produce(room, (d) => {
      recipe(d);
    });
    if (next === room) return;
    await db.rooms.put({ ...next, walls: syncWalls(next.geometry, next.walls), updatedAt: nowIso() });
  });
}

export async function patchRoom(id: ID, patch: Partial<Room>): Promise<void> {
  await updateRoom(id, (d) => {
    Object.assign(d, patch);
  });
}

const EARLY: RoomStatus[] = ['not-started', 'requirements-added', 'ready'];

/** Move a room forward automatically only from early statuses — never backwards over user decisions. */
export async function advanceRoomStatus(id: ID, to: RoomStatus): Promise<void> {
  const room = await db.rooms.get(id);
  if (!room) return;
  const order: RoomStatus[] = ['not-started', 'requirements-added', 'ready', 'designing'];
  if (EARLY.includes(room.status) && order.indexOf(to) > order.indexOf(room.status)) {
    await db.rooms.update(id, { status: to, updatedAt: nowIso() });
  }
}

export async function setRoomCover(roomId: ID, referenceId: ID | null): Promise<void> {
  await patchRoom(roomId, { coverReferenceId: referenceId });
}

export async function reorderRooms(ids: ID[]): Promise<void> {
  await db.transaction('rw', db.rooms, async () => {
    await Promise.all(ids.map((id, i) => db.rooms.update(id, { order: i })));
  });
}

export interface RoomDeletionImpact {
  requirements: number;
  versions: number;
  exclusiveImages: number;
}

export async function roomDeletionImpact(roomId: ID): Promise<RoomDeletionImpact> {
  const [requirements, versions, refs] = await Promise.all([
    db.requirements.where('roomId').equals(roomId).count(),
    db.versions.where('roomId').equals(roomId).count(),
    db.references.where('roomIds').equals(roomId).toArray(),
  ]);
  const exclusiveImages = refs.filter((r) => r.roomIds.length === 1).length;
  return { requirements, versions, exclusiveImages };
}

/**
 * References that belong only to deleted things go to Recently Deleted with
 * them. References still used elsewhere are kept untouched (their link to
 * the deleted item simply shows as missing until it is restored).
 */
export async function trashOrphanedReferences(
  rec: TrashRecorder,
  gone: { rooms?: Set<ID>; requirements?: Set<ID>; versions?: Set<ID>; elements?: Set<ID>; library?: Set<ID>; references?: Set<ID> },
): Promise<void> {
  const rooms = gone.rooms ?? new Set<ID>();
  const reqs = gone.requirements ?? new Set<ID>();
  const vers = gone.versions ?? new Set<ID>();
  const els = gone.elements ?? new Set<ID>();
  const libs = gone.library ?? new Set<ID>();
  const refsGone = gone.references ?? new Set<ID>();
  const all = await db.references.toArray();
  for (const r of all) {
    if (rec.has('references', r.id)) continue;
    const touched =
      r.roomIds.some((x) => rooms.has(x)) ||
      r.directionRoomIds.some((x) => rooms.has(x)) ||
      r.requirementIds.some((x) => reqs.has(x)) ||
      r.versionIds.some((x) => vers.has(x)) ||
      r.wallKeys.some((k) => rooms.has(k.split(':')[0])) ||
      r.elementIds.some((x) => els.has(x)) ||
      r.libraryItemIds.some((x) => libs.has(x)) ||
      (r.referenceIds ?? []).some((x) => refsGone.has(x));
    if (!touched) continue;
    const live =
      r.roomIds.some((x) => !rooms.has(x)) ||
      r.directionRoomIds.some((x) => !rooms.has(x)) ||
      r.requirementIds.some((x) => !reqs.has(x)) ||
      r.versionIds.some((x) => !vers.has(x)) ||
      r.wallKeys.some((k) => !rooms.has(k.split(':')[0])) ||
      r.elementIds.some((x) => !els.has(x)) ||
      r.libraryItemIds.some((x) => !libs.has(x)) ||
      (r.referenceIds ?? []).some((x) => !refsGone.has(x));
    if (!live) await rec.remove('references', r.id);
  }
}

/**
 * Move a room to Recently Deleted together with its requirements, design
 * versions, comparisons, tasks and the attachments that belong only to it.
 * Everything comes back with "Restore".
 */
export async function deleteRoom(roomId: ID): Promise<void> {
  const room = await db.rooms.get(roomId);
  if (!room) return;
  await moveToTrash('room', { en: room.name || room.nameAr || 'Room', ar: room.nameAr || room.name }, roomId, async (rec) => {
    const reqIds = (await db.requirements.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const versionIds = (await db.versions.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const comparisonIds = (await db.comparisons.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const taskIds = (await db.tasks.where('roomId').equals(roomId).primaryKeys()) as ID[];
    await rec.remove('rooms', roomId);
    for (const id of reqIds) await rec.remove('requirements', id);
    for (const id of versionIds) await rec.remove('versions', id);
    for (const id of comparisonIds) await rec.remove('comparisons', id);
    for (const id of taskIds) await rec.remove('tasks', id);
    await trashOrphanedReferences(rec, {
      rooms: new Set([roomId]),
      requirements: new Set(reqIds),
      versions: new Set(versionIds),
      elements: new Set(room.elements.map((e) => e.id)),
    });
  });
}

/** Copy a room's spatial data, requirements and design direction. Versions are not copied. */
export async function duplicateRoom(roomId: ID): Promise<Room> {
  return db.transaction('rw', [db.rooms, db.requirements, db.references], async () => {
    const src = await db.rooms.get(roomId);
    if (!src) throw new Error('Room not found');
    const last = await db.rooms.orderBy('order').last();
    const now = nowIso();
    const elementMap = new Map<ID, ID>();
    const copy: Room = structuredClone(src);
    copy.id = newId('room');
    copy.name = `${src.name} (copy)`;
    if (src.nameAr) copy.nameAr = `${src.nameAr} (نسخة)`;
    copy.order = (last?.order ?? 0) + 1;
    copy.approvedVersionId = null;
    copy.planPlacement = null;
    copy.lastGeneration = null;
    copy.status = ['designing', 'review', 'approved', 'needs-revision'].includes(src.status) ? 'ready' : src.status;
    copy.elements = copy.elements.map((e) => {
      const id = newId('el');
      elementMap.set(e.id, id);
      return { ...e, id };
    });
    copy.layout.items = copy.layout.items.map((f) => ({ ...f, id: newId('f') }));
    copy.createdAt = now;
    copy.updatedAt = now;
    await db.rooms.add(copy);

    const reqs = await db.requirements.where('roomId').equals(roomId).toArray();
    const reqMap = new Map<ID, ID>();
    for (const r of reqs) {
      const id = newId('req');
      reqMap.set(r.id, id);
      await db.requirements.add({ ...r, id, roomId: copy.id, createdAt: now, updatedAt: now });
    }

    const refs = await db.references.toArray();
    for (const r of refs) {
      const addRoom = r.roomIds.includes(roomId);
      const addDirection = r.directionRoomIds.includes(roomId);
      const newReqs = r.requirementIds.filter((x) => reqMap.has(x)).map((x) => reqMap.get(x)!);
      const newWalls = r.wallKeys.filter((k) => k.startsWith(`${roomId}:`)).map((k) => `${copy.id}:${k.slice(roomId.length + 1)}`);
      const newEls = r.elementIds.filter((x) => elementMap.has(x)).map((x) => elementMap.get(x)!);
      if (!addRoom && !addDirection && !newReqs.length && !newWalls.length && !newEls.length) continue;
      if (r.kind === 'generated') continue;
      await db.references.put({
        ...r,
        roomIds: addRoom ? [...r.roomIds, copy.id] : r.roomIds,
        directionRoomIds: addDirection ? [...r.directionRoomIds, copy.id] : r.directionRoomIds,
        requirementIds: [...r.requirementIds, ...newReqs],
        wallKeys: [...r.wallKeys, ...newWalls],
        elementIds: [...r.elementIds, ...newEls],
      });
    }
    // Primary references survive because the reference ids are shared.
    return copy;
  });
}
