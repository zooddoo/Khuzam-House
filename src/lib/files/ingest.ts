import { newId, nowIso } from '../ids';
import { decodeImage, isHeic, makeImageVariants } from '../images/ingest';
import { extOf, fileKindOf, guessMime, isRasterImage } from './kind';
import { pdfThumbnail } from './pdf';
import { tr } from '../../i18n/messages';
import { fmtBytes } from '../../i18n/format';
import type { StoredFile } from '../types';

/**
 * Turn a picked / dropped / pasted file into a StoredFile plus the bytes to
 * keep: the original (never modified), and for images, PDFs and videos a
 * small preview (and a JPEG copy of HEIC photos so every browser can show them).
 */

export class FileError extends Error {}

export interface IngestedFile {
  file: StoredFile;
  original: Blob;
  display: Blob | null;
  thumb: Blob | null;
}

export const DEFAULT_MAX_UPLOAD_MB = 50;
const HASH_LIMIT = 150 * 1024 * 1024;

async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    if (!crypto?.subtle || blob.size > HASH_LIMIT) return null;
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Poster frame of a video (best effort — some formats cannot be decoded by the browser). */
async function videoPoster(blob: Blob, maxEdge = 720): Promise<{ thumb: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('video'));
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 4);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 1500);
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('video size');
    const s = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/webp', 0.85));
    return { thumb, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function ingestFile(blob: Blob, name: string, opts: { maxBytes: number; requireImage?: boolean }): Promise<IngestedFile> {
  const t = tr().files;
  const cleanName = (name || 'file').trim() || 'file';
  const type = blob.type || guessMime(cleanName) || (isHeic({ type: '', name: cleanName }) ? 'image/heic' : '');
  const kind = fileKindOf(type, cleanName);
  if (blob.size === 0) throw new FileError(t.empty(cleanName));
  if (blob.size > opts.maxBytes) throw new FileError(tr().sync.fileTooLarge(cleanName, fmtBytes(blob.size), fmtBytes(opts.maxBytes)));
  if (opts.requireImage && !isRasterImage(type, cleanName)) throw new FileError(t.notAnImage(cleanName));

  let width = 0;
  let height = 0;
  let display: Blob | null = null;
  let thumb: Blob | null = null;

  if (kind === 'image' && isRasterImage(type, cleanName)) {
    try {
      const v = await makeImageVariants(blob, cleanName);
      ({ width, height, display, thumb } = v);
    } catch (e) {
      if (opts.requireImage) throw new FileError((e as Error).message);
      // Keep the file anyway (e.g. an unusual image format): it can still be downloaded.
    }
  } else if (kind === 'pdf') {
    try {
      const p = await withTimeout(pdfThumbnail(blob), 20_000);
      thumb = p.thumb;
      width = p.width;
      height = p.height;
    } catch {
      /* preview is optional */
    }
  } else if (kind === 'video') {
    try {
      const v = await withTimeout(videoPoster(blob), 10_000);
      thumb = v.thumb;
      width = v.width;
      height = v.height;
    } catch {
      /* preview is optional */
    }
  }

  const file: StoredFile = {
    id: newId('file'),
    name: cleanName,
    type,
    size: blob.size,
    kind,
    ext: extOf(cleanName),
    width,
    height,
    hasDisplay: !!display,
    hasThumb: !!thumb,
    sha256: await sha256Hex(blob),
    createdAt: nowIso(),
  };
  return { file, original: blob, display, thumb };
}

/** Quick check (before storing) that a decoded image is usable as a design input. */
export async function canDecodeImage(blob: Blob): Promise<boolean> {
  try {
    const bmp = await decodeImage(blob);
    bmp.close();
    return true;
  } catch {
    return false;
  }
}
