import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

const DISMISS_KEY = 'bk.installDismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** "Add to Home screen" banner for Android Chrome (shown once until dismissed). */
export function InstallPrompt() {
  const t = useT();
  const [, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  if (!deferred || dismissed || isStandalone()) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mb-5 flex items-start gap-3 rounded-md border border-accent/25 bg-accent-soft/60 p-3 lg:hidden">
      <Download size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-ink">{t.pwa.installTitle}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{t.pwa.installBody}</div>
        <div className="mt-2.5 flex gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const ev = deferred;
              if (!ev) return;
              await ev.prompt();
              await ev.userChoice.catch(() => undefined);
              deferred = null;
              setTick((n) => n + 1);
            }}
          >
            {t.pwa.install}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {t.pwa.notNow}
          </Button>
        </div>
      </div>
      <button type="button" aria-label={t.common.close} onClick={dismiss} className="touch-target -m-1 p-1 text-ink-3 hover:text-ink">
        <X size={16} />
      </button>
    </div>
  );
}
