import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { withSettingsDefaults } from '../db/factories';
import type { ID } from '../types';

export function useProject() {
  return useLiveQuery(() => db.project.get('project'), []);
}

export function useSettings() {
  const raw = useLiveQuery(async () => (await db.settings.get('app')) ?? null, []);
  return raw === undefined ? undefined : withSettingsDefaults(raw ?? undefined);
}

export function useRooms() {
  return useLiveQuery(() => db.rooms.orderBy('order').toArray(), []);
}

export function useRoom(id: ID | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.rooms.get(id)) ?? null) : null), [id]);
}

export function useFloors() {
  return useLiveQuery(() => db.floors.orderBy('order').toArray(), []);
}

export function useRequirements(roomId: ID | null | undefined) {
  return useLiveQuery(async () => (roomId ? db.requirements.where('roomId').equals(roomId).sortBy('order') : []), [roomId]);
}

export function useAllRequirements() {
  return useLiveQuery(() => db.requirements.toArray(), []);
}

export function useReference(id: ID | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.references.get(id)) ?? null) : null), [id]);
}

export function useReferences() {
  return useLiveQuery(() => db.references.orderBy('createdAt').reverse().toArray(), []);
}

/** Every reference linked to a room in any way (room, direction, requirement, wall, element). */
export function useRoomReferences(roomId: ID | null | undefined) {
  return useLiveQuery(async () => {
    if (!roomId) return [];
    const room = await db.rooms.get(roomId);
    const reqIds = (await db.requirements.where('roomId').equals(roomId).primaryKeys()) as ID[];
    const elementIds = new Set(room?.elements.map((e) => e.id) ?? []);
    const reqSet = new Set(reqIds);
    const all = await db.references.toArray();
    return all
      .filter(
        (r) =>
          r.roomIds.includes(roomId) ||
          r.directionRoomIds.includes(roomId) ||
          r.requirementIds.some((x) => reqSet.has(x)) ||
          r.wallKeys.some((k) => k.startsWith(`${roomId}:`)) ||
          r.elementIds.some((x) => elementIds.has(x)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [roomId]);
}

export function useVersions(roomId?: ID | null) {
  return useLiveQuery(async () => {
    const list = roomId ? await db.versions.where('roomId').equals(roomId).toArray() : await db.versions.toArray();
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [roomId]);
}

export function useVersion(id: ID | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.versions.get(id)) ?? null) : null), [id]);
}

export function useLibrary() {
  return useLiveQuery(() => db.library.orderBy('updatedAt').reverse().toArray(), []);
}

export function usePresets() {
  return useLiveQuery(() => db.presets.orderBy('order').toArray(), []);
}

export function useComparisons() {
  return useLiveQuery(() => db.comparisons.orderBy('updatedAt').reverse().toArray(), []);
}

export function useComparison(id: ID | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.comparisons.get(id)) ?? null) : null), [id]);
}

export function useTasks() {
  return useLiveQuery(() => db.tasks.orderBy('createdAt').toArray(), []);
}

export function useImageMeta(id: ID | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.files.get(id)) ?? null) : null), [id]);
}

/** File metadata for many ids at once (attachment lists). */
export function useFilesMap() {
  return useLiveQuery(async () => {
    const all = await db.files.toArray();
    return new Map(all.map((f) => [f.id, f]));
  }, []);
}

export function useTrash() {
  return useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), []);
}

export function useTranslations() {
  return useLiveQuery(async () => {
    const all = await db.translations.toArray();
    return new Map(all.map((t) => [t.id, t]));
  }, []);
}

export function useRestorePoints() {
  return useLiveQuery(async () => {
    const list = await db.restorePoints.orderBy('createdAt').reverse().toArray();
    return list.map(({ blob: _blob, ...rest }) => rest);
  }, []);
}
