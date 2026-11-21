import {
  File as FileGeneric,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  PencilRuler,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import type { FileKind } from '@/lib/types';
import { cn } from '../ui/cn';

export const FILE_KIND_ICON: Record<FileKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  video: FileVideo,
  audio: FileAudio,
  document: FileType2,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  drawing: PencilRuler,
  archive: FileArchive,
  text: FileText,
  other: FileGeneric,
};

const KIND_TONE: Record<FileKind, string> = {
  image: 'text-info',
  pdf: 'text-danger',
  video: 'text-accent',
  audio: 'text-accent',
  document: 'text-info',
  spreadsheet: 'text-ok',
  presentation: 'text-warn',
  drawing: 'text-ink-2',
  archive: 'text-ink-3',
  text: 'text-ink-2',
  other: 'text-ink-3',
};

/** Large icon tile for files without a picture preview (PDF, Word, Excel, DWG…). */
export function FileTile({ kind, ext, name, className, compact }: { kind: FileKind; ext?: string; name?: string; className?: string; compact?: boolean }) {
  const Icon = FILE_KIND_ICON[kind] ?? FileGeneric;
  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1.5 bg-mist/70 p-2 text-center', className)}>
      <Icon size={compact ? 20 : 30} strokeWidth={1.4} className={KIND_TONE[kind]} />
      {ext && <span className="rounded-[3px] bg-raised px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-2">{ext}</span>}
      {name && !compact && (
        <span className="line-clamp-2 max-w-full break-all px-1 text-[11px] leading-snug text-ink-3" dir="auto">
          {name}
        </span>
      )}
    </div>
  );
}

export function FileKindIcon({ kind, size = 16, className }: { kind: FileKind; size?: number; className?: string }) {
  const Icon = FILE_KIND_ICON[kind] ?? FileGeneric;
  return <Icon size={size} strokeWidth={1.6} className={cn(KIND_TONE[kind], className)} />;
}
