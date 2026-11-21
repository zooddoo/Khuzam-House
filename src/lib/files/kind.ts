import type { FileKind } from '../types';

/** Lower-case extension without the dot, or '' if the name has none. */
export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

const EXT_KIND: Record<string, FileKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  avif: 'image',
  bmp: 'image',
  heic: 'image',
  heif: 'image',
  svg: 'image',
  tif: 'image',
  tiff: 'image',
  pdf: 'pdf',
  mp4: 'video',
  mov: 'video',
  m4v: 'video',
  webm: 'video',
  '3gp': 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  wav: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  amr: 'audio',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  pages: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  xlsm: 'spreadsheet',
  ods: 'spreadsheet',
  csv: 'spreadsheet',
  numbers: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  key: 'presentation',
  dwg: 'drawing',
  dxf: 'drawing',
  dwf: 'drawing',
  skp: 'drawing',
  rvt: 'drawing',
  ifc: 'drawing',
  '3dm': 'drawing',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  txt: 'text',
  md: 'text',
  json: 'text',
  xml: 'text',
};

export function fileKindOf(type: string, name: string): FileKind {
  const ext = extOf(name);
  const t = (type || '').toLowerCase();
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (t.includes('spreadsheet') || t.includes('excel') || t === 'text/csv') return 'spreadsheet';
  if (t.includes('presentation') || t.includes('powerpoint')) return 'presentation';
  if (t.includes('word') || t.includes('opendocument.text') || t === 'application/rtf') return 'document';
  if (t.includes('zip') || t.includes('compressed') || t.includes('x-7z') || t.includes('x-rar')) return 'archive';
  if (t.startsWith('text/')) return 'text';
  if (t.includes('dwg') || t.includes('dxf') || t.includes('acad')) return 'drawing';
  return 'other';
}

/** Raster formats the browser can decode into a bitmap (thumbnails, AI uploads). */
export function isRasterImage(type: string, name = ''): boolean {
  const t = type.toLowerCase();
  if (t === 'image/svg+xml') return false;
  if (/^image\/(jpeg|png|webp|gif|avif|bmp|heic|heif)$/.test(t)) return true;
  return t === '' && /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(name);
}

/** Best-effort MIME type from the file name, for files the browser gives no type. */
export function guessMime(name: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    txt: 'text/plain',
    dwg: 'image/vnd.dwg',
    dxf: 'image/vnd.dxf',
    zip: 'application/zip',
  };
  return map[extOf(name)] ?? '';
}
