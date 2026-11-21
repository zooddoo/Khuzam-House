import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Comparison,
  DesignTask,
  DesignVersion,
  DirectionPreset,
  Floor,
  LibraryItem,
  Project,
  Reference,
  Requirement,
  RestorePoint,
  Room,
  StoredImage,
} from '../types';

/**
 * Local-first database (IndexedDB via Dexie).
 *
 * Images are stored as Blobs in their own table, separate from metadata, so
 * galleries can load thumbnails without touching originals. Originals are
 * never modified.
 */
export class StudioDB extends Dexie {
  project!: EntityTable<Project, 'id'>;
  floors!: EntityTable<Floor, 'id'>;
  rooms!: EntityTable<Room, 'id'>;
  requirements!: EntityTable<Requirement, 'id'>;
  references!: EntityTable<Reference, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;
  versions!: EntityTable<DesignVersion, 'id'>;
  library!: EntityTable<LibraryItem, 'id'>;
  presets!: EntityTable<DirectionPreset, 'id'>;
  comparisons!: EntityTable<Comparison, 'id'>;
  tasks!: EntityTable<DesignTask, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
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
  }
}

export const db = new StudioDB();

/** Tables that make up the project (everything except settings and restore points). */
export const PROJECT_TABLES = [
  'project',
  'floors',
  'rooms',
  'requirements',
  'references',
  'images',
  'versions',
  'library',
  'presets',
  'comparisons',
  'tasks',
] as const;

export type ProjectTableName = (typeof PROJECT_TABLES)[number];
