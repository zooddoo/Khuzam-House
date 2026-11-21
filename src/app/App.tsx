import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ensureSeeded } from '@/lib/db/seed';
import { TooltipProvider } from '@/components/ui/Overlay';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { LightboxProvider } from '@/components/images/Lightbox';
import { Spinner } from '@/components/ui/Display';
import { router } from './router';

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

export function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!('indexedDB' in window)) throw new Error('This browser does not provide IndexedDB storage.');
        await ensureSeeded();
        // Ask the browser not to evict project data under storage pressure.
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

  if (boot.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-[13px] text-ink-3">
        <Spinner /> Opening Bait Khuzam Studio…
      </div>
    );
  }
  if (boot.status === 'error') {
    return (
      <div className="mx-auto flex h-full max-w-[560px] flex-col justify-center px-6">
        <h1 className="display text-[38px]">Storage is unavailable</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
          Bait Khuzam Studio keeps your project in this browser's local database, but it could not be opened: <em>{boot.message}</em>
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Private / incognito windows and some strict privacy settings block local storage. Open the studio in a normal window of Chrome, Edge, Safari or
          Firefox.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ConfirmProvider>
        <LightboxProvider>
          <RouterProvider router={router} />
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: '!rounded-md !border !border-line !bg-raised !text-ink !shadow-pop !font-sans',
                description: '!text-ink-3',
                actionButton: '!bg-ink !text-canvas',
              },
            }}
          />
        </LightboxProvider>
      </ConfirmProvider>
    </TooltipProvider>
  );
}
