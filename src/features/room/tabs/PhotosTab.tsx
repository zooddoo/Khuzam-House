import { useMemo, useState } from 'react';
import { Download, Expand, ImageIcon, Link2Off, Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FileKind, Reference, ReferenceKind, Room } from '@/lib/types';
import { REFERENCE_KINDS } from '@/lib/labels';
import { deleteReferences, updateReference } from '@/lib/db/references';
import { setRoomCover } from '@/lib/db/rooms';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { useFilesMap } from '@/lib/hooks/data';
import { downloadBlob } from '@/lib/download';
import { useT } from '@/i18n';
import { num } from '@/i18n/format';
import { Dropzone, usePasteImages } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { ReferenceCard, ReferenceEditor, useOpenReference } from '@/components/images/references';
import { Chip, Field, Select } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';

export function PhotosTab({ room, references }: { room: Room; references: Reference[] }) {
  const t = useT();
  const P = t.photos;
  const { upload, busy } = useUploadReferences();
  const openRef = useOpenReference();
  const confirm = useConfirm();
  const files = useFilesMap();
  const [kind, setKind] = useState<ReferenceKind>('site-photo');
  const [filter, setFilter] = useState<ReferenceKind | 'all'>('all');
  const [fileFilter, setFileFilter] = useState<FileKind | 'all'>('all');
  const [editing, setEditing] = useState<Reference | null>(null);

  const doUpload = (picked: File[]) => upload(picked, { kind, roomIds: [room.id] });
  usePasteImages(doUpload);

  const list = useMemo(
    () => references.filter((r) => (filter === 'all' || r.kind === filter) && (fileFilter === 'all' || files?.get(r.imageId)?.kind === fileFilter)),
    [references, filter, fileFilter, files],
  );
  const kindsPresent = useMemo(() => new Set(references.map((r) => r.kind)), [references]);
  const fileKindsPresent = useMemo(() => Array.from(new Set(references.map((r) => files?.get(r.imageId)?.kind).filter(Boolean))) as FileKind[], [references, files]);

  const removeFromRoom = async (r: Reference) => {
    const remainingLinks = r.roomIds.filter((x) => x !== room.id).length + r.libraryItemIds.length + r.versionIds.length;
    const res = await confirm({ title: P.removeTitle, description: remainingLinks ? P.removeKeepLinks : P.removeUnlinked, confirmLabel: P.removeConfirm });
    if (!res.confirmed) return;
    await updateReference(r.id, {
      roomIds: r.roomIds.filter((x) => x !== room.id),
      directionRoomIds: r.directionRoomIds.filter((x) => x !== room.id),
      wallKeys: r.wallKeys.filter((k) => !k.startsWith(`${room.id}:`)),
    });
    if (room.coverReferenceId === r.id) await setRoomCover(room.id, null);
  };

  const remove = async (r: Reference) => {
    const res = await confirm({ title: P.deleteTitle, tone: 'danger', confirmLabel: t.refs.deleteConfirm, description: P.deleteBody });
    if (!res.confirmed) return;
    await deleteReferences([r.id]);
    toast.success(P.deleted, { description: t.trash.moveHint });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="display text-[28px]">{P.title}</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">{P.lead}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-stretch">
        <Field label={P.uploadAs}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind)}>
            {REFERENCE_KINDS.filter((k) => k.value !== 'generated').map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <p className="hidden text-[11.5px] leading-relaxed text-ink-3 sm:block">{P.pasteHint}</p>
        </Field>
        <Dropzone onFiles={doUpload} busy={busy} label={P.drop} />
      </div>

      {references.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')} className="shrink-0">
              {P.all} <span className="opacity-60">{num(references.length)}</span>
            </Chip>
            {REFERENCE_KINDS.filter((k) => kindsPresent.has(k.value)).map((k) => (
              <Chip key={k.value} active={filter === k.value} onClick={() => setFilter(k.value)} className="shrink-0">
                {k.label} <span className="opacity-60">{num(references.filter((r) => r.kind === k.value).length)}</span>
              </Chip>
            ))}
          </div>
          {fileKindsPresent.length > 1 && (
            <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <Chip active={fileFilter === 'all'} onClick={() => setFileFilter('all')} className="shrink-0">
                {t.refs.allFileTypes}
              </Chip>
              {fileKindsPresent.map((k) => (
                <Chip key={k} active={fileFilter === k} onClick={() => setFileFilter(k)} className="shrink-0">
                  {t.enums.fileKind[k]}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {references.length === 0 ? (
        <EmptyState icon={ImageIcon} title={P.emptyTitle}>
          {P.emptyBody}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {list.map((r, i) => {
            const isImage = files?.get(r.imageId)?.kind === 'image';
            return (
              <ReferenceCard
                key={r.id}
                reference={r}
                onOpen={() => openRef(list, i)}
                onEdit={() => setEditing(r)}
                footer={
                  room.coverReferenceId === r.id ? (
                    <div className="border-t border-line px-3 py-1.5 text-[11px] text-accent">
                      <Star size={11} className="-mt-0.5 me-1 inline" /> {P.roomCover}
                    </div>
                  ) : null
                }
                menu={[
                  { label: P.editDetails, icon: Pencil, onSelect: () => setEditing(r) },
                  { label: P.viewFull, icon: Expand, onSelect: () => openRef([r]) },
                  ...(isImage ? [{ label: P.setCover, icon: Star, onSelect: () => void setRoomCover(room.id, r.id).then(() => toast.success(P.coverUpdated)) }] : []),
                  {
                    label: P.download,
                    icon: Download,
                    onSelect: async () => {
                      const o = await getOriginalBlob(r.imageId);
                      if (o) downloadBlob(o.blob, o.name);
                    },
                  },
                  'separator',
                  { label: P.removeFromRoom, icon: Link2Off, onSelect: () => removeFromRoom(r) },
                  { label: P.delete, icon: Trash2, danger: true, onSelect: () => remove(r) },
                ]}
              />
            );
          })}
        </div>
      )}
      <ReferenceEditor reference={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
