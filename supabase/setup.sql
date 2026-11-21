-- =====================================================================
-- Bait Khuzam Studio — paste this whole file into
-- Supabase Dashboard → SQL Editor → New query, then click "Run".
--
-- It is the same as supabase/migrations/20261121120000_bait_khuzam_cloud.sql
-- and can be run again safely at any time (it never deletes data).
-- =====================================================================

-- =====================================================================
-- Bait Khuzam Studio — cloud database setup
--
-- Safe to run more than once: every statement is idempotent. The same SQL
-- is in supabase/setup.sql for pasting into Supabase → SQL Editor.
--
-- What it creates
--   * One table per kind of studio data (rooms, requirements, references,
--     files, design versions, materials & furniture, presets, comparisons,
--     tasks, settings, translations, recently deleted …). Each row keeps the
--     app's record as JSON in `data`, plus a few readable columns.
--   * app_owner: the single account allowed to use the studio. The first
--     signed-in account that confirms "claim" in the app becomes the owner.
--   * Row Level Security on every table and on the storage bucket: only the
--     owner's signed-in account can read, create, edit or delete anything.
--   * record_history: an automatic archive of earlier versions of every
--     record (before overwrites and deletions), so nothing is ever lost.
--   * Storage bucket "studio-files" (private) for all photos and attachments
--     at original quality.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------

create table if not exists public.app_owner (
  id boolean primary key default true check (id),
  user_id uuid not null unique,
  claimed_at timestamptz not null default now()
);

alter table public.app_owner enable row level security;

drop policy if exists "Owner can see the owner row" on public.app_owner;
create policy "Owner can see the owner row" on public.app_owner
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.app_owner from anon, authenticated;
grant select on table public.app_owner to authenticated;

-- True when the signed-in account is the studio owner.
create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_owner o where o.user_id = (select auth.uid())
  );
$$;

-- Whether the studio has an owner yet and whether the caller is that owner.
create or replace function public.app_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'claimed', exists (select 1 from public.app_owner),
    'is_owner', public.is_app_owner(),
    'signed_in', (select auth.uid()) is not null,
    'schema_version', 1
  );
$$;

-- Make the signed-in account the owner — only if there is no owner yet.
create or replace function public.claim_app_owner()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.app_owner (id, user_id)
  values (true, (select auth.uid()))
  on conflict (id) do nothing;
  return public.app_status();
end;
$$;

-- ---------------------------------------------------------------------
-- Change history (never deleted by the app)
-- ---------------------------------------------------------------------

create table if not exists public.record_history (
  id bigint generated always as identity primary key,
  owner uuid,
  table_name text not null,
  record_id text not null,
  data jsonb,
  deleted boolean not null default false,
  client_id text,
  valid_from timestamptz,
  archived_at timestamptz not null default now(),
  reason text not null
);

create index if not exists record_history_record_idx on public.record_history (table_name, record_id, id desc);
create index if not exists record_history_archived_idx on public.record_history (archived_at desc);

alter table public.record_history enable row level security;

drop policy if exists "Owner can read history" on public.record_history;
create policy "Owner can read history" on public.record_history
  for select to authenticated
  using ((select public.is_app_owner()));

revoke all on table public.record_history from anon, authenticated;
grant select on table public.record_history to authenticated;

-- ---------------------------------------------------------------------
-- Studio data tables
-- ---------------------------------------------------------------------

-- The tables the app synchronises. Keep in sync with src/lib/sync/tables.ts.
create or replace function public.sync_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'project', 'floors', 'rooms', 'requirements', 'reference_items', 'files',
    'design_versions', 'library_items', 'direction_presets', 'comparisons',
    'tasks', 'app_settings', 'translations', 'recently_deleted'
  ]::text[];
$$;

-- Keeps timestamps and ownership consistent on every write.
create or replace function public.tg_sync_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.owner := old.owner;
    new.created_at := old.created_at;
  elsif new.owner is null then
    new.owner := (select auth.uid());
  end if;
  return new;
end;
$$;

-- Archives the previous version of a record before it is overwritten or
-- deleted. Edits in quick succession from the same device are collapsed so
-- the history holds meaningful versions rather than every keystroke.
create or replace function public.tg_archive_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.data is not null then
      insert into public.record_history (owner, table_name, record_id, data, deleted, client_id, valid_from, reason)
      values (old.owner, tg_table_name, old.id, old.data, old.deleted, old.client_id, old.updated_at, 'delete');
    end if;
    return old;
  end if;

  if old.data is not null
     and old.data is distinct from new.data
     and (
       new.deleted
       or old.client_id is distinct from new.client_id
       or old.updated_at < clock_timestamp() - interval '2 minutes'
       or coalesce(current_setting('studio.force_archive', true), '') = 'on'
     ) then
    insert into public.record_history (owner, table_name, record_id, data, deleted, client_id, valid_from, reason)
    values (old.owner, tg_table_name, old.id, old.data, old.deleted, old.client_id, old.updated_at,
            case when new.deleted then 'delete' else 'update' end);
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array public.sync_tables() loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key check (length(id) between 1 and 200),
        owner uuid default auth.uid(),
        data jsonb,
        deleted boolean not null default false,
        client_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )$f$, t);

    execute format('create index if not exists %I on public.%I (updated_at, id)', t || '_updated_idx', t);

    execute format('drop trigger if exists a_sync_row on public.%I', t);
    execute format('create trigger a_sync_row before insert or update on public.%I for each row execute function public.tg_sync_row()', t);
    execute format('drop trigger if exists b_archive_row on public.%I', t);
    execute format('create trigger b_archive_row before update or delete on public.%I for each row execute function public.tg_archive_row()', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Owner can read" on public.%I', t);
    execute format('create policy "Owner can read" on public.%I for select to authenticated using ((select public.is_app_owner()))', t);
    execute format('drop policy if exists "Owner can create" on public.%I', t);
    execute format('create policy "Owner can create" on public.%I for insert to authenticated with check ((select public.is_app_owner()))', t);
    execute format('drop policy if exists "Owner can edit" on public.%I', t);
    execute format('create policy "Owner can edit" on public.%I for update to authenticated using ((select public.is_app_owner())) with check ((select public.is_app_owner()))', t);
    execute format('drop policy if exists "Owner can delete" on public.%I', t);
    execute format('create policy "Owner can delete" on public.%I for delete to authenticated using ((select public.is_app_owner()))', t);

    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end;
$$;

-- Readable columns, derived automatically from the JSON (for browsing the
-- data in Supabase → Table Editor). The app never writes them.
alter table public.project add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.floors add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.rooms add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.rooms add column if not exists name_ar text generated always as (data ->> 'nameAr') stored;
alter table public.rooms add column if not exists room_type text generated always as (data ->> 'type') stored;
alter table public.rooms add column if not exists status text generated always as (data ->> 'status') stored;
alter table public.requirements add column if not exists room_id text generated always as (data ->> 'roomId') stored;
alter table public.requirements add column if not exists title text generated always as (data ->> 'title') stored;
alter table public.requirements add column if not exists priority text generated always as (data ->> 'priority') stored;
alter table public.requirements add column if not exists status text generated always as (data ->> 'status') stored;
alter table public.reference_items add column if not exists file_id text generated always as (data ->> 'imageId') stored;
alter table public.reference_items add column if not exists title text generated always as (data ->> 'title') stored;
alter table public.reference_items add column if not exists kind text generated always as (data ->> 'kind') stored;
alter table public.files add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.files add column if not exists mime_type text generated always as (data ->> 'type') stored;
alter table public.files add column if not exists size_bytes text generated always as (data ->> 'size') stored;
alter table public.design_versions add column if not exists room_id text generated always as (data ->> 'roomId') stored;
alter table public.design_versions add column if not exists title text generated always as (data ->> 'title') stored;
alter table public.design_versions add column if not exists status text generated always as (data ->> 'status') stored;
alter table public.library_items add column if not exists kind text generated always as (data ->> 'kind') stored;
alter table public.library_items add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.direction_presets add column if not exists name text generated always as (data ->> 'name') stored;
alter table public.comparisons add column if not exists title text generated always as (data ->> 'title') stored;
alter table public.tasks add column if not exists title text generated always as (data ->> 'title') stored;
alter table public.translations add column if not exists source_text text generated always as (data ->> 'source') stored;
alter table public.translations add column if not exists english text generated always as (data ->> 'en') stored;
alter table public.recently_deleted add column if not exists label text generated always as (data ->> 'label') stored;
alter table public.recently_deleted add column if not exists kind text generated always as (data ->> 'kind') stored;

-- ---------------------------------------------------------------------
-- Sync functions (called by the app)
-- ---------------------------------------------------------------------

-- Changes after a position (updated_at, table, id), oldest first.
create or replace function public.sync_pull(
  p_since timestamptz default '-infinity',
  p_tbl text default '',
  p_id text default '',
  p_limit integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
begin
  if not public.is_app_owner() then
    raise exception 'Only the studio owner can read the studio data' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at, s.tbl, s.id), '[]'::jsonb)
  into v_rows
  from (
    select u.tbl, u.id, u.data, u.deleted, u.client_id, u.updated_at
    from (
      select 'project'::text as tbl, x.id, x.data, x.deleted, x.client_id, x.updated_at from public.project x
      union all select 'floors', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.floors x
      union all select 'rooms', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.rooms x
      union all select 'requirements', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.requirements x
      union all select 'reference_items', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.reference_items x
      union all select 'files', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.files x
      union all select 'design_versions', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.design_versions x
      union all select 'library_items', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.library_items x
      union all select 'direction_presets', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.direction_presets x
      union all select 'comparisons', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.comparisons x
      union all select 'tasks', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.tasks x
      union all select 'app_settings', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.app_settings x
      union all select 'translations', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.translations x
      union all select 'recently_deleted', x.id, x.data, x.deleted, x.client_id, x.updated_at from public.recently_deleted x
    ) u
    where (u.updated_at, u.tbl, u.id) > (coalesce(p_since, '-infinity'::timestamptz), coalesce(p_tbl, ''), coalesce(p_id, ''))
    order by u.updated_at, u.tbl, u.id
    limit v_limit
  ) s;

  return jsonb_build_object(
    'rows', v_rows,
    'server_time', clock_timestamp(),
    -- Writes still in flight can carry timestamps up to a few seconds old;
    -- the app re-reads everything newer than this on its next pull.
    'safe_until', clock_timestamp() - interval '60 seconds'
  );
end;
$$;

-- Save a batch of records atomically. Each change: {tbl, id, data, deleted}.
create or replace function public.sync_push(
  p_changes jsonb,
  p_client_id text default null,
  p_force_archive boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_change jsonb;
  v_tbl text;
  v_id text;
  v_deleted boolean;
  v_ts timestamptz;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.is_app_owner() then
    raise exception 'Only the studio owner can change the studio data' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'p_changes must be a JSON array' using errcode = '22023';
  end if;
  if p_force_archive then
    perform set_config('studio.force_archive', 'on', true);
  end if;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_tbl := v_change ->> 'tbl';
    v_id := v_change ->> 'id';
    v_deleted := coalesce((v_change ->> 'deleted')::boolean, false);
    if v_tbl is null or not (v_tbl = any (public.sync_tables())) then
      raise exception 'Unknown table: %', coalesce(v_tbl, '(none)') using errcode = '22023';
    end if;
    if v_id is null or length(v_id) = 0 or length(v_id) > 200 then
      raise exception 'Invalid record id' using errcode = '22023';
    end if;
    if not v_deleted and jsonb_typeof(v_change -> 'data') is distinct from 'object' then
      raise exception 'Record % in % has no data', v_id, v_tbl using errcode = '22023';
    end if;

    execute format(
      'insert into public.%I as t (id, data, deleted, client_id) values ($1, $2, $3, $4)
       on conflict (id) do update set data = excluded.data, deleted = excluded.deleted, client_id = excluded.client_id
       returning t.updated_at', v_tbl)
    using v_id, case when v_deleted then null else v_change -> 'data' end, v_deleted, p_client_id
    into v_ts;

    v_out := v_out || jsonb_build_object('tbl', v_tbl, 'id', v_id, 'updated_at', v_ts);
  end loop;

  return v_out;
end;
$$;

-- Number of stored (not permanently deleted) records per table.
create or replace function public.server_counts()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  t text;
  n bigint;
  v_out jsonb := '{}'::jsonb;
begin
  if not public.is_app_owner() then
    raise exception 'Only the studio owner can read the studio data' using errcode = '42501';
  end if;
  foreach t in array public.sync_tables() loop
    execute format('select count(*) from public.%I where not deleted', t) into n;
    v_out := v_out || jsonb_build_object(t, n);
  end loop;
  return v_out;
end;
$$;

-- Earlier versions of records, newest first.
create or replace function public.history_list(
  p_limit integer default 50,
  p_before bigint default null,
  p_table text default null,
  p_record text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id,
      'table', h.table_name,
      'record_id', h.record_id,
      'label', coalesce(h.data ->> 'nameAr', h.data ->> 'name', h.data ->> 'title', h.data ->> 'label', h.data ->> 'source', h.record_id),
      'label_en', coalesce(h.data ->> 'name', h.data ->> 'title', h.data ->> 'label', h.data ->> 'source', h.record_id),
      'reason', h.reason,
      'client_id', h.client_id,
      'valid_from', h.valid_from,
      'archived_at', h.archived_at
    ) order by h.id desc), '[]'::jsonb)
  from (
    select * from public.record_history r
    where (p_before is null or r.id < p_before)
      and (p_table is null or r.table_name = p_table)
      and (p_record is null or r.record_id = p_record)
    order by r.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) h;
$$;

create or replace function public.history_record(p_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'table', r.table_name, 'record_id', r.record_id, 'data', r.data, 'archived_at', r.archived_at)
  from public.record_history r
  where r.id = p_id;
$$;

revoke all on function public.is_app_owner() from public, anon;
revoke all on function public.claim_app_owner() from public, anon;
revoke all on function public.sync_pull(timestamptz, text, text, integer) from public, anon;
revoke all on function public.sync_push(jsonb, text, boolean) from public, anon;
revoke all on function public.server_counts() from public, anon;
revoke all on function public.history_list(integer, bigint, text, text) from public, anon;
revoke all on function public.history_record(bigint) from public, anon;
revoke all on function public.tg_sync_row() from public, anon, authenticated;
revoke all on function public.tg_archive_row() from public, anon, authenticated;

grant execute on function public.app_status() to anon, authenticated;
grant execute on function public.is_app_owner() to authenticated;
grant execute on function public.claim_app_owner() to authenticated;
grant execute on function public.sync_tables() to authenticated;
grant execute on function public.sync_pull(timestamptz, text, text, integer) to authenticated;
grant execute on function public.sync_push(jsonb, text, boolean) to authenticated;
grant execute on function public.server_counts() to authenticated;
grant execute on function public.history_list(integer, bigint, text, text) to authenticated;
grant execute on function public.history_record(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- File storage: private bucket, owner-only access
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('studio-files', 'studio-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Studio owner can read files" on storage.objects;
create policy "Studio owner can read files" on storage.objects
  for select to authenticated
  using (bucket_id = 'studio-files' and (select public.is_app_owner()));

drop policy if exists "Studio owner can upload files" on storage.objects;
create policy "Studio owner can upload files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio-files' and (select public.is_app_owner()));

drop policy if exists "Studio owner can replace files" on storage.objects;
create policy "Studio owner can replace files" on storage.objects
  for update to authenticated
  using (bucket_id = 'studio-files' and (select public.is_app_owner()))
  with check (bucket_id = 'studio-files' and (select public.is_app_owner()));

drop policy if exists "Studio owner can delete files" on storage.objects;
create policy "Studio owner can delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio-files' and (select public.is_app_owner()));
