import type { ReactNode } from 'react';
import { CloudUpload, ImageOff } from 'lucide-react';
import { useImageUrl } from '@/lib/hooks/useImageUrl';
import { useSyncStatus } from '@/lib/sync/engine';
import { useT } from '@/i18n';
import { fmtPercent } from '@/i18n/format';
import { FileTile } from '../files/FileIcon';
import { cn } from '../ui/cn';

/** Upload progress for one file, from the sync engine (null when not uploading). */
export function useFileUpload(fileId: string | null | undefined) {
  const s = useSyncStatus();
  if (!fileId) return null;
  const active = s.uploads.active.find((a) => a.fileId === fileId);
  const error = s.fileErrors[fileId];
  if (!active && !error) return null;
  return { loaded: active?.loaded ?? 0, total: active?.total ?? 0, error: error ?? null };
}

/**
 * Renders a stored file by id: the picture for photos (and previews of
 * PDFs / videos), an icon tile for other files. Shows upload progress while
 * the file is being stored in the cloud.
 */
export function ImageThumb({
  imageId,
  alt = '',
  variant = 'thumb',
  fit = 'cover',
  className,
  imgClassName,
  children,
  onClick,
  draggable,
  showUpload = true,
  showName = false,
}: {
  imageId: string | null | undefined;
  alt?: string;
  variant?: 'thumb' | 'full';
  fit?: 'cover' | 'contain';
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  showUpload?: boolean;
  /** Show the file name on icon tiles (non-image files). */
  showName?: boolean;
}) {
  const t = useT();
  const { url, loading, missing, file, progress } = useImageUrl(imageId, variant);
  const upload = useFileUpload(showUpload ? imageId : null);
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('relative block overflow-hidden bg-mist', onClick && (file?.kind === 'image' ? 'cursor-zoom-in' : 'cursor-pointer'), className)}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={draggable ?? false}
          loading="lazy"
          decoding="async"
          className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', imgClassName)}
        />
      ) : file && !loading && !missing ? (
        <FileTile kind={file.kind} ext={file.ext} name={showName ? file.name : undefined} compact={!showName} />
      ) : loading ? (
        <div className="absolute inset-0 animate-pulse bg-mist">
          {progress !== null && progress > 0 && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-accent/60" style={{ width: `${Math.round(progress * 100)}%` }} />}
        </div>
      ) : missing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-1 text-center text-[11px] text-ink-4">
          <ImageOff size={16} strokeWidth={1.5} />
          {file ? t.files.unavailable : t.files.waitingUpload}
        </div>
      ) : null}
      {upload && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-1 bottom-1 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10.5px] font-medium',
            upload.error ? 'bg-danger text-white' : 'bg-ink/70 text-white',
          )}
          title={upload.error ? t.files.uploadError : undefined}
        >
          <CloudUpload size={11} className="shrink-0" />
          <span className="truncate">{upload.error ? t.files.uploadError : t.files.uploadingPct(fmtPercent(upload.total ? upload.loaded / upload.total : 0))}</span>
        </div>
      )}
      {children}
    </Wrapper>
  );
}
