import { useEffect, useState } from 'react';
import { db } from '../db/db';

type Variant = 'thumb' | 'full';

interface Entry {
  url: string | null;
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
  promise: Promise<string | null> | null;
}

const cache = new Map<string, Entry>();
const RELEASE_DELAY_MS = 30_000;

function load(imageId: string, variant: Variant): Promise<string | null> {
  return db.images.get(imageId).then((img) => {
    if (!img) return null;
    const blob = variant === 'thumb' ? (img.thumb ?? img.display ?? img.blob) : (img.display ?? img.blob);
    return URL.createObjectURL(blob);
  });
}

function acquire(imageId: string, variant: Variant): Entry {
  const key = `${imageId}:${variant}`;
  let e = cache.get(key);
  if (!e) {
    e = { url: null, count: 0, timer: null, promise: null };
    cache.set(key, e);
    const entry = e;
    entry.promise = load(imageId, variant).then((url) => {
      entry.url = url;
      return url;
    });
  }
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  e.count++;
  return e;
}

function release(imageId: string, variant: Variant) {
  const key = `${imageId}:${variant}`;
  const e = cache.get(key);
  if (!e) return;
  e.count--;
  if (e.count <= 0) {
    e.timer = setTimeout(() => {
      if (e.count <= 0) {
        if (e.url) URL.revokeObjectURL(e.url);
        cache.delete(key);
      }
    }, RELEASE_DELAY_MS);
  }
}

/** Drop cached URLs for an image (after deletion). */
export function forgetImage(imageId: string) {
  for (const v of ['thumb', 'full'] as Variant[]) {
    const key = `${imageId}:${v}`;
    const e = cache.get(key);
    if (e?.url) URL.revokeObjectURL(e.url);
    cache.delete(key);
  }
}

/** Object URL for a stored image, shared and reference-counted across components. */
export function useImageUrl(imageId: string | null | undefined, variant: Variant = 'thumb') {
  const [state, setState] = useState<{ url: string | null; loading: boolean; missing: boolean }>({
    url: null,
    loading: !!imageId,
    missing: false,
  });

  useEffect(() => {
    if (!imageId) {
      setState({ url: null, loading: false, missing: false });
      return;
    }
    let alive = true;
    const entry = acquire(imageId, variant);
    if (entry.url) setState({ url: entry.url, loading: false, missing: false });
    else {
      setState((s) => ({ ...s, loading: true }));
      entry.promise?.then((url) => {
        if (alive) setState({ url, loading: false, missing: url === null });
      });
    }
    return () => {
      alive = false;
      release(imageId, variant);
    };
  }, [imageId, variant]);

  return state;
}

/** Load the full original blob of an image (for downloads). */
export async function getOriginalBlob(imageId: string): Promise<{ blob: Blob; name: string } | null> {
  const img = await db.images.get(imageId);
  return img ? { blob: img.blob, name: img.name } : null;
}
