import { db } from './db';
import { createRequirementRecord } from './factories';
import { advanceRoomStatus } from './rooms';
import { moveToTrash } from './trash';
import { trashOrphanedReferences } from './rooms';
import { copyName, newId, nowIso } from '../ids';
import { msgs } from '../../i18n/messages';
import type { ID, Requirement } from '../types';

async function nextOrder(roomId: ID): Promise<number> {
  const all = await db.requirements.where('roomId').equals(roomId).toArray();
  return all.reduce((m, r) => Math.max(m, r.order), -1) + 1;
}

export async function addRequirement(roomId: ID, partial: Partial<Requirement>): Promise<Requirement> {
  const order = await nextOrder(roomId);
  const req = createRequirementRecord(roomId, partial, order);
  await db.requirements.add(req);
  await advanceRoomStatus(roomId, 'requirements-added');
  return req;
}

export async function addRequirements(roomId: ID, items: Partial<Requirement>[]): Promise<Requirement[]> {
  let order = await nextOrder(roomId);
  const reqs = items.map((p) => createRequirementRecord(roomId, p, order++));
  await db.requirements.bulkAdd(reqs);
  if (reqs.length) await advanceRoomStatus(roomId, 'requirements-added');
  return reqs;
}

export async function updateRequirement(id: ID, patch: Partial<Requirement>): Promise<void> {
  await db.requirements.update(id, { ...patch, updatedAt: nowIso() });
}

export async function reorderRequirements(orderedIds: ID[]): Promise<void> {
  await db.transaction('rw', db.requirements, async () => {
    await Promise.all(orderedIds.map((id, i) => db.requirements.update(id, { order: i })));
  });
}

export async function duplicateRequirement(id: ID): Promise<Requirement | null> {
  return db.transaction('rw', [db.requirements, db.references], async () => {
    const src = await db.requirements.get(id);
    if (!src) return null;
    const now = nowIso();
    const copy: Requirement = { ...src, id: newId('req'), title: copyName(src.title), order: src.order + 0.5, createdAt: now, updatedAt: now };
    await db.requirements.add(copy);
    await db.references
      .where('requirementIds')
      .equals(id)
      .modify((r) => {
        r.requirementIds = [...r.requirementIds, copy.id];
      });
    const siblings = await db.requirements.where('roomId').equals(src.roomId).sortBy('order');
    await Promise.all(siblings.map((r, i) => db.requirements.update(r.id, { order: i })));
    return copy;
  });
}

/** Move requirements to Recently Deleted; attachments used nowhere else go with them. */
export async function deleteRequirements(ids: ID[]): Promise<void> {
  if (!ids.length) return;
  const first = await db.requirements.get(ids[0]);
  if (!first) return;
  const label =
    ids.length === 1
      ? { en: first.title || msgs('en').enums.trashKind.requirement, ar: first.title || msgs('ar').enums.trashKind.requirement }
      : { en: msgs('en').common.requirementCount(ids.length), ar: msgs('ar').common.requirementCount(ids.length) };
  await moveToTrash('requirement', label, first.roomId, async (rec) => {
    for (const id of ids) await rec.remove('requirements', id);
    await trashOrphanedReferences(rec, { requirements: new Set(ids) });
  });
}
