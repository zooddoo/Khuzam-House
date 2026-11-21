// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { StudioDB } from '../db/db';
import { createRoomRecord } from '../db/factories';
import { markSilent } from './outbox';

function room(id: string, name = 'Room') {
  return { ...createRoomRecord({ name, type: 'other' }), id };
}

describe('outbox change tracking', () => {
  it('queues every kind of write to a synced table in the same transaction', async () => {
    const db = new StudioDB(`outbox-${Math.random()}`);
    await db.rooms.put(room('r1'));
    expect((await db.outbox.toArray()).map((e) => e.id)).toEqual(['rooms|r1']);
    const rev1 = (await db.outbox.get('rooms|r1'))!.rev;

    await db.rooms.update('r1', { name: 'Majlis' });
    expect((await db.outbox.get('rooms|r1'))!.rev).not.toBe(rev1);

    await db.rooms.bulkAdd([room('r2'), room('r3')]);
    await db.rooms.where('id').anyOf(['r2', 'r3']).modify({ status: 'ready' });
    await db.rooms.delete('r2');
    expect((await db.outbox.orderBy('id').primaryKeys()).sort()).toEqual(['rooms|r1', 'rooms|r2', 'rooms|r3']);

    await db.outbox.clear();
    await db.rooms.clear();
    expect((await db.outbox.orderBy('id').primaryKeys()).sort()).toEqual(['rooms|r1', 'rooms|r3']);

    // Tables that are not synced are left alone.
    await db.outbox.clear();
    await db.meta.put({ key: 'x', value: 1 });
    expect(await db.outbox.count()).toBe(0);
    db.close();
  });

  it('does not queue writes applied from the cloud', async () => {
    const db = new StudioDB(`outbox-${Math.random()}`);
    await db.transaction('rw', db.rooms, db.requirements, async (tx) => {
      markSilent(tx.idbtrans);
      await db.rooms.put(room('remote'));
    });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.rooms.get('remote')).toBeTruthy();
    // …but later local edits of the same record are queued.
    await db.rooms.update('remote', { name: 'Edited here' });
    expect(await db.outbox.count()).toBe(1);
    db.close();
  });

  it('rolls the queue back with the change when a transaction fails', async () => {
    const db = new StudioDB(`outbox-${Math.random()}`);
    await expect(
      db.transaction('rw', db.rooms, async () => {
        await db.rooms.put(room('r9'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.rooms.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    db.close();
  });

  it('moves version-1 images into files and cached blobs and flags the data for upload', async () => {
    const name = `legacy-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
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
    await v1.open();
    await v1.table('project').put({ id: 'project', name: 'Bait Khuzam' });
    await v1.table('images').put({
      id: 'img_1',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      display: null,
      thumb: new Blob([new Uint8Array([9])], { type: 'image/webp' }),
      name: 'photo.JPG',
      type: 'image/jpeg',
      size: 3,
      width: 40,
      height: 30,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await v1.table('references').put({ id: 'ref_1', imageId: 'img_1', roomIds: [], tags: [] });
    v1.close();

    const db = new StudioDB(name);
    await db.open();
    expect(await db.files.get('img_1')).toMatchObject({ name: 'photo.JPG', kind: 'image', ext: 'jpg', width: 40, hasThumb: true, hasDisplay: false });
    const blobs = await db.blobs.where('fileId').equals('img_1').toArray();
    expect(blobs.map((b) => `${b.variant}:${b.pending}`).sort()).toEqual(['original:1', 'thumb:1']);
    expect((await db.references.get('ref_1'))?.referenceIds).toEqual([]);
    expect((await db.meta.get('legacy'))?.value).toMatchObject({ status: 'pending' });
    expect(db.tables.map((t) => t.name)).not.toContain('images');
    // The upgrade itself queues nothing: the first sign-in decides what to upload.
    expect(await db.outbox.count()).toBe(0);
    db.close();
  });
});
