import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { ACCEPT_ATTR, imagesFromClipboard, isAcceptedImage } from '@/lib/images/ingest';
import { cn } from '../ui/cn';
import { Button, type ButtonProps } from '../ui/Button';

function filesFromDrop(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files).filter((f) => isAcceptedImage(f));
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Listen for pasted images anywhere on the page (except while typing in a
 * field that handles its own paste). Only one listener should be active per view.
 */
export function usePasteImages(onFiles: (files: File[]) => void, enabled = true) {
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const files = imagesFromClipboard(e);
      if (!files.length) return;
      if (isTypingTarget(e.target) && (e.target as HTMLElement).dataset.pasteImages !== 'true') return;
      e.preventDefault();
      cb.current(files);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [enabled]);
}

export function Dropzone({
  onFiles,
  label = 'Drop images here, or click to browse',
  hint = 'JPEG, PNG, WebP, HEIC · originals are kept untouched',
  multiple = true,
  compact,
  className,
  children,
  disabled,
  busy,
}: {
  onFiles: (files: File[]) => void;
  label?: ReactNode;
  hint?: ReactNode;
  multiple?: boolean;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (disabled) return;
        const files = filesFromDrop(e.dataTransfer);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-center transition-colors',
        compact ? 'gap-1 px-3 py-4' : 'gap-2 px-6 py-8',
        over ? 'border-accent bg-accent-soft/60' : 'border-line-strong/80 bg-raised/60 hover:border-ink-4 hover:bg-raised',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {children ?? (
        <>
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-mist text-ink-3 transition-colors group-hover:text-ink',
              compact ? 'h-7 w-7' : 'h-10 w-10',
            )}
          >
            {busy ? <Upload size={compact ? 13 : 17} className="animate-pulse" /> : <ImagePlus size={compact ? 13 : 17} strokeWidth={1.6} />}
          </span>
          <span className={cn('text-ink-2', compact ? 'text-[12px]' : 'text-[13px]')}>{busy ? 'Processing images…' : label}</span>
          {hint && !compact && <span className="text-[11.5px] text-ink-4">{hint}</span>}
        </>
      )}
    </div>
  );
}

/** Button that opens a file picker for images. */
export function UploadButton({ onFiles, multiple = true, children, ...btn }: { onFiles: (files: File[]) => void; multiple?: boolean } & ButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Button icon={ImagePlus} {...btn} onClick={() => input.current?.click()}>
        {children ?? 'Upload'}
      </Button>
    </>
  );
}

/** Wrap any region so files can be dropped onto it (e.g. a requirement card). */
export function DropTarget({
  onFiles,
  children,
  className,
  overlayLabel = 'Drop to attach',
}: {
  onFiles: (f: File[]) => void;
  children: ReactNode;
  className?: string;
  overlayLabel?: string;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return (
    <div
      className={cn('relative', className)}
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        const files = filesFromDrop(e.dataTransfer);
        depth.current = 0;
        setOver(false);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        onFiles(files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-soft/80 text-[13px] font-medium text-accent">
          {overlayLabel}
        </div>
      )}
    </div>
  );
}
