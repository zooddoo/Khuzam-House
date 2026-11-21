import type { ConnectionRoute } from '../types';

export type ProxyName = 'openai' | 'gemini' | 'stability' | 'anthropic';

export class ProviderError extends Error {
  status: number;
  hint: string | null;
  code: string | null;

  constructor(message: string, opts: { status?: number; hint?: string | null; code?: string | null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status ?? 0;
    this.hint = opts.hint ?? null;
    this.code = opts.code ?? null;
  }
}

let proxyCheck: Promise<boolean> | null = null;

/** Is the local provider proxy (vite dev / preview) serving this page? */
export function proxyAvailable(): Promise<boolean> {
  if (!proxyCheck) {
    proxyCheck = fetch('/__provider/health', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return false;
        const j = (await r.json()) as { ok?: boolean };
        return !!j.ok;
      })
      .catch(() => false);
  }
  return proxyCheck;
}

/** Base URL for a provider given the user's connection preference. */
export async function resolveBase(name: ProxyName, route: ConnectionRoute, direct: string): Promise<{ base: string; viaProxy: boolean }> {
  if (route === 'direct') return { base: direct, viaProxy: false };
  const available = await proxyAvailable();
  if (route === 'proxy' && !available) {
    throw new ProviderError('The local proxy is not available.', {
      hint: 'Start the studio with "npm run dev" or "npm start", or switch the connection to "Direct" in Settings.',
    });
  }
  if (available) return { base: `${window.location.origin}/__provider/${name}`, viaProxy: true };
  return { base: direct, viaProxy: false };
}

function hintFor(status: number, message: string, provider: string): string | null {
  const m = message.toLowerCase();
  if (/safety|moderation|content[_ ]?policy|filtered|blocked|prohibited/.test(m))
    return `${provider}'s safety system rejected this request. Try removing people from photos, rewording instructions, or using fewer images.`;
  if (status === 401) return 'The API key was rejected. Check the key in Settings → Image generation.';
  if (status === 403)
    return provider === 'OpenAI'
      ? 'Access denied. OpenAI may require organization verification before gpt-image models can be used, or the key lacks permission.'
      : 'Access denied for this key, model or region.';
  if (status === 404) return 'Model or endpoint not found. Check the model name in Settings.';
  if (status === 413) return 'The request is too large. Send fewer images, or lower "max upload size" in Settings.';
  if (status === 429) return 'Rate limit or quota reached. Check your plan and billing with the provider, wait a minute, then retry.';
  if (status >= 500) return 'The provider had a temporary problem. Please try again shortly.';
  return null;
}

/** Turn an error HTTP response into a readable ProviderError. */
export async function errorFromResponse(res: Response, provider: string): Promise<ProviderError> {
  let message = `${provider} returned ${res.status} ${res.statusText}`.trim();
  let code: string | null = null;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const err = (j.error ?? j) as Record<string, unknown>;
      const msg =
        (typeof err.message === 'string' && err.message) ||
        (Array.isArray(j.errors) && j.errors.length ? String(j.errors.join('; ')) : '') ||
        (typeof j.message === 'string' && j.message) ||
        (typeof j.name === 'string' && j.name) ||
        '';
      if (msg) message = msg;
      if (typeof err.code === 'string') code = err.code;
      else if (typeof err.status === 'string') code = err.status;
    } catch {
      if (text && text.length < 400 && !text.trim().startsWith('<')) message = text.trim();
    }
  } catch {
    /* ignore */
  }
  return new ProviderError(message, { status: res.status, code, hint: hintFor(res.status, message, provider) });
}

/** Wrap fetch failures (network, CORS, abort) in a ProviderError. */
export function networkError(e: unknown, provider: string, viaProxy: boolean): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new ProviderError('Generation cancelled.', { code: 'aborted' });
  const message = e instanceof Error ? e.message : String(e);
  return new ProviderError(`Could not reach ${provider}: ${message}`, {
    hint: viaProxy
      ? 'Check your internet connection. The local proxy could not reach the provider.'
      : 'Check your internet connection. If the browser blocked the request (CORS), run the studio with "npm run dev" or "npm start" so requests go through the local proxy.',
  });
}

export async function providerFetch(url: string, init: RequestInit, provider: string, viaProxy: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw networkError(e, provider, viaProxy);
  }
  if (!res.ok) throw await errorFromResponse(res, provider);
  return res;
}

export function describeError(e: unknown): { message: string; hint: string | null } {
  if (e instanceof ProviderError) return { message: e.message, hint: e.hint };
  if (e instanceof Error) return { message: e.message, hint: null };
  return { message: String(e), hint: null };
}
