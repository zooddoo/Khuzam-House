/**
 * Local (IndexedDB) tables that are mirrored to Supabase, and the name of the
 * matching Postgres table. Keep in sync with public.sync_tables() in
 * supabase/migrations.
 */
export const SYNC_TABLE_MAP = {
  project: 'project',
  floors: 'floors',
  rooms: 'rooms',
  requirements: 'requirements',
  references: 'reference_items',
  files: 'files',
  versions: 'design_versions',
  library: 'library_items',
  presets: 'direction_presets',
  comparisons: 'comparisons',
  tasks: 'tasks',
  settings: 'app_settings',
  translations: 'translations',
  trash: 'recently_deleted',
} as const;

export type SyncedTable = keyof typeof SYNC_TABLE_MAP;
export type ServerTable = (typeof SYNC_TABLE_MAP)[SyncedTable];

export const SYNCED_TABLES = Object.keys(SYNC_TABLE_MAP) as SyncedTable[];
export const SERVER_TABLES = Object.values(SYNC_TABLE_MAP) as ServerTable[];

const SERVER_TO_LOCAL = new Map<string, SyncedTable>(SYNCED_TABLES.map((t) => [SYNC_TABLE_MAP[t], t]));

export function localTableFor(server: string): SyncedTable | null {
  return SERVER_TO_LOCAL.get(server) ?? null;
}

export function isSyncedTable(name: string): name is SyncedTable {
  return Object.prototype.hasOwnProperty.call(SYNC_TABLE_MAP, name);
}

/** Storage bucket holding every original file, display copy and thumbnail. */
export const FILES_BUCKET = 'studio-files';
