import { db } from './db';
import { collectGarbage, hasNoLinks } from './gc';
import { originalPreset } from './presets';
import { newId, nowIso } from '../ids';
import type { Comparison, DesignDirectionFields, DesignTask, DirectionPreset, Floor, ID, LibraryItem, Project } from '../types';

/* Project ------------------------------------------------------------ */

export async function updateProject(patch: Partial<Project>): Promise<void> {
  await db.project.update('project', { ...patch, updatedAt: nowIso() });
}

/* Floors ------------------------------------------------------------- */

export async function addFloor(name: string): Promise<Floor> {
  const last = await db.floors.orderBy('order').last();
  const now = nowIso();
  const floor: Floor = {
    id: newId('floor'),
    name: name.trim() || 'Floor',
    order: (last?.order ?? -1) + 1,
    planReferenceId: null,
    planCalibration: null,
    planOpacity: 0.55,
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  await db.floors.add(floor);
  return floor;
}

export async function updateFloor(id: ID, patch: Partial<Floor>): Promise<void> {
  await db.floors.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteFloor(id: ID): Promise<void> {
  await db.transaction('rw', [db.floors, db.rooms], async () => {
    await db.floors.delete(id);
    await db.rooms.where('floorId').equals(id).modify({ floorId: null, planPlacement: null });
  });
}

export async function reorderFloors(ids: ID[]): Promise<void> {
  await db.transaction('rw', db.floors, async () => {
    await Promise.all(ids.map((id, i) => db.floors.update(id, { order: i })));
  });
}

/* Tasks -------------------------------------------------------------- */

export async function addTask(title: string, roomId: ID | null): Promise<DesignTask> {
  const task: DesignTask = { id: newId('task'), title: title.trim(), roomId, done: false, createdAt: nowIso(), doneAt: null };
  await db.tasks.add(task);
  return task;
}

export async function toggleTask(id: ID, done: boolean): Promise<void> {
  await db.tasks.update(id, { done, doneAt: done ? nowIso() : null });
}

export async function deleteTask(id: ID): Promise<void> {
  await db.tasks.delete(id);
}

/* Comparisons -------------------------------------------------------- */

export async function saveComparison(c: Omit<Comparison, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID }): Promise<Comparison> {
  const now = nowIso();
  if (c.id) {
    const existing = await db.comparisons.get(c.id);
    if (existing) {
      const next = { ...existing, ...c, id: existing.id, updatedAt: now };
      await db.comparisons.put(next);
      return next;
    }
  }
  const created: Comparison = { ...c, id: newId('cmp'), createdAt: now, updatedAt: now };
  await db.comparisons.add(created);
  return created;
}

export async function deleteComparison(id: ID): Promise<void> {
  await db.comparisons.delete(id);
}

/* Presets ------------------------------------------------------------ */

export async function savePreset(p: { id?: ID; name: string; summary: string; fields: DesignDirectionFields }): Promise<DirectionPreset> {
  const now = nowIso();
  if (p.id) {
    const existing = await db.presets.get(p.id);
    if (existing) {
      const next = { ...existing, name: p.name, summary: p.summary, fields: structuredClone(p.fields), updatedAt: now };
      await db.presets.put(next);
      return next;
    }
  }
  const last = await db.presets.orderBy('order').last();
  const created: DirectionPreset = {
    id: newId('preset'),
    name: p.name,
    summary: p.summary,
    builtIn: false,
    fields: structuredClone(p.fields),
    order: (last?.order ?? -1) + 1,
    updatedAt: now,
  };
  await db.presets.add(created);
  return created;
}

export async function deletePreset(id: ID): Promise<void> {
  await db.presets.delete(id);
}

export async function resetPreset(id: ID): Promise<boolean> {
  const orig = originalPreset(id);
  if (!orig) return false;
  await db.presets.update(id, { name: orig.name, summary: orig.summary, fields: structuredClone(orig.fields), updatedAt: nowIso() });
  return true;
}

/* Library ------------------------------------------------------------ */

export async function saveLibraryItem(item: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID }): Promise<LibraryItem> {
  const now = nowIso();
  if (item.id) {
    const existing = await db.library.get(item.id);
    if (existing) {
      const next = { ...existing, ...item, id: existing.id, updatedAt: now };
      await db.library.put(next);
      return next;
    }
  }
  const created: LibraryItem = { ...item, id: newId('lib'), createdAt: now, updatedAt: now };
  await db.library.add(created);
  return created;
}

export async function deleteLibraryItem(id: ID): Promise<void> {
  await db.transaction('rw', [db.library, db.references, db.rooms], async () => {
    await db.library.delete(id);
    const refs = await db.references.where('libraryItemIds').equals(id).toArray();
    for (const r of refs) {
      const next = { ...r, libraryItemIds: r.libraryItemIds.filter((x) => x !== id) };
      if (hasNoLinks(next)) await db.references.delete(r.id);
      else await db.references.put(next);
    }
    // Furniture placed from this item keeps its dimensions; only the link is cleared.
    await db.rooms.toCollection().modify((room) => {
      for (const f of room.layout.items) if (f.libraryItemId === id) f.libraryItemId = null;
    });
  });
  await collectGarbage();
}
