import { db } from './db';
import { createRequirementRecord } from './factories';
import { advanceRoomStatus } from './rooms';
import { deleteReferences } from './references';
import { isOrphanAttachment } from './gc';
import { newId, nowIso } from '../ids';
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
    const copy: Requirement = { ...src, id: newId('req'), title: `${src.title} (copy)`, order: src.order + 0.5, createdAt: now, updatedAt: now };
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

/** Delete requirements; attachments used nowhere else are removed too. */
export async function deleteRequirements(ids: ID[]): Promise<void> {
  const set = new Set(ids);
  const orphanRefs: ID[] = [];
  await db.transaction('rw', [db.requirements, db.references], async () => {
    await db.requirements.bulkDelete(ids);
    const refs = await db.references.where('requirementIds').anyOf(ids).toArray();
    for (const r of refs) {
      const next = { ...r, requirementIds: r.requirementIds.filter((x) => !set.has(x)), updatedAt: nowIso() };
      await db.references.put(next);
      if (isOrphanAttachment(next)) orphanRefs.push(r.id);
    }
  });
  if (orphanRefs.length) await deleteReferences(orphanRefs);
}
