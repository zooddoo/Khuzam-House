// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVER_TABLES } from './tables';

/**
 * Runs the real Supabase migration inside an embedded Postgres (PGlite) with
 * minimal stand-ins for Supabase's `auth` and `storage` schemas, then checks
 * the security rules: only the owner's account can read or change anything.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MIGRATION = readFileSync(join(ROOT, 'supabase', 'migrations', '20261121120000_bait_khuzam_cloud.sql'), 'utf8');
const SETUP = readFileSync(join(ROOT, 'supabase', 'setup.sql'), 'utf8');

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

let pg: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await pg.exec('reset role');
  if (user === null) await pg.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  else await pg.exec(`select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return await pg.query<Record<string, unknown>>(sql, params);
  } finally {
    await pg.exec('reset role');
  }
}

async function json(user: string | null, sql: string, params: unknown[] = []) {
  const res = await as(user, sql, params);
  return Object.values(res.rows[0] ?? {})[0] as unknown;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  await pg.exec(MIGRATION);
  // Running it again (as the GitHub integration may after a manual run) must be harmless.
  await pg.exec(MIGRATION);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('Supabase schema', () => {
  it('setup.sql is identical to the migration', () => {
    expect(SETUP.trim().endsWith(MIGRATION.trim())).toBe(true);
  });

  it('creates every table the app syncs, with RLS enabled', async () => {
    const res = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const byName = new Map(res.rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of SERVER_TABLES) expect(byName.get(t), t).toBe(true);
    expect(byName.get('app_owner')).toBe(true);
    expect(byName.get('record_history')).toBe(true);
    const bucket = await pg.query(`select public from storage.buckets where id = 'studio-files'`);
    expect(bucket.rows).toEqual([{ public: false }]);
  });

  it('lets the first account claim the studio and nobody after it', async () => {
    expect(await json(null, 'select public.app_status()')).toMatchObject({ claimed: false, is_owner: false, signed_in: false });
    expect(await json(OWNER, 'select public.claim_app_owner()')).toMatchObject({ claimed: true, is_owner: true });
    expect(await json(STRANGER, 'select public.claim_app_owner()')).toMatchObject({ claimed: true, is_owner: false });
    expect(await json(null, 'select public.app_status()')).toMatchObject({ claimed: true, is_owner: false });
    await expect(as(null, 'select public.claim_app_owner()')).rejects.toThrow();
  });

  it('saves and reads records for the owner', async () => {
    const changes = [
      { tbl: 'rooms', id: 'room_1', data: { id: 'room_1', name: 'Majlis', nameAr: 'المجلس', type: 'majlis', status: 'not-started' } },
      { tbl: 'requirements', id: 'req_1', data: { id: 'req_1', roomId: 'room_1', title: 'جلسة أرضية', priority: 'must', status: 'pending' } },
      { tbl: 'files', id: 'file_1', data: { id: 'file_1', name: 'plan.pdf', type: 'application/pdf', size: 1234 } },
    ];
    const pushed = (await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify(changes), 'phone'])) as { tbl: string; updated_at: string }[];
    expect(pushed).toHaveLength(3);
    const pulled = (await json(OWNER, 'select public.sync_pull()')) as { rows: { tbl: string; id: string; data: { nameAr?: string } }[]; safe_until: string };
    expect(pulled.rows.map((r) => `${r.tbl}:${r.id}`).sort()).toEqual(['files:file_1', 'requirements:req_1', 'rooms:room_1']);
    expect(pulled.rows.find((r) => r.id === 'room_1')?.data.nameAr).toBe('المجلس');
    expect(typeof pulled.safe_until).toBe('string');
    const readable = await as(OWNER, `select name, name_ar, room_type from public.rooms where id = 'room_1'`);
    expect(readable.rows).toEqual([{ name: 'Majlis', name_ar: 'المجلس', room_type: 'majlis' }]);
    expect(await json(OWNER, 'select public.server_counts()')).toMatchObject({ rooms: 1, requirements: 1, files: 1, tasks: 0 });
  });

  it('pages through changes with a stable cursor', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ tbl: 'tasks', id: `task_${i}`, data: { id: `task_${i}`, title: `Task ${i}`, done: false } }));
    await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify(many), 'phone']);
    const seen: string[] = [];
    let cursor: { since: string | null; tbl: string; id: string } = { since: null, tbl: '', id: '' };
    for (let guard = 0; guard < 20; guard++) {
      const page = (await json(OWNER, `select public.sync_pull(coalesce($1::timestamptz, '-infinity'), $2, $3, 3)`, [cursor.since, cursor.tbl, cursor.id])) as {
        rows: { tbl: string; id: string; updated_at: string }[];
      };
      if (!page.rows.length) break;
      for (const r of page.rows) seen.push(`${r.tbl}:${r.id}`);
      const last = page.rows[page.rows.length - 1];
      cursor = { since: last.updated_at, tbl: last.tbl, id: last.id };
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((s) => s.startsWith('tasks:'))).toHaveLength(7);
  });

  it('keeps earlier versions in the history when another device overwrites or deletes', async () => {
    await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'rooms', id: 'room_1', data: { id: 'room_1', name: 'Majlis (edited)' } }]), 'computer']);
    await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'rooms', id: 'room_1', deleted: true }]), 'computer']);
    const row = await as(OWNER, `select data, deleted from public.rooms where id = 'room_1'`);
    expect(row.rows).toEqual([{ data: null, deleted: true }]);
    const history = (await json(OWNER, `select public.history_list(10, null, 'rooms', 'room_1')`)) as { label_en: string; reason: string; id: number }[];
    expect(history.map((h) => [h.label_en, h.reason])).toEqual([
      ['Majlis (edited)', 'delete'],
      ['Majlis', 'update'],
    ]);
    const old = (await json(OWNER, 'select public.history_record($1)', [history[1].id])) as { data: { nameAr: string } };
    expect(old.data.nameAr).toBe('المجلس');
    // Same device, quick successive edits: collapsed (no history row per keystroke).
    await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'tasks', id: 'task_1', data: { id: 'task_1', title: 'A' } }]), 'phone']);
    await json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'tasks', id: 'task_1', data: { id: 'task_1', title: 'AB' } }]), 'phone']);
    const taskHistory = (await json(OWNER, `select public.history_list(10, null, 'tasks', 'task_1')`)) as unknown[];
    expect(taskHistory).toHaveLength(0);
    // …unless the app asks for an archive (restores and imports do).
    await json(OWNER, 'select public.sync_push($1::jsonb, $2, true)', [JSON.stringify([{ tbl: 'tasks', id: 'task_1', data: { id: 'task_1', title: 'ABC' } }]), 'phone']);
    expect(await json(OWNER, `select public.history_list(10, null, 'tasks', 'task_1')`)).toHaveLength(1);
  });

  it('rejects unknown tables and malformed changes', async () => {
    await expect(json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'app_owner', id: 'x', data: {} }]), 'phone'])).rejects.toThrow(/Unknown table/);
    await expect(json(OWNER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'rooms', id: 'x' }]), 'phone'])).rejects.toThrow(/no data/);
  });

  it('gives any other account nothing to read and nothing to change', async () => {
    await expect(json(STRANGER, 'select public.sync_pull()')).rejects.toThrow(/owner/);
    await expect(json(STRANGER, 'select public.sync_push($1::jsonb, $2)', [JSON.stringify([{ tbl: 'rooms', id: 'evil', data: { id: 'evil' } }]), 'x'])).rejects.toThrow(/owner/);
    for (const t of SERVER_TABLES) {
      const res = await as(STRANGER, `select count(*)::int as n from public.${t}`);
      expect(res.rows[0], t).toEqual({ n: 0 });
    }
    await expect(as(STRANGER, `insert into public.rooms (id, data) values ('evil', '{}')`)).rejects.toThrow(/row-level security/);
    const upd = await as(STRANGER, `update public.requirements set data = '{}' where id = 'req_1'`);
    expect(upd.affectedRows ?? 0).toBe(0);
    const del = await as(STRANGER, `delete from public.requirements where id = 'req_1'`);
    expect(del.affectedRows ?? 0).toBe(0);
    expect((await as(STRANGER, 'select count(*)::int as n from public.record_history')).rows[0]).toEqual({ n: 0 });
    await expect(as(STRANGER, `insert into storage.objects (bucket_id, name) values ('studio-files', 'files/x/original.jpg')`)).rejects.toThrow(/row-level security/);
    // The owner's data is untouched.
    expect((await as(OWNER, `select data->>'title' as title from public.requirements where id = 'req_1'`)).rows).toEqual([{ title: 'جلسة أرضية' }]);
  });

  it('gives signed-out visitors nothing', async () => {
    await expect(as(null, 'select * from public.rooms')).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select public.sync_pull()')).rejects.toThrow(/permission denied/);
    await expect(as(null, `insert into storage.objects (bucket_id, name) values ('studio-files', 'files/y/original.jpg')`)).rejects.toThrow(/row-level security/);
    await expect(as(null, 'select * from public.record_history')).rejects.toThrow(/permission denied/);
  });

  it('lets the owner store files in the private bucket', async () => {
    await as(OWNER, `insert into storage.objects (bucket_id, name) values ('studio-files', 'files/file_1/original.pdf')`);
    expect((await as(OWNER, `select count(*)::int as n from storage.objects where bucket_id = 'studio-files'`)).rows[0]).toEqual({ n: 1 });
    expect((await as(STRANGER, `select count(*)::int as n from storage.objects`)).rows[0]).toEqual({ n: 0 });
    await expect(as(OWNER, `insert into storage.objects (bucket_id, name) values ('another-bucket', 'x')`)).rejects.toThrow(/row-level security/);
  });
});
