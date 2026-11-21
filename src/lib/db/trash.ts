import { db } from './db';
import { newId, nowIso } from '../ids';
import { SYNCED_TABLES, type SyncedTable } from '../sync/tables';
import type { ID, Reference, TrashEntry, TrashKind } from '../types';

/**
 * Recently Deleted.
 *
 * Deleting moves the record — and everything deleted together with it —
 * into one TrashEntry, which syncs to the cloud like any other record.
 * Pointers elsewhere (a room's cover, a comparison item…) are left as they
 * are: they simply show as missing while the item is deleted and work again
 * after it is restored. Only "Delete permanently" removes data for good.
 */

type AnyRecord = Record<string, unknown> & { id: string };

export class TrashRecorder {
  records: TrashEntry['records'] = [];
  unlinks: TrashEntry['unlinks'] = [];
  cleared: TrashEntry['cleared'] = [];
  private removed = new Set<string>();

  has(table: SyncedTable, id: string) {
    return this.removed.has(`${table}|${id}`);
  }

  async remove(table: SyncedTable, id: string): Promise<AnyRecord | null> {
    const key = `${table}|${id}`;
    if (this.removed.has(key)) return null;
    const rec = (await db.table(table).get(id)) as AnyRecord | undefined;
    if (!rec) return null;
    this.records.push({ table, record: structuredClone(rec) });
    this.removed.add(key);
    await db.table(table).delete(id);
    return rec;
  }

  /** Change a single field on a record that is kept; restoring sets it back if nobody changed it since. */
  async setField(table: SyncedTable, id: string, field: string, value: unknown) {
    const rec = (await db.table(table).get(id)) as AnyRecord | undefined;
    if (!rec) return;
    this.cleared.push({ table, id, field, value: structuredClone(rec[field]), setTo: structuredClone(value) });
    await db.table(table).update(id, { [field]: value });
  }
}

/** All tables a deletion may touch (plus the trash itself). */
function tablesForDeletion() {
  return [...SYNCED_TABLES.map((t) => db.table(t))];
}

export async function moveToTrash(
  kind: TrashKind,
  label: { en: string; ar?: string },
  roomId: ID | null,
  work: (rec: TrashRecorder) => Promise<void>,
): Promise<TrashEntry | null> {
  return db.transaction('rw', tablesForDeletion(), async () => {
    const rec = new TrashRecorder();
    await work(rec);
    if (!rec.records.length) return null;
    const entry: TrashEntry = {
      id: newId('trash'),
      kind,
      label: label.en,
      labelAr: label.ar,
      roomId,
      deletedAt: nowIso(),
      records: rec.records,
      unlinks: rec.unlinks,
      cleared: rec.cleared,
      fileIds: [],
    };
    await db.trash.add(entry);
    return entry;
  });
}

/** Put everything in a trash entry back. Records that exist again (restored elsewhere) are left as they are. */
export async function restoreFromTrash(id: ID): Promise<boolean> {
  return db.transaction('rw', tablesForDeletion(), async () => {
    const entry = await db.trash.get(id);
    if (!entry) return false;
    for (const { table, record } of entry.records) {
      const t = db.table(table);
      const rid = (record as AnyRecord).id;
      if (!(await t.get(rid))) await t.put({ ...record, updatedAt: nowIso() });
    }
    for (const u of entry.unlinks) {
      const t = db.table(u.table);
      const rec = (await t.get(u.id)) as AnyRecord | undefined;
      if (!rec) continue;
      const list = Array.isArray(rec[u.field]) ? (rec[u.field] as string[]) : [];
      const merged = Array.from(new Set([...list, ...u.values]));
      if (merged.length !== list.length) await t.update(u.id, { [u.field]: merged });
    }
    for (const c of entry.cleared) {
      const t = db.table(c.table);
      const rec = (await t.get(c.id)) as AnyRecord | undefined;
      if (!rec) continue;
      // Only undo the change if nobody has changed the field since.
      if (JSON.stringify(rec[c.field] ?? null) === JSON.stringify(c.setTo ?? null)) await t.update(c.id, { [c.field]: c.value });
    }
    await db.trash.delete(id);
    return true;
  });
}

/** File ids still used by anything (references, versions, other trash entries). */
async function filesInUse(): Promise<Set<string>> {
  const used = new Set<string>();
  const addRef = (r: Partial<Reference>) => r.imageId && used.add(r.imageId);
  await db.references.each((r) => addRef(r));
  await db.versions.each((v) => {
    if (v.imageId) used.add(v.imageId);
    for (const i of v.inputImages ?? []) if (i.imageId) used.add(i.imageId);
  });
  await db.trash.each((t) => {
    for (const { table, record } of t.records) {
      const r = record as Record<string, unknown>;
      if (table === 'references' && typeof r.imageId === 'string') used.add(r.imageId);
      if (table === 'versions') {
        if (typeof r.imageId === 'string') used.add(r.imageId);
        for (const i of (r.inputImages as { imageId?: string | null }[] | undefined) ?? []) if (i.imageId) used.add(i.imageId);
      }
      if (table === 'files' && typeof r.id === 'string') used.add(r.id);
    }
  });
  return used;
}

/** Files nothing uses any more (candidates for permanent deletion). */
export async function unusedFiles(): Promise<{ id: string; name: string; size: number }[]> {
  const used = await filesInUse();
  const out: { id: string; name: string; size: number }[] = [];
  await db.files.each((f) => {
    if (!used.has(f.id)) out.push({ id: f.id, name: f.name, size: f.size });
  });
  return out;
}

/** Permanently delete files (records, bytes on this device, and — via sync — in cloud storage). */
export async function deleteFilesForGood(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.transaction('rw', db.files, db.blobs, async () => {
    await db.files.bulkDelete(ids);
    for (const id of ids) await db.blobs.where('fileId').equals(id).delete();
  });
}

/** Delete trash entries for good, together with files nothing else uses. */
export async function purgeTrash(ids: ID[]): Promise<{ files: number }> {
  await db.trash.bulkDelete(ids);
  const orphans = await unusedFiles();
  await deleteFilesForGood(orphans.map((f) => f.id));
  return { files: orphans.length };
}

export async function trashSummary(entry: TrashEntry): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const r of entry.records) counts[r.table] = (counts[r.table] ?? 0) + 1;
  return counts;
}
