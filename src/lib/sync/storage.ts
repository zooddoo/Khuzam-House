import { cloudConfig, getAccessToken, supabase } from './client';
import { FILES_BUCKET } from './tables';
import type { FileVariant, StoredFile } from '../types';

/**
 * Supabase Storage access for file bytes. Uploads and downloads use
 * XMLHttpRequest so progress can be shown.
 */

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'network' | 'auth' | 'too-large' | 'forbidden' | 'not-found' | 'server',
  ) {
    super(message);
  }
}

export function storagePath(file: Pick<StoredFile, 'id' | 'ext'>, variant: FileVariant): string {
  const ext = (file.ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  if (variant === 'original') return `files/${file.id}/original${ext ? `.${ext}` : ''}`;
  return `files/${file.id}/${variant}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function classify(status: number, body: string): StorageError {
  let message = body;
  try {
    const j = JSON.parse(body) as { message?: string; error?: string; statusCode?: string };
    message = j.message || j.error || body;
    const code = Number(j.statusCode);
    if (code === 413 || /maximum allowed size|too large/i.test(message)) return new StorageError(message, 413, 'too-large');
    if (code === 404 || /not.?found/i.test(message)) return new StorageError(message, 404, 'not-found');
    if (code === 403 || /row-level security|unauthori[sz]ed|permission/i.test(message)) return new StorageError(message, 403, 'forbidden');
  } catch {
    /* not JSON */
  }
  if (status === 0) return new StorageError('network error', 0, 'network');
  if (status === 413) return new StorageError(message || 'too large', 413, 'too-large');
  if (status === 401) return new StorageError(message || 'unauthorized', 401, 'auth');
  if (status === 403) return new StorageError(message || 'forbidden', 403, 'forbidden');
  if (status === 404) return new StorageError(message || 'not found', 404, 'not-found');
  return new StorageError(message || `HTTP ${status}`, status, 'server');
}

function xhrRequest(opts: {
  method: string;
  url: string;
  token: string;
  body?: Blob;
  headers?: Record<string, string>;
  responseType?: XMLHttpRequestResponseType;
  onUploadProgress?: (loaded: number, total: number) => void;
  onDownloadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token}`);
    xhr.setRequestHeader('apikey', cloudConfig.key);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    if (opts.responseType) xhr.responseType = opts.responseType;
    if (opts.onUploadProgress) xhr.upload.onprogress = (e) => opts.onUploadProgress!(e.loaded, e.lengthComputable ? e.total : (opts.body?.size ?? 0));
    if (opts.onDownloadProgress) xhr.onprogress = (e) => opts.onDownloadProgress!(e.loaded, e.lengthComputable ? e.total : 0);
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new StorageError('network error', 0, 'network'));
    xhr.ontimeout = () => reject(new StorageError('timed out', 0, 'network'));
    xhr.onabort = () => reject(new StorageError('cancelled', 0, 'network'));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(opts.body ?? null);
  });
}

async function token(): Promise<string> {
  const t = await getAccessToken();
  if (!t) throw new StorageError('not signed in', 401, 'auth');
  return t;
}

async function responseText(xhr: XMLHttpRequest): Promise<string> {
  if (xhr.responseType === 'blob' && xhr.response instanceof Blob) return xhr.response.text();
  return typeof xhr.response === 'string' ? xhr.response : xhr.responseText;
}

/** Upload (or replace) one object. Resolves when the bytes are stored. */
export async function uploadObject(path: string, blob: Blob, contentType: string, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  const doUpload = async (t: string) =>
    xhrRequest({
      method: 'POST',
      url: `${cloudConfig.url}/storage/v1/object/${FILES_BUCKET}/${encodePath(path)}`,
      token: t,
      body: blob,
      headers: { 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
      onUploadProgress: onProgress,
      signal,
    });
  let xhr = await doUpload(await token());
  if (xhr.status === 401 || (xhr.status === 400 && /jwt|expired/i.test(xhr.responseText))) {
    await supabase().auth.refreshSession();
    xhr = await doUpload(await token());
  }
  if (xhr.status >= 200 && xhr.status < 300) return;
  throw classify(xhr.status, await responseText(xhr));
}

/** Download one object as a Blob (authenticated). */
export async function downloadObject(path: string, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<Blob> {
  const doDownload = async (t: string) =>
    xhrRequest({
      method: 'GET',
      url: `${cloudConfig.url}/storage/v1/object/authenticated/${FILES_BUCKET}/${encodePath(path)}`,
      token: t,
      responseType: 'blob',
      onDownloadProgress: onProgress,
      signal,
    });
  let xhr = await doDownload(await token());
  if (xhr.status === 401 || (xhr.status === 400 && /jwt|expired/i.test(await responseText(xhr)))) {
    await supabase().auth.refreshSession();
    xhr = await doDownload(await token());
  }
  if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) return xhr.response;
  throw classify(xhr.status, await responseText(xhr));
}

/** Temporary link for streaming large media (video) without downloading it first. */
export async function signedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase().storage.from(FILES_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new StorageError(error?.message ?? 'Could not create link', 0, 'server');
  return data.signedUrl;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase().storage.from(FILES_BUCKET).remove(paths);
  if (error) throw new StorageError(error.message, 0, 'server');
}
