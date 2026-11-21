import { db } from '../db/db';
import { nowIso } from '../ids';
import { isCloudConfigured } from '../sync/client';
import { downloadObject, signedUrl, storagePath } from '../sync/storage';
import type { FileBlob, FileVariant, StoredFile } from '../types';
import type { IngestedFile } from './ingest';

/**
 * File bytes on this device. Every original, display copy and thumbnail is
 * uploaded to Supabase Storage; this device keeps a cache and downloads
 * what it is missing when it is first shown.
 */

export function blobKey(fileId: string, variant: FileVariant): string {
  return `${fileId}:${variant}`;
}

export function blobRowsFor(ing: IngestedFile): FileBlob[] {
  const now = nowIso();
  const rows: FileBlob[] = [{ key: blobKey(ing.file.id, 'original'), fileId: ing.file.id, variant: 'original', blob: ing.original, pending: 1, cachedAt: now }];
  if (ing.display) rows.push({ key: blobKey(ing.file.id, 'display'), fileId: ing.file.id, variant: 'display', blob: ing.display, pending: 1, cachedAt: now });
  if (ing.thumb) rows.push({ key: blobKey(ing.file.id, 'thumb'), fileId: ing.file.id, variant: 'thumb', blob: ing.thumb, pending: 1, cachedAt: now });
  return rows;
}

/** Store a new file and its bytes. Call inside a transaction that includes db.files and db.blobs. */
export async function putIngested(ing: IngestedFile): Promise<void> {
  await db.files.put(ing.file);
  await db.blobs.bulkPut(blobRowsFor(ing));
}

export async function cachedBlob(fileId: string, variant: FileVariant): Promise<Blob | null> {
  return (await db.blobs.get(blobKey(fileId, variant)))?.blob ?? null;
}

/* Downloads (deduplicated, at most 4 at a time) ----------------------- */

const inflight = new Map<string, Promise<Blob | null>>();
let active = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export type ProgressFn = (loaded: number, total: number) => void;

/** The bytes of a file variant: from this device, or downloaded (and cached) from the cloud. */
export function fetchBlob(file: StoredFile, variant: FileVariant, onProgress?: ProgressFn): Promise<Blob | null> {
  const key = blobKey(file.id, variant);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    const local = await cachedBlob(file.id, variant);
    if (local) return local;
    if (!isCloudConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
    const blob = await slot(() => downloadObject(storagePath(file, variant), onProgress));
    const typed = blob.type || variant !== 'original' ? blob : new Blob([blob], { type: file.type });
    await db.blobs.put({ key, fileId: file.id, variant, blob: typed, pending: 0, cachedAt: nowIso() });
    return typed;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Variant to use for a small preview, or null if the file has no visual preview. */
export function thumbVariant(file: Pick<StoredFile, 'kind' | 'hasThumb' | 'hasDisplay'>): FileVariant | null {
  if (file.hasThumb) return 'thumb';
  if (file.kind === 'image') return file.hasDisplay ? 'display' : 'original';
  return null;
}

/** Variant to show an image at full size (HEIC photos use their JPEG copy). */
export function fullVariant(file: Pick<StoredFile, 'kind' | 'hasDisplay'>): FileVariant | null {
  if (file.kind !== 'image') return null;
  return file.hasDisplay ? 'display' : 'original';
}

export async function getFile(fileId: string): Promise<StoredFile | undefined> {
  return db.files.get(fileId);
}

/** Original bytes and name (downloads, backups, AI uploads). */
export async function getOriginal(fileId: string, onProgress?: ProgressFn): Promise<{ blob: Blob; name: string; file: StoredFile } | null> {
  const file = await db.files.get(fileId);
  if (!file) return null;
  const blob = await fetchBlob(file, 'original', onProgress);
  return blob ? { blob, name: file.name, file } : null;
}

/** Browser-displayable image bytes (JPEG copy for HEIC, otherwise the original). */
export async function getDisplayBlob(fileId: string, onProgress?: ProgressFn): Promise<Blob | null> {
  const file = await db.files.get(fileId);
  if (!file) return null;
  const v = fullVariant(file) ?? 'original';
  return fetchBlob(file, v, onProgress);
}

/** A link that streams the original from the cloud (videos), or a local object URL when cached. */
export async function streamUrl(file: StoredFile): Promise<{ url: string; revoke?: () => void } | null> {
  const local = await cachedBlob(file.id, 'original');
  if (local) {
    const url = URL.createObjectURL(local);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  if (!isCloudConfigured || !navigator.onLine) return null;
  return { url: await signedUrl(storagePath(file, 'original')) };
}

/** Space used by file bytes on this device, and how much could be freed (already in the cloud). */
export async function localFileUsage(): Promise<{ total: number; freeable: number; pending: number }> {
  let total = 0;
  let freeable = 0;
  let pending = 0;
  await db.blobs.each((b) => {
    const size = b.blob?.size ?? 0;
    total += size;
    if (b.pending) pending += size;
    else if (b.variant !== 'thumb') freeable += size;
  });
  return { total, freeable, pending };
}

/** Remove cached originals that are safely in the cloud (they download again when opened). Thumbnails stay. */
export async function freeUpSpace(): Promise<number> {
  let freed = 0;
  const keys: string[] = [];
  await db.blobs.each((b) => {
    if (!b.pending && b.variant !== 'thumb') {
      keys.push(b.key);
      freed += b.blob?.size ?? 0;
    }
  });
  await db.blobs.bulkDelete(keys);
  return freed;
}
