import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, Middleware } from 'dexie';

/**
 * Change tracking for cloud sync.
 *
 * A Dexie middleware records the key of every record written to a synced
 * table in the `outbox` table — inside the same IndexedDB transaction, so a
 * change can never be saved locally without also being queued for upload
 * (even if the app is closed straight after).
 *
 * Writes that come *from* the cloud are applied in "silent" transactions so
 * they are not sent back.
 */

const silent = new WeakSet<object>();

/** Mark a transaction (Dexie `tx.idbtrans`) as applying remote changes: it won't queue uploads. */
export function markSilent(idbtrans: unknown): void {
  if (idbtrans && typeof idbtrans === 'object') silent.add(idbtrans);
}

let counter = 0;
export function newRev(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}.${counter.toString(36)}.${Math.random().toString(36).slice(2, 6)}`;
}

async function affectedKeys(table: DBCoreTable, req: DBCoreMutateRequest): Promise<unknown[]> {
  switch (req.type) {
    case 'add':
    case 'put': {
      if (req.keys) return req.keys;
      const extract = table.schema.primaryKey.extractKey;
      return extract ? req.values.map((v) => extract(v)) : [];
    }
    case 'delete':
      return req.keys;
    case 'deleteRange': {
      const res = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } });
      return res.result;
    }
    default:
      return [];
  }
}

function succeeded(keys: unknown[], res: DBCoreMutateResponse): unknown[] {
  if (!res.numFailures) return keys;
  return keys.filter((_, i) => !(i in res.failures));
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notified = new WeakSet<object>();

/** Called after any transaction that queued changes has committed. */
export function onOutboxChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyOnCommit(trans: unknown) {
  const t = trans as { addEventListener?: (type: string, fn: () => void) => void };
  if (!t || typeof t !== 'object' || notified.has(t) || typeof t.addEventListener !== 'function') return;
  notified.add(t);
  t.addEventListener('complete', () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* listeners must not break saving */
      }
    }
  });
}

/**
 * Sits directly above IndexedDB (below Dexie's hooks, cache and live-query
 * layers) so it can look up keys before a range delete and still write the
 * outbox entry inside the caller's transaction.
 */
export function outboxMiddleware(synced: ReadonlySet<string>, outboxTable = 'outbox'): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'SyncOutbox',
    level: -2,
    create(down) {
      return {
        ...down,
        transaction(stores, mode, options) {
          if (mode === 'readwrite' && !stores.includes(outboxTable) && stores.some((s) => synced.has(s))) {
            return down.transaction([...stores, outboxTable], mode, options);
          }
          return down.transaction(stores, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!synced.has(name)) return table;
          return {
            ...table,
            async mutate(req) {
              const trans = req.trans as unknown as { mode?: string };
              if (silent.has(req.trans as object) || trans.mode === 'versionchange') return table.mutate(req);
              const keys = await affectedKeys(table, req);
              const res = await table.mutate(req);
              const done = succeeded(keys, res).filter((k) => k !== undefined && k !== null);
              if (done.length) {
                const at = Date.now();
                const values = Array.from(new Set(done.map(String))).map((key) => ({ id: `${name}|${key}`, table: name, key, at, rev: newRev() }));
                await down.table(outboxTable).mutate({ type: 'put', trans: req.trans, values });
                notifyOnCommit(req.trans);
              }
              return res;
            },
          };
        },
      };
    },
  };
}
