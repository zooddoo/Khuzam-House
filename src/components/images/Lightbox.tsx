import * as RadixDialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react';
import { useImageUrl } from '@/lib/hooks/useImageUrl';
import { fetchBlob, getOriginal, streamUrl } from '@/lib/files/repo';
import { openPdf, renderPdfPage } from '@/lib/files/pdf';
import { IconButton } from '../ui/Button';
import { Spinner } from '../ui/Display';
import { IDENTITY, ZoomPan, zoomAt, type View } from './ZoomPan';
import { FileTile } from '../files/FileIcon';
import { downloadBlob } from '@/lib/download';
import { useI18n, useT } from '@/i18n';
import { fmtBytes } from '@/i18n/format';
import type { StoredFile } from '@/lib/types';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Full-screen viewer for any stored file: zoomable photos, PDFs (rendered
 * in the page, so they work on Android), video and audio players, and a
 * download card for everything else.
 */

export interface LightboxItem {
  /** StoredFile id (any file type). */
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
  const { t, dir } = useI18n();
  const item = items[index];
  const { url, file, missing } = useImageUrl(item.imageId, 'full');
  const [view, setView] = useState<View>(IDENTITY);
  const isImage = file?.kind === 'image';
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => setView(IDENTITY), [index]);

  const prev = index > 0 ? () => onIndex(index - 1) : null;
  const next = index < items.length - 1 ? () => onIndex(index + 1) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys follow the reading direction.
      const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === forward && next) next();
      if (e.key === back && prev) prev();
      if (!isImage) return;
      if (e.key === '+' || e.key === '=') setView((v) => zoomAt(v, 1.4, window.innerWidth / 2, window.innerHeight / 2));
      if (e.key === '-') setView((v) => zoomAt(v, 1 / 1.4, window.innerWidth / 2, window.innerHeight / 2));
      if (e.key === '0') setView(IDENTITY);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dir, isImage, next, prev]);

  const download = async () => {
    const o = await getOriginal(item.imageId);
    if (o) downloadBlob(o.blob, o.name);
  };

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[90] bg-[#15130f]/95 animate-fade-in" />
        <RadixDialog.Content className="fixed inset-0 z-[90] flex flex-col outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white/90 sm:px-4">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[14px] font-medium" dir="auto">
                {item.title || file?.name || t.files.image}
              </RadixDialog.Title>
              {(item.subtitle || file) && (
                <div className="truncate text-[12px] text-white/55" dir="auto">
                  {item.subtitle || (file ? `${t.enums.fileKind[file.kind]} · ${fmtBytes(file.size)}` : '')}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {items.length > 1 && <span className="me-1 text-[12px] text-white/50 tabular">{t.files.counter(index + 1, items.length)}</span>}
              {isImage && (
                <>
                  <IconButton
                    icon={Minus}
                    label={t.common.zoomOut}
                    variant="overlay"
                    className="hidden sm:inline-flex"
                    onClick={() => setView((v) => zoomAt(v, 1 / 1.4, window.innerWidth / 2, window.innerHeight / 2))}
                  />
                  <IconButton
                    icon={Plus}
                    label={t.common.zoomIn}
                    variant="overlay"
                    className="hidden sm:inline-flex"
                    onClick={() => setView((v) => zoomAt(v, 1.4, window.innerWidth / 2, window.innerHeight / 2))}
                  />
                  <IconButton icon={Maximize2} label={t.files.fitToScreen} variant="overlay" onClick={() => setView(IDENTITY)} />
                </>
              )}
              <IconButton icon={Download} label={t.files.downloadOriginal} variant="overlay" onClick={download} />
              <RadixDialog.Close asChild>
                <IconButton icon={X} label={t.common.close} variant="overlay" />
              </RadixDialog.Close>
            </div>
          </div>
          <div
            className="relative min-h-0 flex-1"
            onPointerDown={(e) => {
              if (view.scale === 1 && e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s || view.scale !== 1) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) < 60 || Math.abs(e.clientY - s.y) > 80) return;
              // Swipe towards the start of the reading direction shows the next item.
              const towardsNext = dir === 'rtl' ? dx > 0 : dx < 0;
              if (towardsNext) next?.();
              else prev?.();
            }}
          >
            {!file ? (
              <div className="flex h-full items-center justify-center text-[13px] text-white/60">{missing ? t.sync.fileUnavailable : <Spinner />}</div>
            ) : isImage ? (
              <ZoomPan view={view} onChange={setView}>
                <div className="flex h-full w-full items-center justify-center p-2 sm:p-4">
                  {url ? <img src={url} alt={item.title ?? ''} className="max-h-full max-w-full object-contain" draggable={false} /> : <Spinner className="text-white/60" />}
                </div>
              </ZoomPan>
            ) : file.kind === 'pdf' ? (
              <PdfView file={file} />
            ) : file.kind === 'video' || file.kind === 'audio' ? (
              <MediaView file={file} />
            ) : (
              <GenericFileView file={file} onDownload={download} />
            )}
            {prev && (
              <button
                type="button"
                aria-label={t.files.previous}
                onClick={prev}
                className="absolute start-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
              >
                <ChevronLeft size={20} className="rtl:-scale-x-100" />
              </button>
            )}
            {next && (
              <button
                type="button"
                aria-label={t.files.next}
                onClick={next}
                className="absolute end-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
              >
                <ChevronRight size={20} className="rtl:-scale-x-100" />
              </button>
            )}
          </div>
          {item.description && (
            <div className="mx-auto max-w-[760px] px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center text-[13px] leading-relaxed text-white/70" dir="auto">
              {item.description}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** PDF pages rendered with pdf.js (works on Android, where Chrome cannot show PDFs inside a page). */
function PdfView({ file }: { file: StoredFile }) {
  const t = useT();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    setDoc(null);
    setError(null);
    (async () => {
      try {
        const blob = await fetchBlob(file, 'original');
        if (!blob) throw new Error(t.files.offlineNoCopy);
        opened = await openPdf(blob);
        if (alive) setDoc(opened);
      } catch (e) {
        if (alive) setError((e as Error).message || t.files.pdfFailed);
      }
    })();
    return () => {
      alive = false;
      void opened?.loadingTask.destroy();
    };
  }, [file, t]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 24, 1100)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="scroll-thin h-full overflow-y-auto px-3 pb-6" dir="ltr">
      {error ? (
        <p className="mx-auto mt-16 max-w-[420px] text-center text-[13px] text-white/70" dir="auto">
          {t.files.pdfFailed}
        </p>
      ) : !doc || !width ? (
        <div className="flex h-full items-center justify-center gap-2 text-[13px] text-white/60">
          <Spinner className="text-white/60" /> {t.files.pdfLoading}
        </div>
      ) : (
        <div className="mx-auto flex flex-col items-center gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} page={i + 1} width={width} />
          ))}
        </div>
      )}
    </div>
  );
}

function PdfPage({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(page <= 2);
  useEffect(() => {
    if (visible || !holder.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '600px' });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    void renderPdfPage(doc, page, canvas.current, width).catch(() => undefined);
  }, [doc, page, width, visible]);
  return (
    <div ref={holder} className="bg-white shadow-pop" style={{ width, minHeight: visible ? undefined : width * 1.3 }}>
      {visible && <canvas ref={canvas} className="block" />}
    </div>
  );
}

function MediaView({ file }: { file: StoredFile }) {
  const t = useT();
  const [src, setSrc] = useState<{ url: string; revoke?: () => void } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    let current: { url: string; revoke?: () => void } | null = null;
    setError(false);
    streamUrl(file)
      .then((s) => {
        current = s;
        if (alive) {
          if (s) setSrc(s);
          else setError(true);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      current?.revoke?.();
    };
  }, [file]);
  if (error)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-white/70">{navigator.onLine ? t.files.videoFailed : t.files.offlineNoCopy}</div>
    );
  if (!src)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-white/60" />
      </div>
    );
  return (
    <div className="flex h-full items-center justify-center p-2 sm:p-4">
      {file.kind === 'video' ? (
        <video src={src.url} controls playsInline className="max-h-full max-w-full bg-black" onError={() => setError(true)} />
      ) : (
        <audio src={src.url} controls className="w-full max-w-[520px]" onError={() => setError(true)} />
      )}
    </div>
  );
}

function GenericFileView({ file, onDownload }: { file: StoredFile; onDownload: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-[360px] flex-col items-center gap-4 rounded-md bg-surface p-6 text-center">
        <div className="h-28 w-28 overflow-hidden rounded-md">
          <FileTile kind={file.kind} ext={file.ext} />
        </div>
        <div className="min-w-0">
          <div className="break-all text-[14px] font-medium text-ink" dir="auto">
            {file.name}
          </div>
          <div className="mt-1 text-[12px] text-ink-3">
            {t.enums.fileKind[file.kind]} · {fmtBytes(file.size)}
          </div>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {t.files.noPreview}. {t.files.noPreviewHint}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            className="touch-target inline-flex h-10 items-center gap-2 rounded-sm bg-ink px-4 text-[13px] font-medium text-canvas hover:bg-ink/90"
          >
            <Download size={15} /> {t.files.download}
          </button>
          <button
            type="button"
            onClick={async () => {
              const o = await getOriginal(file.id);
              if (!o) return;
              const url = URL.createObjectURL(o.blob);
              window.open(url, '_blank', 'noopener');
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="touch-target inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong px-4 text-[13px] text-ink hover:bg-mist"
          >
            <ExternalLink size={15} /> {t.files.openNewTab}
          </button>
        </div>
      </div>
    </div>
  );
}
