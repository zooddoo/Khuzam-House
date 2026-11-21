import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { I18nProvider, useI18n } from '@/i18n';
import { TooltipProvider } from '@/components/ui/Overlay';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { LightboxProvider } from '@/components/images/Lightbox';
import { Splash } from './auth/AuthScreens';
import { GateLayout } from './auth/AuthScreens';
import { CloudGate } from './CloudGate';
import { router } from './router';
import { db } from '@/lib/db/db';

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

/** Opens the on-device database (and asks the browser to keep it) before anything else. */
function useLocalStorageReady(): BootState {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!('indexedDB' in window)) throw new Error('IndexedDB is not available');
        await db.open();
        try {
          if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
        } catch {
          /* optional */
        }
        if (alive) setBoot({ status: 'ready' });
      } catch (e) {
        if (alive) setBoot({ status: 'error', message: (e as Error).message || String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return boot;
}

function Studio() {
  const { t, lang, dir } = useI18n();
  const boot = useLocalStorageReady();

  if (boot.status === 'loading') return <Splash label={t.app.opening} />;
  if (boot.status === 'error') {
    return (
      <GateLayout title={t.app.storageUnavailable} lead={t.app.storageUnavailableBody(boot.message)}>
        <p className="text-[13px] leading-relaxed text-ink-3">{t.app.storageUnavailableHint}</p>
      </GateLayout>
    );
  }

  return (
    <>
      <CloudGate>
        <LightboxProvider>
          {/* Re-mount the studio when the language changes so every label updates. */}
          <RouterProvider key={lang} router={router} />
        </LightboxProvider>
      </CloudGate>
      <Toaster
        dir={dir}
        position="bottom-center"
        offset={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
        mobileOffset={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
        toastOptions={{
          classNames: {
            toast: '!rounded-md !border !border-line !bg-raised !text-ink !shadow-pop !font-sans',
            description: '!text-ink-3',
            actionButton: '!bg-ink !text-canvas',
          },
        }}
      />
    </>
  );
}

export function App() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <ConfirmProvider>
          <Studio />
        </ConfirmProvider>
      </TooltipProvider>
    </I18nProvider>
  );
}
