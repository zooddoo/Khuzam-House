import { useMemo, useState } from 'react';
import { Download, Expand, ImageIcon, Link2Off, Pencil, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Reference, ReferenceKind, Room } from '@/lib/types';
import { REFERENCE_KINDS } from '@/lib/labels';
import { deleteReferences, updateReference } from '@/lib/db/references';
import { setRoomCover } from '@/lib/db/rooms';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { downloadBlob } from '@/lib/download';
import { Dropzone, usePasteImages } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { ReferenceCard, ReferenceEditor } from '@/components/images/references';
import { useLightbox } from '@/components/images/Lightbox';
import { Chip, Field, Select } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';

export function PhotosTab({ room, references }: { room: Room; references: Reference[] }) {
  const { upload, busy } = useUploadReferences();
  const lightbox = useLightbox();
  const confirm = useConfirm();
  const [kind, setKind] = useState<ReferenceKind>('site-photo');
  const [filter, setFilter] = useState<ReferenceKind | 'all'>('all');
  const [editing, setEditing] = useState<Reference | null>(null);

  const doUpload = (files: File[]) => upload(files, { kind, roomIds: [room.id] });
  usePasteImages(doUpload);

  const list = useMemo(() => references.filter((r) => filter === 'all' || r.kind === filter), [references, filter]);
  const kindsPresent = useMemo(() => new Set(references.map((r) => r.kind)), [references]);

  const removeFromRoom = async (r: Reference) => {
    const remainingLinks = r.roomIds.filter((x) => x !== room.id).length + r.libraryItemIds.length + r.versionIds.length;
    const res = await confirm({
      title: 'Remove from this room?',
      description: remainingLinks ? 'The image stays in the Design Library and its other links.' : 'The image will stay in the Design Library, unlinked.',
      confirmLabel: 'Remove from room',
    });
    if (!res.confirmed) return;
    await updateReference(r.id, {
      roomIds: r.roomIds.filter((x) => x !== room.id),
      directionRoomIds: r.directionRoomIds.filter((x) => x !== room.id),
      wallKeys: r.wallKeys.filter((k) => !k.startsWith(`${room.id}:`)),
    });
    if (room.coverReferenceId === r.id) await setRoomCover(room.id, null);
  };

  const remove = async (r: Reference) => {
    const res = await confirm({
      title: 'Delete this image?',
      tone: 'danger',
      confirmLabel: 'Delete',
      description: 'It is removed everywhere in the project. Design versions that used it keep a copy in their history.',
    });
    if (!res.confirmed) return;
    await deleteReferences([r.id]);
    toast.success('Image deleted');
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="display text-[28px]">Photos & references</h2>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-ink-3">
          Actual photos of the room are the most important input for a faithful redesign. Upload them here; attach images to specific requirements in the
          Requirements tab.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-stretch">
        <Field label="Upload as">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind)}>
            {REFERENCE_KINDS.filter((k) => k.value !== 'generated').map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <p className="text-[11.5px] leading-relaxed text-ink-3">You can paste images anywhere on this page (⌘/Ctrl+V).</p>
        </Field>
        <Dropzone onFiles={doUpload} busy={busy} label="Drop room photos here, or click to browse" />
      </div>

      {references.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="opacity-60">{references.length}</span>
          </Chip>
          {REFERENCE_KINDS.filter((k) => kindsPresent.has(k.value)).map((k) => (
            <Chip key={k.value} active={filter === k.value} onClick={() => setFilter(k.value)}>
              {k.label} <span className="opacity-60">{references.filter((r) => r.kind === k.value).length}</span>
            </Chip>
          ))}
        </div>
      )}

      {references.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No images for this room yet">
          Photograph each wall from inside the room, standing in a corner, at eye level. Include ceilings, windows, doors and AC units.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {list.map((r) => (
            <ReferenceCard
              key={r.id}
              reference={r}
              onOpen={() =>
                lightbox(
                  list.map((x) => ({ imageId: x.imageId, title: x.title, description: x.explanation })),
                  list.indexOf(r),
                )
              }
              onEdit={() => setEditing(r)}
              footer={
                room.coverReferenceId === r.id ? (
                  <div className="border-t border-line px-3 py-1.5 text-[11px] text-accent">
                    <Star size={11} className="-mt-0.5 mr-1 inline" /> Room cover
                  </div>
                ) : null
              }
              menu={[
                { label: 'Edit details & links', icon: Pencil, onSelect: () => setEditing(r) },
                { label: 'View full screen', icon: Expand, onSelect: () => lightbox([{ imageId: r.imageId, title: r.title }]) },
                { label: 'Set as room cover', icon: Star, onSelect: () => setRoomCover(room.id, r.id).then(() => toast.success('Cover updated')) },
                {
                  label: 'Download original',
                  icon: Download,
                  onSelect: async () => {
                    const o = await getOriginalBlob(r.imageId);
                    if (o) downloadBlob(o.blob, o.name);
                  },
                },
                'separator',
                { label: 'Remove from this room', icon: Link2Off, onSelect: () => removeFromRoom(r) },
                { label: 'Delete image', icon: Trash2, danger: true, onSelect: () => remove(r) },
              ]}
            />
          ))}
        </div>
      )}
      <ReferenceEditor reference={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
