import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import { HttpsProxyAgent } from 'https-proxy-agent';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Local provider proxy.
 *
 * When the studio runs through `npm run dev` or `npm run preview`, browser
 * requests to `/__provider/<name>/...` are forwarded by this local server to
 * the provider's public API. This avoids browser CORS restrictions for
 * providers that do not allow direct browser calls.
 *
 * Nothing is stored or logged here: the API key travels from the browser,
 * through this local process on your own machine, to the provider. Cookies,
 * Origin and Referer headers are stripped before forwarding (see providerProxyGuard).
 */
const PROVIDER_TARGETS: Record<string, string> = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  stability: 'https://api.stability.ai',
  anthropic: 'https://api.anthropic.com',
};

/**
 * If this machine reaches the internet through an HTTPS proxy (HTTPS_PROXY,
 * common on corporate networks), route provider requests through it too.
 * Hosts listed in NO_PROXY are contacted directly.
 */
function outboundAgent(target: string) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxyUrl) return undefined;
  const host = new URL(target).hostname;
  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const bypass = noProxy.some((p) => p === '*' || host === p || (p.startsWith('.') && host.endsWith(p)) || (p.startsWith('*.') && host.endsWith(p.slice(1))));
  return bypass ? undefined : new HttpsProxyAgent(proxyUrl);
}

function providerProxy(): Record<string, ProxyOptions> {
  const entries = Object.entries(PROVIDER_TARGETS).map(([name, target]) => {
    const prefix = `/__provider/${name}`;
    const options: ProxyOptions = {
      target,
      changeOrigin: true,
      secure: true,
      agent: outboundAgent(target),
      // Image generation can take several minutes.
      timeout: 10 * 60 * 1000,
      proxyTimeout: 10 * 60 * 1000,
      rewrite: (path) => path.slice(prefix.length) || '/',
    };
    return [prefix, options] as const;
  });
  return Object.fromEntries(entries);
}

type Req = { url?: string; headers: Record<string, string | string[] | undefined> };
type Res = { setHeader: (k: string, v: string) => void; end: (b: string) => void };

/**
 * Runs before the proxy: strips browser-only headers (cookies, origin,
 * referer) so they are never forwarded, and answers the health check the app
 * uses to detect the proxy.
 */
function providerProxyGuard(): Plugin {
  const middleware = (req: Req, res: Res, next: () => void) => {
    if (req.url === '/health' || req.url?.startsWith('/health?')) {
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ ok: true, providers: Object.keys(PROVIDER_TARGETS) }));
      return;
    }
    delete req.headers.cookie;
    delete req.headers.origin;
    delete req.headers.referer;
    next();
  };
  return {
    name: 'bks-provider-proxy-guard',
    configureServer(server) {
      server.middlewares.use('/__provider', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__provider', middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), providerProxyGuard()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    proxy: providerProxy(),
  },
  preview: {
    host: 'localhost',
    port: 4173,
    proxy: providerProxy(),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
