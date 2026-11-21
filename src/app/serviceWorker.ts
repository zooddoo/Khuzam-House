import { toast } from 'sonner';
import { tr } from '@/i18n/messages';

declare const __BUILD_ID__: string;

/**
 * Registers the service worker (offline start + installable app). Each
 * deployment gets a new worker; when it takes over, offer a reload.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__BUILD_ID__)}`).catch(() => undefined);
  });
  let shown = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || shown) return;
    shown = true;
    toast(tr().app.updateReady, { duration: Infinity, action: { label: tr().app.reload, onClick: () => window.location.reload() } });
  });
}
