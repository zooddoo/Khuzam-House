import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { blobKey, fetchBlob, fullVariant, getOriginal, thumbVariant } from '../files/repo';
import type { FileVariant, StoredFile } from '../types';

/**
 * Object URLs for stored files. URLs are shared and reference-counted across
 * components; missing bytes are downloaded from the cloud on first use.
 */

interface Entry {
  url: string;
  blob: Blob;
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, Entry>();
const RELEASE_DELAY_MS = 30_000;

function acquire(key: string, blob: Blob): string {
  let e = cache.get(key);
  if (e && e.blob !== blob) {
    if (e.count <= 0) URL.revokeObjectURL(e.url);
    cache.delete(key);
    e = undefined;
  }
  if (!e) {
    e = { url: URL.createObjectURL(blob), blob, count: 0, timer: null };
    cache.set(key, e);
  }
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  e.count++;
  return e.url;
}

function release(key: string, blob: Blob) {
  const e = cache.get(key);
  if (!e || e.blob !== blob) return;
  e.count--;
  if (e.count <= 0) {
    e.timer = setTimeout(() => {
      if (e.count <= 0 && cache.get(key) === e) {
        URL.revokeObjectURL(e.url);
        cache.delete(key);
      }
    }, RELEASE_DELAY_MS);
  }
}

/** Drop cached URLs for a file (after deletion). */
export function forgetImage(fileId: string) {
  for (const v of ['thumb', 'display', 'original'] as FileVariant[]) {
    const key = blobKey(fileId, v);
    const e = cache.get(key);
    if (e) URL.revokeObjectURL(e.url);
    cache.delete(key);
  }
}

export interface FileUrlState {
  url: string | null;
  loading: boolean;
  /** The file record or its bytes are not available (yet). */
  missing: boolean;
  file: StoredFile | null;
  /** Download progress 0–1 while fetching from the cloud. */
  progress: number | null;
}

/**
 * URL for showing a stored file as an image: `thumb` for galleries, `full`
 * for viewers. Non-image files without a preview return `url: null` with
 * `file` set so the caller can show an icon instead.
 */
export function useImageUrl(fileId: string | null | undefined, variant: 'thumb' | 'full' = 'thumb'): FileUrlState {
  const file = useLiveQuery(async () => (fileId ? ((await db.files.get(fileId)) ?? null) : null), [fileId]);
  const v: FileVariant | null = file ? (variant === 'thumb' ? thumbVariant(file) : (fullVariant(file) ?? thumbVariant(file))) : null;
  const key = file && v ? blobKey(file.id, v) : null;
  const row = useLiveQuery(async () => (key ? ((await db.blobs.get(key)) ?? null) : null), [key]);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Download what this device does not have yet.
  useEffect(() => {
    if (!file || !v || row !== null || failed === key) return;
    let alive = true;
    setProgress(0);
    fetchBlob(file, v, (loaded, total) => {
      if (alive && total) setProgress(loaded / total);
    })
      .then((b) => {
        if (alive && !b) setFailed(key);
      })
      .catch(() => {
        if (alive) setFailed(key);
      })
      .finally(() => {
        if (alive) setProgress(null);
      });
    return () => {
      alive = false;
    };
  }, [file, v, row, key, failed]);

  const blob = row?.blob ?? null;
  const [acquired, setAcquired] = useState<{ key: string; blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!key || !blob) {
      setAcquired(null);
      return;
    }
    setAcquired({ key, blob, url: acquire(key, blob) });
    return () => release(key, blob);
  }, [key, blob]);
  // Reuse an existing URL during the first render to avoid a flash.
  const peek = key && blob && cache.get(key)?.blob === blob ? cache.get(key)!.url : null;
  const url = key && blob ? (peek ?? (acquired?.key === key && acquired.blob === blob ? acquired.url : null)) : null;

  const loadingMeta = fileId ? file === undefined : false;
  return {
    url,
    loading: loadingMeta || (!!v && !url && failed !== key),
    missing: !!fileId && (file === null || (failed === key && !url)),
    file: file ?? null,
    progress,
  };
}

/** Load the full original of a file (for downloads), from this device or the cloud. */
export async function getOriginalBlob(fileId: string): Promise<{ blob: Blob; name: string } | null> {
  const r = await getOriginal(fileId);
  return r ? { blob: r.blob, name: r.name } : null;
}
