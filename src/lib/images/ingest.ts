import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { tr } from '../../i18n/messages';

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

export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError(tr().files.encodeFailed))), type, quality);
  });
}

export async function renderScaled(bitmap: ImageBitmap, maxEdge: number, type: string, quality: number, background?: string): Promise<Blob> {
  const s = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = canvasFor(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError(tr().files.canvasUnavailable);
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
 * Preview variants for an image. The original bytes are never changed; a
 * thumbnail (and, for HEIC, a displayable JPEG copy) is created alongside.
 */
export async function makeImageVariants(file: Blob, name: string): Promise<{ width: number; height: number; display: Blob | null; thumb: Blob }> {
  const t = tr().files;
  const meta = { type: file.type, name };
  let display: Blob | null = null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    if (!isHeic(meta)) throw new ImageError(t.unreadableImage(name));
    try {
      display = await convertHeic(file);
      bitmap = await decodeImage(display);
    } catch {
      throw new ImageError(t.heicFailed(name));
    }
  }
  const thumb = await renderScaled(bitmap, THUMB_EDGE, 'image/webp', 0.86);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
  return { width, height, display, thumb };
}

/**
 * Copy of an image prepared for sending to an AI provider: resized to
 * `maxEdge`, re-encoded, and stripped of metadata such as GPS location.
 * The stored original is never changed.
 */
export async function prepareForUpload(source: Blob, maxEdge: number, format: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  const bitmap = await decodeImage(source);
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

/** Files (of any type) from a paste event. Pasted screenshots get a readable name. */
export function filesFromClipboard(e: ClipboardEvent | ReactClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  const files: File[] = [];
  for (const it of items) {
    if (it.kind !== 'file') continue;
    const f = it.getAsFile();
    if (!f) continue;
    if (f.type.startsWith('image/') && (!f.name || f.name === 'image.png')) {
      files.push(new File([f], `pasted-${Date.now()}.${extensionFor(f.type)}`, { type: f.type }));
    } else files.push(f);
  }
  return files;
}

/** @deprecated use filesFromClipboard */
export const imagesFromClipboard = (e: ClipboardEvent | ReactClipboardEvent) => filesFromClipboard(e).filter((f) => f.type.startsWith('image/') || isHeic(f));
