import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, FolderOpen, ImagePlus, Images, Paperclip, Upload } from 'lucide-react';
import { ACCEPT_ATTR, filesFromClipboard, isAcceptedImage } from '@/lib/images/ingest';
import { useT } from '@/i18n';
import { cn } from '../ui/cn';
import { Button, type ButtonProps } from '../ui/Button';

/**
 * File pickers. Every picker accepts any file type unless `imagesOnly` is
 * set (photos used as design inputs). On phones there are separate buttons
 * for the camera, the photo gallery and other files; on computers files can
 * also be dropped or pasted.
 */

function filesFromDrop(dt: DataTransfer | null, imagesOnly: boolean): File[] {
  if (!dt) return [];
  const files = Array.from(dt.files);
  return imagesOnly ? files.filter((f) => isAcceptedImage(f)) : files;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Listen for pasted files anywhere on the page (except while typing in a
 * field that handles its own paste). Only one listener should be active per view.
 */
export function usePasteImages(onFiles: (files: File[]) => void, enabled = true, imagesOnly = false) {
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      let files = filesFromClipboard(e);
      if (imagesOnly) files = files.filter((f) => isAcceptedImage(f));
      if (!files.length) return;
      if (isTypingTarget(e.target) && (e.target as HTMLElement).dataset.pasteImages !== 'true') return;
      e.preventDefault();
      cb.current(files);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [enabled, imagesOnly]);
}

/** Hidden file input + function to open it. */
function useFileInput(onFiles: (files: File[]) => void, opts: { accept?: string; multiple?: boolean; capture?: 'environment' | 'user' }) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={opts.accept}
      multiple={opts.multiple}
      capture={opts.capture}
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/** Camera / Photos / Files buttons (the way phones offer each source). */
export function PickerButtons({
  onFiles,
  multiple = true,
  imagesOnly = false,
  size = 'sm',
  className,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  imagesOnly?: boolean;
  size?: ButtonProps['size'];
  className?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const camera = useFileInput(onFiles, { accept: 'image/*', capture: 'environment' });
  const photos = useFileInput(onFiles, { accept: imagesOnly ? ACCEPT_ATTR : 'image/*,video/*', multiple });
  const files = useFileInput(onFiles, { accept: imagesOnly ? ACCEPT_ATTR : undefined, multiple });
  return (
    <div className={cn('flex flex-wrap gap-2', className)} onClick={(e) => e.stopPropagation()}>
      {camera.input}
      {photos.input}
      {files.input}
      <Button size={size} icon={Camera} onClick={camera.open} disabled={disabled}>
        {t.files.camera}
      </Button>
      <Button size={size} icon={Images} onClick={photos.open} disabled={disabled}>
        {t.files.photos}
      </Button>
      {!imagesOnly && (
        <Button size={size} icon={FolderOpen} onClick={files.open} disabled={disabled}>
          {t.files.filesButton}
        </Button>
      )}
    </div>
  );
}

export function Dropzone({
  onFiles,
  label,
  hint,
  multiple = true,
  compact,
  className,
  children,
  disabled,
  busy,
  imagesOnly = false,
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
  /** Accept only photos (JPEG, PNG, WebP, HEIC…). */
  imagesOnly?: boolean;
}) {
  const t = useT();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const picker = useFileInput(onFiles, { accept: imagesOnly ? ACCEPT_ATTR : undefined, multiple });

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && picker.open()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          picker.open();
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
        const files = filesFromDrop(e.dataTransfer, imagesOnly);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-center transition-colors',
        compact ? 'gap-1.5 px-3 py-4' : 'gap-2.5 px-4 py-7 sm:px-6',
        over ? 'border-accent bg-accent-soft/60' : 'border-line-strong/80 bg-raised/60 hover:border-ink-4 hover:bg-raised',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {picker.input}
      {children ?? (
        <>
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-mist text-ink-3 transition-colors group-hover:text-ink',
              compact ? 'h-7 w-7' : 'h-10 w-10',
            )}
          >
            {busy ? (
              <Upload size={compact ? 13 : 17} className="animate-pulse" />
            ) : imagesOnly ? (
              <ImagePlus size={compact ? 13 : 17} strokeWidth={1.6} />
            ) : (
              <Paperclip size={compact ? 13 : 17} strokeWidth={1.6} />
            )}
          </span>
          <span className={cn('text-ink-2', compact ? 'text-[12px]' : 'text-[13px]')}>
            {busy ? t.files.processingOne : (label ?? (imagesOnly ? t.files.dropImagesHere : t.files.dropHere))}
          </span>
          {!compact && <span className="text-[11.5px] leading-relaxed text-ink-4">{hint ?? (imagesOnly ? t.files.dropImagesHint : t.files.dropHint)}</span>}
          {!compact && (
            <PickerButtons onFiles={onFiles} multiple={multiple} imagesOnly={imagesOnly} disabled={disabled || busy} className="mt-1 justify-center sm:hidden" />
          )}
        </>
      )}
    </div>
  );
}

/** Button that opens a file picker (any type unless `imagesOnly`). */
export function UploadButton({
  onFiles,
  multiple = true,
  imagesOnly = false,
  children,
  ...btn
}: { onFiles: (files: File[]) => void; multiple?: boolean; imagesOnly?: boolean } & ButtonProps) {
  const t = useT();
  const picker = useFileInput(onFiles, { accept: imagesOnly ? ACCEPT_ATTR : undefined, multiple });
  return (
    <>
      {picker.input}
      <Button icon={imagesOnly ? ImagePlus : Paperclip} {...btn} onClick={picker.open}>
        {children ?? t.files.uploadNow}
      </Button>
    </>
  );
}

/** Wrap any region so files can be dropped onto it (e.g. a requirement card). */
export function DropTarget({
  onFiles,
  children,
  className,
  overlayLabel,
  imagesOnly = false,
}: {
  onFiles: (f: File[]) => void;
  children: ReactNode;
  className?: string;
  overlayLabel?: string;
  imagesOnly?: boolean;
}) {
  const t = useT();
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
        const files = filesFromDrop(e.dataTransfer, imagesOnly);
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
          {overlayLabel ?? t.files.dropToAttach}
        </div>
      )}
    </div>
  );
}
