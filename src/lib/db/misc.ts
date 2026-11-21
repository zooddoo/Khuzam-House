import { db } from './db';
import { originalPreset } from './presets';
import { moveToTrash } from './trash';
import { trashOrphanedReferences } from './rooms';
import { msgs } from '../../i18n/messages';
import { newId, nowIso } from '../ids';
import type { Comparison, DesignDirectionFields, DesignTask, DirectionPreset, Floor, ID, LibraryItem, Project } from '../types';

/* Project ------------------------------------------------------------ */

export async function updateProject(patch: Partial<Project>): Promise<void> {
  await db.project.update('project', { ...patch, updatedAt: nowIso() });
}

/* Floors ------------------------------------------------------------- */

export async function addFloor(name: string, nameAr?: string): Promise<Floor> {
  const last = await db.floors.orderBy('order').last();
  const now = nowIso();
  const floor: Floor = {
    id: newId('floor'),
    name: name.trim() || nameAr?.trim() || 'Floor',
    nameAr: nameAr?.trim() || undefined,
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

/** Move a floor to Recently Deleted. Its rooms keep their floor and placement and show as "no floor" until it is restored. */
export async function deleteFloor(id: ID): Promise<void> {
  const floor = await db.floors.get(id);
  if (!floor) return;
  await moveToTrash('floor', { en: floor.name, ar: floor.nameAr || floor.name }, null, async (rec) => {
    await rec.remove('floors', id);
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
  const task = await db.tasks.get(id);
  if (!task) return;
  await moveToTrash('task', { en: task.title, ar: task.title }, task.roomId, async (rec) => {
    await rec.remove('tasks', id);
  });
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
  const c = await db.comparisons.get(id);
  if (!c) return;
  await moveToTrash('comparison', { en: c.title || msgs('en').enums.trashKind.comparison, ar: c.title || msgs('ar').enums.trashKind.comparison }, c.roomId, async (rec) => {
    await rec.remove('comparisons', id);
  });
}

/* Presets ------------------------------------------------------------ */

export async function savePreset(p: { id?: ID; name: string; nameAr?: string; summary: string; summaryAr?: string; fields: DesignDirectionFields }): Promise<DirectionPreset> {
  const now = nowIso();
  if (p.id) {
    const existing = await db.presets.get(p.id);
    if (existing) {
      const next = { ...existing, name: p.name, nameAr: p.nameAr, summary: p.summary, summaryAr: p.summaryAr, fields: structuredClone(p.fields), updatedAt: now };
      await db.presets.put(next);
      return next;
    }
  }
  const last = await db.presets.orderBy('order').last();
  const created: DirectionPreset = {
    id: newId('preset'),
    name: p.name,
    nameAr: p.nameAr,
    summary: p.summary,
    summaryAr: p.summaryAr,
    builtIn: false,
    fields: structuredClone(p.fields),
    order: (last?.order ?? -1) + 1,
    updatedAt: now,
  };
  await db.presets.add(created);
  return created;
}

export async function deletePreset(id: ID): Promise<void> {
  const p = await db.presets.get(id);
  if (!p) return;
  await moveToTrash('preset', { en: p.name, ar: p.nameAr || p.name }, null, async (rec) => {
    await rec.remove('presets', id);
  });
}

export async function resetPreset(id: ID): Promise<boolean> {
  const orig = originalPreset(id);
  if (!orig) return false;
  await db.presets.update(id, {
    name: orig.name,
    nameAr: orig.nameAr,
    summary: orig.summary,
    summaryAr: orig.summaryAr,
    fields: structuredClone(orig.fields),
    updatedAt: nowIso(),
  });
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

/** Move a material / furniture item to Recently Deleted. Furniture placed from it keeps its dimensions. */
export async function deleteLibraryItem(id: ID): Promise<void> {
  const item = await db.library.get(id);
  if (!item) return;
  await moveToTrash('library', { en: item.name, ar: item.name }, item.roomIds[0] ?? null, async (rec) => {
    await rec.remove('library', id);
    await trashOrphanedReferences(rec, { library: new Set([id]) });
  });
}
