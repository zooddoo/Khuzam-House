import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { useImageUrl } from '@/lib/hooks/useImageUrl';
import { cn } from '../ui/cn';

/** Renders a stored image by id with a quiet loading state. */
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
}) {
  const { url, loading, missing } = useImageUrl(imageId, variant);
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('relative block overflow-hidden bg-mist', onClick && 'cursor-zoom-in', className)}
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
      ) : loading ? (
        <div className="absolute inset-0 animate-pulse bg-mist" />
      ) : missing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] text-ink-4">
          <ImageOff size={16} strokeWidth={1.5} />
          Image missing
        </div>
      ) : null}
      {children}
    </Wrapper>
  );
}
