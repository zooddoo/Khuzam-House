import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { newId, nowIso } from '../ids';
import type { StoredImage } from '../types';

export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
const THUMB_EDGE = 720;

const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/heic', 'image/heif'];

export class ImageError extends Error {}

export function isHeic(file: { type: string; name?: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name ?? '');
}

export function isAcceptedImage(file: { type: string; name?: string }): boolean {
  if (isHeic(file)) return true;
  if (file.type === 'image/svg+xml') return false;
  return RASTER_TYPES.includes(file.type) || (file.type === '' && /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name ?? ''));
}

export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/heic,image/heif,.heic,.heif';

async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function canvasFor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Could not encode image'))), type, quality);
  });
}

export async function renderScaled(bitmap: ImageBitmap, maxEdge: number, type: string, quality: number, background?: string): Promise<Blob> {
  const s = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = canvasFor(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Canvas is not available in this browser');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return toBlob(canvas, type, quality);
}

async function convertHeic(file: Blob): Promise<Blob> {
  const mod = await import('heic2any');
  const heic2any = (mod as unknown as { default: (o: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]> }).default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

/**
 * Turn an uploaded file into a StoredImage. The original bytes are kept
 * untouched; a thumbnail (and, for HEIC, a displayable JPEG copy) is added.
 */
export async function ingestImage(file: Blob, name: string): Promise<StoredImage> {
  const meta = { type: file.type, name };
  if (!isAcceptedImage(meta)) {
    throw new ImageError(`${name}: unsupported file type${file.type ? ` (${file.type})` : ''}. Use JPEG, PNG, WebP, HEIC, GIF or AVIF.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError(`${name} is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }
  let display: Blob | null = null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    if (!isHeic(meta)) throw new ImageError(`${name} could not be read. The file may be damaged or in a format this browser cannot open.`);
    try {
      display = await convertHeic(file);
      bitmap = await decode(display);
    } catch {
      throw new ImageError(`${name}: this HEIC photo could not be converted. Export it as JPEG and try again.`);
    }
  }
  const thumb = await renderScaled(bitmap, THUMB_EDGE, 'image/webp', 0.86);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
  return {
    id: newId('img'),
    blob: file,
    display,
    thumb,
    name,
    type: file.type || (isHeic(meta) ? 'image/heic' : 'application/octet-stream'),
    size: file.size,
    width,
    height,
    createdAt: nowIso(),
  };
}

/**
 * Copy of an image prepared for sending to an AI provider: resized to
 * `maxEdge`, re-encoded, and stripped of metadata such as GPS location.
 * The stored original is never changed.
 */
export async function prepareForUpload(img: StoredImage, maxEdge: number, format: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  const source = img.display ?? img.blob;
  const bitmap = await decode(source);
  try {
    return await renderScaled(bitmap, maxEdge, format, 0.92, format === 'image/jpeg' ? '#ffffff' : undefined);
  } finally {
    bitmap.close();
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function extensionFor(type: string, fallbackName = ''): string {
  const fromName = fallbackName.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[type] ?? fromName ?? 'bin';
}

/** Read image files from a paste event. */
export function imagesFromClipboard(e: ClipboardEvent | ReactClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  const files: File[] = [];
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f && (f.type.startsWith('image/') || isHeic(f))) {
        const ext = extensionFor(f.type);
        files.push(f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }));
      }
    }
  }
  return files;
}
