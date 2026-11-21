import { useSyncExternalStore } from 'react';
import { db, getMeta, setMeta } from '../db/db';
import { markSilent, onOutboxChange } from './outbox';
import { localTableFor, SYNC_TABLE_MAP, SYNCED_TABLES, type SyncedTable } from './tables';
import { supabase } from './client';
import { removeObjects, StorageError, storagePath, uploadObject } from './storage';
import type { AppSettings, FileBlob, OutboxEntry, StoredFile } from '../types';

/**
 * Cloud sync engine.
 *
 * - push: records queued in `outbox` are sent to Supabase in atomic batches
 *   (sync_push). An entry is removed only if the record has not changed
 *   again meanwhile, so a newer edit is never lost.
 * - uploads: file bytes cached in `blobs` with pending=1 are uploaded to
 *   Storage (smallest first, with progress). A file's record is pushed only
 *   after all of its bytes are stored, so the other device never sees a file
 *   whose bytes are missing.
 * - pull: changes after the saved cursor are fetched (sync_pull) and applied
 *   without being queued again. Records with local unsent changes are left
 *   alone; the local change is pushed and wins. Overwritten versions are
 *   kept in the server-side history.
 */

/* ------------------------------------------------------------------ */
/* Status store                                                         */
/* ------------------------------------------------------------------ */

export interface UploadProgress {
  fileId: string;
  name: string;
  loaded: number;
  total: number;
}

export interface SyncSnapshot {
  running: boolean;
  online: boolean;
  /** Records waiting in the outbox. */
  pending: number;
  pushing: boolean;
  pulling: boolean;
  lastPushAt: number | null;
  lastPullAt: number | null;
  /** Last push/pull problem, cleared after the next success. */
  error: { kind: 'network' | 'auth' | 'server'; message: string } | null;
  uploads: {
    queued: number;
    queuedBytes: number;
    active: UploadProgress[];
  };
  /** Upload problems per file id (e.g. too large for the storage limit). */
  fileErrors: Record<string, string>;
}

const initial: SyncSnapshot = {
  running: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  pushing: false,
  pulling: false,
  lastPushAt: null,
  lastPullAt: null,
  error: null,
  uploads: { queued: 0, queuedBytes: 0, active: [] },
  fileErrors: {},
};

let snapshot: SyncSnapshot = initial;
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const fn of listeners) fn();
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

export type SaveState = 'saved' | 'saving' | 'offline' | 'error';

export function saveStateOf(s: SyncSnapshot): SaveState {
  const busy = s.pending > 0 || s.uploads.queued > 0 || s.uploads.active.length > 0;
  if (!busy) return 'saved';
  if (!s.online) return 'offline';
  if (s.error || Object.keys(s.fileErrors).length) return 'error';
  return 'saving';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const DEVICE_KEY = 'bk.deviceId';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

/** JSON with sorted keys, to compare records regardless of key order (Postgres jsonb reorders keys). */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function stripSecrets(settings: AppSettings): AppSettings {
  const copy = structuredClone(settings);
  if (copy.imageProvider) copy.imageProvider.keys = {};
  if (copy.textProvider) copy.textProvider.keys = {};
  return copy;
}

function keepLocalSecrets(remote: AppSettings, local: AppSettings | undefined): AppSettings {
  const merged = structuredClone(remote);
  if (merged.imageProvider) merged.imageProvider.keys = { ...(local?.imageProvider?.keys ?? {}) };
  if (merged.textProvider) merged.textProvider.keys = { ...(local?.textProvider?.keys ?? {}) };
  return merged;
}

/** What gets stored in the cloud for a record. */
function serialize(table: SyncedTable, record: unknown): unknown {
  if (table === 'settings') return stripSecrets(record as AppSettings);
  return record;
}

interface PostgrestLikeError {
  message?: string;
  code?: string;
  status?: number;
  details?: string;
}

function classifyError(e: unknown): { kind: 'network' | 'auth' | 'server'; message: string } {
  const err = e as PostgrestLikeError & Error;
  const message = err?.message || String(e);
  if (e instanceof StorageError) return { kind: e.kind === 'network' ? 'network' : e.kind === 'auth' ? 'auth' : 'server', message };
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message) || err?.name === 'TypeError') return { kind: 'network', message };
  if (err?.code === 'PGRST301' || err?.code === '42501' || /jwt|not signed in|expired/i.test(message)) return { kind: 'auth', message };
  return { kind: 'server', message };
}

interface Cursor {
  since: string | null;
  tbl: string;
  id: string;
}

interface PullRow {
  tbl: string;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  updated_at: string;
}

interface PullResult {
  rows: PullRow[];
  safe_until: string;
  server_time: string;
}

const PAGE = 500;
const MAX_BATCH_BYTES = 900_000;
const MAX_BATCH_ROWS = 200;

/* ------------------------------------------------------------------ */
/* Engine                                                               */
/* ------------------------------------------------------------------ */

class SyncEngine {
  private running = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2000;
  private pushing: Promise<void> | null = null;
  private pulling: Promise<number> | null = null;
  private uploading: Promise<void> | null = null;
  private uploadAbort: AbortController | null = null;
  private forceArchive = false;
  private cleanup: (() => void)[] = [];

  async refreshCounts() {
    const [pending, queuedBlobs] = await Promise.all([db.outbox.count(), db.blobs.where('pending').equals(1).toArray()]);
    const active = new Set(snapshot.uploads.active.map((a) => `${a.fileId}`));
    const queued = queuedBlobs.filter((b) => !active.has(b.fileId));
    setState({
      pending,
      uploads: { ...snapshot.uploads, queued: queued.length, queuedBytes: queued.reduce((s, b) => s + (b.blob?.size ?? 0), 0) },
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    setState({ running: true, online: navigator.onLine });
    const onOnline = () => {
      setState({ online: true });
      this.retryDelay = 2000;
      void this.syncNow();
    };
    const onOffline = () => setState({ online: false });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const off = onOutboxChange(() => {
      void this.refreshCounts();
      this.schedulePush(400);
      this.scheduleUploads();
    });
    this.cleanup.push(
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
      off,
    );
    this.pullTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void this.pull().catch(() => undefined);
    }, 20_000);
    void this.refreshCounts();
    void this.syncNow();
  }

  stop() {
    this.running = false;
    for (const fn of this.cleanup.splice(0)) fn();
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pullTimer) clearInterval(this.pullTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.uploadAbort?.abort();
    this.pushTimer = this.pullTimer = this.retryTimer = null;
    setState({ running: false });
  }

  /** Push, upload and pull now (also used by the "Retry" button). */
  async syncNow(): Promise<void> {
    if (!this.running) return;
    setState({ error: null, fileErrors: {} });
    this.scheduleUploads();
    try {
      await this.push();
      await this.pull();
    } catch {
      /* state already records the error; a retry is scheduled */
    }
  }

  schedulePush(delay = 400) {
    if (!this.running) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push().catch(() => undefined);
    }, delay);
  }

  private scheduleRetry() {
    if (!this.running || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  private fail(e: unknown) {
    setState({ error: classifyError(e), online: navigator.onLine });
    this.scheduleRetry();
  }

  /** Mark restores and imports so the server archives the versions they replace. */
  setForceArchive(on: boolean) {
    this.forceArchive = on;
  }

  /* Push ------------------------------------------------------------ */

  push(): Promise<void> {
    if (this.pushing) return this.pushing;
    this.pushing = (async () => {
      setState({ pushing: true });
      try {
        for (let guard = 0; guard < 1000; guard++) {
          const result = await this.pushBatch();
          if (result !== 'more') break;
        }
        this.retryDelay = 2000;
        if (this.forceArchive && (await db.outbox.count()) === 0) this.forceArchive = false;
        setState({ lastPushAt: Date.now(), error: null });
      } catch (e) {
        this.fail(e);
        throw e;
      } finally {
        this.pushing = null;
        setState({ pushing: false });
        void this.refreshCounts();
      }
    })();
    return this.pushing;
  }

  private async pushBatch(): Promise<'done' | 'more' | 'blocked'> {
    const entries = await db.outbox.orderBy('at').toArray();
    if (!entries.length) return 'done';
    const changes: { tbl: string; id: string; data?: unknown; deleted?: boolean }[] = [];
    const used: OutboxEntry[] = [];
    const deletedFiles: string[] = [];
    let bytes = 0;
    let skipped = 0;
    for (const e of entries) {
      const table = e.table as SyncedTable;
      if (!SYNC_TABLE_MAP[table]) {
        used.push(e);
        continue;
      }
      const record = await db.table(table).get(e.key);
      if (table === 'files' && record) {
        const waiting = await db.blobs
          .where('fileId')
          .equals(e.key)
          .filter((b) => b.pending === 1)
          .count();
        if (waiting) {
          skipped++;
          continue;
        }
      }
      const change = record ? { tbl: SYNC_TABLE_MAP[table], id: e.key, data: serialize(table, record) } : { tbl: SYNC_TABLE_MAP[table], id: e.key, deleted: true };
      const size = JSON.stringify(change).length;
      if (changes.length && (bytes + size > MAX_BATCH_BYTES || changes.length >= MAX_BATCH_ROWS)) break;
      bytes += size;
      changes.push(change);
      used.push(e);
      if (table === 'files' && !record) deletedFiles.push(e.key);
    }
    if (changes.length) {
      const { error } = await supabase().rpc('sync_push', {
        p_changes: changes,
        p_client_id: deviceId(),
        p_force_archive: this.forceArchive,
      });
      if (error) throw error;
    }
    if (used.length) {
      await db.transaction('rw', db.outbox, async () => {
        for (const e of used) {
          const cur = await db.outbox.get(e.id);
          if (cur && cur.rev === e.rev) await db.outbox.delete(e.id);
        }
      });
    }
    if (deletedFiles.length) void this.removeStoredFiles(deletedFiles);
    if (used.length && used.length + skipped < entries.length) return 'more';
    return skipped ? 'blocked' : 'done';
  }

  private async removeStoredFiles(ids: string[]) {
    const queue = new Set((await getMeta<string[]>('storageDeletes')) ?? []);
    for (const id of ids) queue.add(id);
    await setMeta('storageDeletes', [...queue]);
    try {
      for (const id of [...queue]) {
        const { data: objects } = await supabase().storage.from('studio-files').list(`files/${id}`);
        const paths = (objects ?? []).map((o) => `files/${id}/${o.name}`);
        if (paths.length) await removeObjects(paths);
        queue.delete(id);
      }
    } catch {
      /* retried after the next deletion */
    } finally {
      await setMeta('storageDeletes', [...queue]);
    }
  }

  /* Uploads --------------------------------------------------------- */

  scheduleUploads() {
    if (!this.running || this.uploading) return;
    this.uploading = this.runUploads().finally(() => {
      this.uploading = null;
    });
  }

  /** Resolves when no upload is running (used by the first-sign-in migration). */
  async uploadsIdle(): Promise<void> {
    while (this.uploading) await this.uploading;
  }

  private async runUploads(): Promise<void> {
    this.uploadAbort = new AbortController();
    const signal = this.uploadAbort.signal;
    const failed = new Set(Object.keys(snapshot.fileErrors));
    for (let guard = 0; guard < 10_000 && this.running && !signal.aborted; guard++) {
      if (!navigator.onLine) break;
      const pending = (await db.blobs.where('pending').equals(1).toArray())
        .filter((b) => !failed.has(b.fileId))
        .sort((a, b) => (a.blob?.size ?? 0) - (b.blob?.size ?? 0));
      if (!pending.length) break;
      const next = pending[0];
      const ok = await this.uploadOne(next, signal);
      if (!ok) {
        failed.add(next.fileId);
        if (snapshot.error?.kind === 'network' || !navigator.onLine) break;
      }
    }
    await this.refreshCounts();
  }

  private async uploadOne(b: FileBlob, signal: AbortSignal): Promise<boolean> {
    const file = await db.files.get(b.fileId);
    if (!file) {
      // The file was deleted before it was uploaded.
      await db.blobs.delete(b.key);
      return true;
    }
    const progress: UploadProgress = { fileId: file.id, name: file.name, loaded: 0, total: b.blob?.size ?? 0 };
    const setActive = (p: UploadProgress | null) => {
      const others = snapshot.uploads.active.filter((a) => a.fileId !== file.id);
      setState({ uploads: { ...snapshot.uploads, active: p ? [...others, p] : others } });
    };
    setActive(progress);
    try {
      const type = b.variant === 'original' ? file.type || 'application/octet-stream' : b.blob.type || 'image/webp';
      await uploadObject(storagePath(file, b.variant), b.blob, type, (loaded, total) => setActive({ ...progress, loaded, total: total || progress.total }), signal);
      await db.blobs.update(b.key, { pending: 0 });
      const left = await db.blobs
        .where('fileId')
        .equals(file.id)
        .filter((x) => x.pending === 1)
        .count();
      if (!left) this.schedulePush(100);
      return true;
    } catch (e) {
      if (e instanceof StorageError && (e.kind === 'too-large' || e.kind === 'forbidden')) {
        setState({ fileErrors: { ...snapshot.fileErrors, [file.id]: e.kind === 'too-large' ? 'too-large' : 'forbidden' } });
      } else {
        this.fail(e);
      }
      return false;
    } finally {
      setActive(null);
    }
  }

  /* Pull ------------------------------------------------------------ */

  pull(onProgress?: (received: number) => void): Promise<number> {
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      setState({ pulling: true });
      try {
        const n = await this.pullAll(onProgress);
        setState({ lastPullAt: Date.now() });
        return n;
      } catch (e) {
        this.fail(e);
        throw e;
      } finally {
        this.pulling = null;
        setState({ pulling: false });
      }
    })();
    return this.pulling;
  }

  private async pullAll(onProgress?: (received: number) => void): Promise<number> {
    let cursor: Cursor = (await getMeta<Cursor>('cursor')) ?? { since: null, tbl: '', id: '' };
    let received = 0;
    for (let guard = 0; guard < 10_000; guard++) {
      const { data, error } = await supabase().rpc('sync_pull', {
        p_since: cursor.since ?? '-infinity',
        p_tbl: cursor.tbl,
        p_id: cursor.id,
        p_limit: PAGE,
      });
      if (error) throw error;
      const result = data as PullResult;
      const rows = result.rows ?? [];
      if (rows.length) await applyRemoteRows(rows);
      received += rows.length;
      onProgress?.(received);
      const last = rows[rows.length - 1];
      if (last) cursor = { since: last.updated_at, tbl: last.tbl, id: last.id };
      if (rows.length < PAGE) {
        // Rows written in the last minute may still be joined by slower writes
        // with earlier timestamps: re-read that window next time.
        if (cursor.since && Date.parse(cursor.since) >= Date.parse(result.safe_until) - 1) cursor = { since: result.safe_until, tbl: '', id: '' };
        await setMeta('cursor', cursor);
        break;
      }
      await setMeta('cursor', cursor);
    }
    return received;
  }
}

/** Apply rows from the cloud without queuing them for upload again. */
export async function applyRemoteRows(rows: PullRow[]): Promise<void> {
  const tables = SYNCED_TABLES.map((t) => db.table(t));
  await db.transaction('rw', [...tables, db.blobs, db.outbox], async (tx) => {
    markSilent(tx.idbtrans);
    const pendingKeys = new Set((await db.outbox.toCollection().primaryKeys()) as string[]);
    for (const row of rows) {
      const table = localTableFor(row.tbl);
      if (!table) continue;
      if (pendingKeys.has(`${table}|${row.id}`)) continue;
      const t = db.table(table);
      if (row.deleted || !row.data) {
        await t.delete(row.id);
        if (table === 'files') await db.blobs.where('fileId').equals(row.id).delete();
        continue;
      }
      const existing = await t.get(row.id);
      let data: unknown = row.data;
      if (table === 'settings') data = keepLocalSecrets(row.data as unknown as AppSettings, existing as AppSettings | undefined);
      if (existing && stableStringify(existing) === stableStringify(data)) continue;
      await t.put(data);
    }
  });
}

export const syncEngine = new SyncEngine();

/* ------------------------------------------------------------------ */
/* First sign-in: upload everything on this device                      */
/* ------------------------------------------------------------------ */

/** Queue every local record for upload (used when moving existing local data to the cloud). */
export async function queueEverything(): Promise<number> {
  let total = 0;
  const at = Date.now();
  for (const table of SYNCED_TABLES) {
    const keys = (await db.table(table).toCollection().primaryKeys()) as string[];
    if (!keys.length) continue;
    total += keys.length;
    await db.outbox.bulkPut(keys.map((key, i) => ({ id: `${table}|${key}`, table, key: String(key), at: at + i, rev: `all-${at}-${i}` })));
  }
  await db.blobs.toCollection().modify({ pending: 1 });
  return total;
}

/** Queue the given local records (those that still exist) for upload; everything when no keys are given. */
export async function queueKeys(keys?: Partial<Record<SyncedTable, string[]>>): Promise<number> {
  if (!keys) return queueEverything();
  let total = 0;
  const at = Date.now();
  for (const table of SYNCED_TABLES) {
    const wanted = keys[table] ?? [];
    if (!wanted.length) continue;
    const existing = (await db.table(table).bulkGet(wanted)) as unknown[];
    const present = wanted.filter((_, i) => existing[i] !== undefined);
    if (!present.length) continue;
    total += present.length;
    await db.outbox.bulkPut(present.map((key, i) => ({ id: `${table}|${key}`, table, key: String(key), at: at + i, rev: `legacy-${at}-${i}` })));
  }
  return total;
}

export async function localCounts(): Promise<Record<SyncedTable, number>> {
  const out = {} as Record<SyncedTable, number>;
  for (const t of SYNCED_TABLES) out[t] = await db.table(t).count();
  return out;
}

export async function serverCounts(): Promise<Record<SyncedTable, number>> {
  const { data, error } = await supabase().rpc('server_counts');
  if (error) throw error;
  const raw = data as Record<string, number>;
  const out = {} as Record<SyncedTable, number>;
  for (const t of SYNCED_TABLES) out[t] = Number(raw[SYNC_TABLE_MAP[t]] ?? 0);
  return out;
}

export function isStoredFile(x: unknown): x is StoredFile {
  return !!x && typeof x === 'object' && 'kind' in x && 'ext' in x;
}
