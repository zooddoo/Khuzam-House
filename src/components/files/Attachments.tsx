import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FolderOpen, MoreHorizontal, Pencil, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db/db';
import { deleteReferences, linkReferences, unlinkReferences, type LinkField } from '@/lib/db/references';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { useFilesMap } from '@/lib/hooks/data';
import { downloadBlob } from '@/lib/download';
import { useT } from '@/i18n';
import { fmtBytes } from '@/i18n/format';
import type { Reference } from '@/lib/types';
import { Button, IconButton } from '../ui/Button';
import { Menu } from '../ui/Overlay';
import { useConfirm } from '../ui/Confirm';
import { ImageThumb } from '../images/ImageThumb';
import { DropTarget, PickerButtons, UploadButton } from '../images/Dropzone';
import { ReferenceEditor, ReferencePicker, useOpenReference } from '../images/references';
import { useUploadReferences } from '../images/useUpload';
import { cn } from '../ui/cn';

/**
 * Files attached to one thing (a wall, an architectural element, a material,
 * a design version, another reference…). Any file type; upload from camera,
 * gallery or files, drop or paste on desktop, or pick from the library.
 */
export function AttachmentsSection({
  field,
  value,
  defaults,
  title,
  className,
  compact,
  emptyHint,
}: {
  field: LinkField;
  value: string;
  /** Extra fields for new uploads (e.g. roomIds). The link itself is added automatically. */
  defaults?: Partial<Reference>;
  title?: string;
  className?: string;
  compact?: boolean;
  emptyHint?: string;
}) {
  const t = useT();
  const confirm = useConfirm();
  const files = useFilesMap();
  const refs = useLiveQuery(() => db.references.where(field).equals(value).toArray(), [field, value]);
  const sorted = useMemo(() => (refs ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [refs]);
  const { upload, busy } = useUploadReferences();
  const openRef = useOpenReference();
  const [editing, setEditing] = useState<Reference | null>(null);
  const [picking, setPicking] = useState(false);

  const add = async (picked: File[]) => {
    const base: Partial<Reference> = { ...(defaults ?? {}), origin: 'upload' };
    const list = ((base[field] as string[] | undefined) ?? []).filter((x) => x !== value);
    await upload(picked, { ...base, [field]: [...list, value] });
  };

  return (
    <DropTarget onFiles={(f) => void add(f)} className={className} overlayLabel={t.attach.dropHint}>
      <section className={cn('rounded-md border border-line bg-surface', compact ? 'p-3' : 'p-4')} aria-label={title ?? t.attach.title}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-medium text-ink">
            {title ?? t.attach.title} <span className="font-normal text-ink-3">· {t.attach.count(sorted.length)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="hidden sm:block">
              <UploadButton size="sm" onFiles={(f) => void add(f)} loading={busy}>
                {t.attach.add}
              </UploadButton>
            </div>
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => setPicking(true)}>
              {t.attach.chooseExisting}
            </Button>
          </div>
        </div>
        <PickerButtons onFiles={(f) => void add(f)} className="mb-3 sm:hidden" disabled={busy} />
        {sorted.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-3">{emptyHint ?? t.attach.empty}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sorted.map((r, i) => {
              const f = files?.get(r.imageId);
              return (
                <li key={r.id} className="group overflow-hidden rounded-md border border-line bg-raised">
                  <ImageThumb imageId={r.imageId} className="aspect-[4/3] w-full" onClick={() => openRef(sorted, i)} />
                  <div className="flex items-start gap-1 px-2 py-1.5">
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(r)}>
                      <div className="truncate text-[12px] text-ink" dir="auto">
                        {r.title || f?.name || t.refs.noCaption}
                      </div>
                      <div className="truncate text-[11px] text-ink-3">{f ? `${t.enums.fileKind[f.kind]} · ${fmtBytes(f.size)}` : ''}</div>
                    </button>
                    <Menu
                      trigger={<IconButton icon={MoreHorizontal} label={t.refs.actions} size="sm" />}
                      items={[
                        { label: t.attach.edit, icon: Pencil, onSelect: () => setEditing(r) },
                        {
                          label: t.attach.download,
                          icon: Download,
                          onSelect: async () => {
                            const o = await getOriginalBlob(r.imageId);
                            if (o) downloadBlob(o.blob, o.name);
                          },
                        },
                        {
                          label: t.attach.unlink,
                          icon: Unlink,
                          onSelect: async () => {
                            await unlinkReferences([r.id], field, value);
                            toast.success(t.attach.unlinked);
                          },
                        },
                        'separator',
                        {
                          label: t.attach.delete,
                          icon: Trash2,
                          danger: true,
                          onSelect: async () => {
                            const ok = await confirm({ title: t.refs.deleteTitle, description: t.trash.moveHint, confirmLabel: t.refs.deleteConfirm, tone: 'danger' });
                            if (!ok.confirmed) return;
                            await deleteReferences([r.id]);
                            toast.success(t.trash.undoToast);
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <ReferenceEditor reference={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ReferencePicker
        open={picking}
        onOpenChange={setPicking}
        excludeIds={sorted.map((r) => r.id)}
        onPick={(ids) => void linkReferences(ids, field, value)}
        uploadDefaults={{ ...(defaults ?? {}), [field]: [value] }}
      />
    </DropTarget>
  );
}
