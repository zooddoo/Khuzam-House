import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Comparison,
  DesignTask,
  DesignVersion,
  DirectionPreset,
  FileBlob,
  Floor,
  LibraryItem,
  MetaEntry,
  OutboxEntry,
  Project,
  Reference,
  Requirement,
  RestorePoint,
  Room,
  StoredFile,
  Translation,
  TrashEntry,
} from '../types';
import { outboxMiddleware } from '../sync/outbox';
import { SYNCED_TABLES } from '../sync/tables';
import { extOf, fileKindOf } from '../files/kind';

/**
 * The studio's database on this device (IndexedDB via Dexie).
 *
 * Every table listed in SYNC_TABLE_MAP is mirrored to Supabase: each write
 * is queued in `outbox` in the same transaction and uploaded by the sync
 * engine. File bytes are cached in `blobs` (originals untouched) and stored
 * in Supabase Storage.
 */
export class StudioDB extends Dexie {
  project!: EntityTable<Project, 'id'>;
  floors!: EntityTable<Floor, 'id'>;
  rooms!: EntityTable<Room, 'id'>;
  requirements!: EntityTable<Requirement, 'id'>;
  references!: EntityTable<Reference, 'id'>;
  files!: EntityTable<StoredFile, 'id'>;
  blobs!: EntityTable<FileBlob, 'key'>;
  versions!: EntityTable<DesignVersion, 'id'>;
  library!: EntityTable<LibraryItem, 'id'>;
  presets!: EntityTable<DirectionPreset, 'id'>;
  comparisons!: EntityTable<Comparison, 'id'>;
  tasks!: EntityTable<DesignTask, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  translations!: EntityTable<Translation, 'id'>;
  trash!: EntityTable<TrashEntry, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;
  restorePoints!: EntityTable<RestorePoint, 'id'>;

  constructor(name = 'bait-khuzam-studio') {
    super(name);
    this.version(1).stores({
      project: 'id',
      floors: 'id, order',
      rooms: 'id, floorId, status, order, updatedAt',
      requirements: 'id, roomId, status, priority, category, order, updatedAt',
      references:
        'id, imageId, kind, createdAt, updatedAt, *roomIds, *requirementIds, *versionIds, *wallKeys, *elementIds, *directionRoomIds, *libraryItemIds, *tags',
      images: 'id, createdAt',
      versions: 'id, roomId, status, number, createdAt, updatedAt',
      library: 'id, kind, category, updatedAt, *roomIds',
      presets: 'id, order',
      comparisons: 'id, roomId, updatedAt',
      tasks: 'id, roomId, done, createdAt',
      settings: 'id',
      restorePoints: 'id, createdAt',
    });

    // v2: files of any type + cloud sync tables. Images move to files/blobs.
    this.version(2)
      .stores({
        references:
          'id, imageId, kind, createdAt, updatedAt, *roomIds, *requirementIds, *versionIds, *wallKeys, *elementIds, *directionRoomIds, *libraryItemIds, *referenceIds, *tags',
        files: 'id, createdAt, kind',
        blobs: 'key, fileId, pending',
        translations: 'id, updatedAt',
        trash: 'id, deletedAt, kind, roomId',
        outbox: 'id, at',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const images = tx.table('images');
        const files = tx.table('files');
        const blobs = tx.table('blobs');
        const now = new Date().toISOString();
        type LegacyImage = Record<string, unknown> & { id: string; name: string; type: string; blob: Blob; display: Blob | null; thumb: Blob | null };
        const legacy = (await images.toArray()) as LegacyImage[];
        for (const img of legacy) {
          const name = img.name || `${img.id}`;
          await files.put({
            id: img.id,
            name,
            type: img.type || '',
            size: (img.size as number) ?? img.blob?.size ?? 0,
            kind: fileKindOf(img.type || '', name),
            ext: extOf(name),
            width: (img.width as number) ?? 0,
            height: (img.height as number) ?? 0,
            hasDisplay: !!img.display,
            hasThumb: !!img.thumb,
            sha256: null,
            createdAt: (img.createdAt as string) ?? now,
          } satisfies StoredFile);
          const rows: FileBlob[] = [];
          if (img.blob) rows.push({ key: `${img.id}:original`, fileId: img.id, variant: 'original', blob: img.blob, pending: 1, cachedAt: now });
          if (img.display) rows.push({ key: `${img.id}:display`, fileId: img.id, variant: 'display', blob: img.display, pending: 1, cachedAt: now });
          if (img.thumb) rows.push({ key: `${img.id}:thumb`, fileId: img.id, variant: 'thumb', blob: img.thumb, pending: 1, cachedAt: now });
          if (rows.length) await blobs.bulkPut(rows);
        }
        await tx
          .table('references')
          .toCollection()
          .modify((r: Partial<Reference>) => {
            if (!Array.isArray(r.referenceIds)) r.referenceIds = [];
          });
        await tx
          .table('restorePoints')
          .toCollection()
          .modify((p: Partial<RestorePoint>) => {
            if (!p.format) p.format = 'zip';
          });
        // Data created before cloud storage existed: offered for upload on first sign-in.
        if ((await tx.table('project').count()) > 0) {
          await tx.table('meta').put({ key: 'legacy', value: { status: 'pending', detectedAt: now } });
        }
      });

    // v3: the old images table is no longer needed (its contents moved in v2).
    this.version(3).stores({ images: null });

    this.use(outboxMiddleware(new Set(SYNCED_TABLES)));
  }
}

export const db = new StudioDB();

/** Tables that make up the project data (everything synced except settings). */
export const PROJECT_TABLES = [
  'project',
  'floors',
  'rooms',
  'requirements',
  'references',
  'files',
  'versions',
  'library',
  'presets',
  'comparisons',
  'tasks',
  'translations',
  'trash',
] as const;

export type ProjectTableName = (typeof PROJECT_TABLES)[number];

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
