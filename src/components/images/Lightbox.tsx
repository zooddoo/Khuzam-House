import * as RadixDialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, X } from 'lucide-react';
import { useImageUrl, getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { IconButton } from '../ui/Button';
import { IDENTITY, ZoomPan, zoomAt, type View } from './ZoomPan';
import { downloadBlob } from '@/lib/download';

export interface LightboxItem {
  imageId: string;
  title?: string;
  subtitle?: string;
  description?: string;
}

type OpenFn = (items: LightboxItem[], index?: number) => void;
const LightboxContext = createContext<OpenFn | null>(null);

export function useLightbox(): OpenFn {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('useLightbox must be used inside LightboxProvider');
  return ctx;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const open = useCallback<OpenFn>((items, index = 0) => {
    if (items.length) setState({ items, index: Math.max(0, Math.min(index, items.length - 1)) });
  }, []);
  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state && <LightboxView items={state.items} index={state.index} onIndex={(i) => setState({ ...state, index: i })} onClose={() => setState(null)} />}
    </LightboxContext.Provider>
  );
}

function LightboxView({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index];
  const { url } = useImageUrl(item.imageId, 'full');
  const [view, setView] = useState<View>(IDENTITY);

  useEffect(() => setView(IDENTITY), [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === '+' || e.key === '=') setView((v) => zoomAt(v, 1.4, window.innerWidth / 2, window.innerHeight / 2));
      if (e.key === '-') setView((v) => zoomAt(v, 1 / 1.4, window.innerWidth / 2, window.innerHeight / 2));
      if (e.key === '0') setView(IDENTITY);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  const download = async () => {
    const o = await getOriginalBlob(item.imageId);
    if (o) downloadBlob(o.blob, o.name);
  };

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[90] bg-[#15130f]/95 animate-fade-in" />
        <RadixDialog.Content className="fixed inset-0 z-[90] flex flex-col outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-white/90">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[14px] font-medium" dir="auto">
                {item.title || 'Image'}
              </RadixDialog.Title>
              {item.subtitle && <div className="truncate text-[12px] text-white/55">{item.subtitle}</div>}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-2 text-[12px] text-white/50 tabular">
                {index + 1} / {items.length}
              </span>
              <IconButton
                icon={Minus}
                label="Zoom out"
                variant="overlay"
                onClick={() => setView((v) => zoomAt(v, 1 / 1.4, window.innerWidth / 2, window.innerHeight / 2))}
              />
              <IconButton
                icon={Plus}
                label="Zoom in"
                variant="overlay"
                onClick={() => setView((v) => zoomAt(v, 1.4, window.innerWidth / 2, window.innerHeight / 2))}
              />
              <IconButton icon={Maximize2} label="Fit to screen" variant="overlay" onClick={() => setView(IDENTITY)} />
              <IconButton icon={Download} label="Download original" variant="overlay" onClick={download} />
              <RadixDialog.Close asChild>
                <IconButton icon={X} label="Close" variant="overlay" />
              </RadixDialog.Close>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <ZoomPan view={view} onChange={setView}>
              <div className="flex h-full w-full items-center justify-center p-4">
                {url && <img src={url} alt={item.title ?? ''} className="max-h-full max-w-full object-contain" draggable={false} />}
              </div>
            </ZoomPan>
            {index > 0 && (
              <button
                aria-label="Previous image"
                onClick={() => onIndex(index - 1)}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {index < items.length - 1 && (
              <button
                aria-label="Next image"
                onClick={() => onIndex(index + 1)}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>
          {item.description && (
            <div className="mx-auto max-w-[760px] px-6 pb-5 pt-2 text-center text-[13px] leading-relaxed text-white/70" dir="auto">
              {item.description}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
