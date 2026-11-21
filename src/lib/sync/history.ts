import { db } from '../db/db';
import { nowIso } from '../ids';
import type { AppSettings } from '../types';
import { supabase } from './client';
import { localTableFor, type SyncedTable } from './tables';

/**
 * Earlier versions kept by the server (public.record_history): every time a
 * record is overwritten from another device, edited after a pause, deleted,
 * or replaced by a backup restore, the previous version is archived there.
 */
export interface HistoryEntry {
  id: number;
  table: string;
  localTable: SyncedTable | null;
  recordId: string;
  label: string;
  labelEn: string;
  reason: string;
  archivedAt: string;
}

export async function listHistory(opts: { before?: number | null; limit?: number } = {}): Promise<HistoryEntry[]> {
  const { data, error } = await supabase().rpc('history_list', { p_limit: opts.limit ?? 50, p_before: opts.before ?? null, p_table: null, p_record: null });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: number; table: string; record_id: string; label: string; label_en: string; reason: string; archived_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    table: r.table,
    localTable: localTableFor(r.table),
    recordId: r.record_id,
    label: r.label,
    labelEn: r.label_en,
    reason: r.reason,
    archivedAt: r.archived_at,
  }));
}

/**
 * Put an archived version back. It is saved as the current version (and
 * synced like any edit); the version it replaces is archived in turn, so
 * this can always be undone the same way.
 */
export async function restoreHistory(id: number): Promise<{ table: SyncedTable; recordId: string }> {
  const { data, error } = await supabase().rpc('history_record', { p_id: id });
  if (error) throw new Error(error.message);
  const rec = data as { table: string; record_id: string; data: Record<string, unknown> } | null;
  if (!rec?.data) throw new Error('not found');
  const table = localTableFor(rec.table);
  if (!table) throw new Error(`unknown table ${rec.table}`);
  let value: Record<string, unknown> = { ...rec.data, updatedAt: nowIso() };
  if (table === 'settings') {
    // API keys never leave the device: keep the ones stored here.
    const current = (await db.settings.get('app')) as AppSettings | undefined;
    if (current) value = { ...value, imageProvider: { ...(value.imageProvider as object), keys: current.imageProvider.keys }, textProvider: { ...(value.textProvider as object), keys: current.textProvider.keys } };
  }
  await (db.table(table) as unknown as { put: (v: unknown) => Promise<unknown> }).put(value);
  return { table, recordId: rec.record_id };
}
