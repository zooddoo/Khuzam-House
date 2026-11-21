import { produce } from 'immer';
import { db } from './db';
import { createRoomRecord } from './factories';
import { collectGarbage, hasNoLinks } from './gc';
import { syncWalls } from '../geometry/room';
import { newId, nowIso } from '../ids';
import type { ID, Room, RoomStatus, RoomType } from '../types';
import { getSettings } from './settings';

export async function addRoom(input: { name: string; type: RoomType; floorId?: ID | null; description?: string }): Promise<Room> {
  const settings = await getSettings();
  const last = await db.rooms.orderBy('order').last();
  const room = createRoomRecord(
    {
      name: input.name.trim(),
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
 * Delete a room with its requirements and design versions. References are
 * unlinked; images used only by this room are deleted when `deleteImages` is true.
 */
export async function deleteRoom(roomId: ID, opts: { deleteImages: boolean }): Promise<void> {
  await db.transaction('rw', [db.rooms, db.requirements, db.versions, db.references, db.library, db.tasks, db.comparisons, db.project, db.images], async () => {
    const room = await db.rooms.get(roomId);
    if (!room) return;
    const reqIds = (await db.requirements.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const versionIds = (await db.versions.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const elementIds = new Set(room.elements.map((e) => e.id));
    const reqSet = new Set(reqIds);
    const verSet = new Set(versionIds);

    const refs = await db.references.toArray();
    const deletedRefs = new Set<ID>();
    for (const r of refs) {
      const touched =
        r.roomIds.includes(roomId) ||
        r.directionRoomIds.includes(roomId) ||
        r.requirementIds.some((x) => reqSet.has(x)) ||
        r.versionIds.some((x) => verSet.has(x)) ||
        r.wallKeys.some((k) => k.startsWith(`${roomId}:`)) ||
        r.elementIds.some((x) => elementIds.has(x));
      if (!touched) continue;
      const next = {
        ...r,
        roomIds: r.roomIds.filter((x) => x !== roomId),
        directionRoomIds: r.directionRoomIds.filter((x) => x !== roomId),
        requirementIds: r.requirementIds.filter((x) => !reqSet.has(x)),
        versionIds: r.versionIds.filter((x) => !verSet.has(x)),
        wallKeys: r.wallKeys.filter((k) => !k.startsWith(`${roomId}:`)),
        elementIds: r.elementIds.filter((x) => !elementIds.has(x)),
        updatedAt: nowIso(),
      };
      const remove = (opts.deleteImages && hasNoLinks(next)) || (r.kind === 'generated' && next.versionIds.length === 0);
      if (remove) {
        deletedRefs.add(r.id);
        await db.references.delete(r.id);
      } else {
        await db.references.put(next);
      }
    }

    await db.requirements.bulkDelete(reqIds);
    await db.versions.bulkDelete(versionIds);
    await db.rooms.delete(roomId);

    await db.library
      .where('roomIds')
      .equals(roomId)
      .modify((item) => {
        item.roomIds = item.roomIds.filter((x) => x !== roomId);
      });
    await db.tasks.where('roomId').equals(roomId).modify({ roomId: null });
    await db.comparisons.where('roomId').equals(roomId).delete();
    await db.comparisons.toCollection().modify((c) => {
      c.items = c.items.filter((it) => (it.type === 'version' ? !verSet.has(it.id) : !deletedRefs.has(it.id)));
    });
    const project = await db.project.get('project');
    if (project?.coverReferenceId && deletedRefs.has(project.coverReferenceId)) {
      await db.project.update('project', { coverReferenceId: null });
    }
  });
  await collectGarbage();
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
