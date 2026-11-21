import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, Check, Download, Expand, MoreHorizontal, Search, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ID, ImageAspect, ImageIntent, Reference, ReferenceKind } from '@/lib/types';
import { IMAGE_ASPECTS, IMAGE_INTENTS, REFERENCE_KINDS, referenceKindLabel } from '@/lib/labels';
import { useAllRequirements, useImageMeta, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { deleteReferences, referenceUsage, updateReference } from '@/lib/db/references';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { downloadBlob } from '@/lib/download';
import { formatBytes, formatDate } from '@/lib/format';
import { computeRoomShape } from '@/lib/geometry/room';
import { cn } from '../ui/cn';
import { Button, IconButton } from '../ui/Button';
import { Checkbox, Chip, Field, Input, Segmented, Select, TagInput, Textarea } from '../ui/Form';
import { Dialog, Menu, type MenuEntry } from '../ui/Overlay';
import { EmptyState } from '../ui/Display';
import { useConfirm } from '../ui/Confirm';
import { ImageThumb } from './ImageThumb';
import { useLightbox } from './Lightbox';
import { Dropzone } from './Dropzone';
import { useUploadReferences } from './useUpload';

export function IntentMark({ intent, className }: { intent: ImageIntent; className?: string }) {
  if (intent === 'neutral') return null;
  return intent === 'want' ? (
    <span
      title="Example of something I want"
      className={cn('inline-flex h-5 items-center gap-1 rounded-[3px] bg-ok/90 px-1.5 text-[10.5px] font-medium text-white', className)}
    >
      <Check size={11} strokeWidth={2.5} /> Want
    </span>
  ) : (
    <span
      title="Example of something NOT wanted"
      className={cn('inline-flex h-5 items-center gap-1 rounded-[3px] bg-danger/90 px-1.5 text-[10.5px] font-medium text-white', className)}
    >
      <Ban size={11} strokeWidth={2.5} /> Avoid
    </span>
  );
}

/** Gallery card for a reference image. */
export function ReferenceCard({
  reference,
  onOpen,
  onEdit,
  menu,
  selected,
  onToggleSelect,
  footer,
  aspect = 'aspect-[4/3]',
  showKind = true,
}: {
  reference: Reference;
  onOpen?: () => void;
  onEdit?: () => void;
  menu?: MenuEntry[];
  selected?: boolean;
  onToggleSelect?: () => void;
  footer?: ReactNode;
  aspect?: string;
  showKind?: boolean;
}) {
  return (
    <figure
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border bg-surface transition-shadow hover:shadow-soft',
        selected ? 'border-ink ring-1 ring-ink' : 'border-line',
      )}
    >
      <ImageThumb imageId={reference.imageId} className={cn('w-full', aspect)} onClick={onOpen} alt={reference.title}>
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
          <IntentMark intent={reference.intent} />
        </div>
      </ImageThumb>
      {onToggleSelect && (
        <button
          type="button"
          aria-label={selected ? 'Deselect' : 'Select'}
          onClick={onToggleSelect}
          className={cn(
            'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm border transition-opacity',
            selected
              ? 'border-ink bg-ink text-white opacity-100'
              : 'border-white/80 bg-ink/30 text-transparent opacity-0 group-hover:opacity-100 focus:opacity-100',
          )}
        >
          <Check size={13} strokeWidth={2.5} />
        </button>
      )}
      <figcaption className="flex min-w-0 items-start gap-2 px-3 py-2.5">
        <button type="button" onClick={onEdit ?? onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[13px] text-ink" dir="auto">
            {reference.title || <span className="text-ink-4">No caption</span>}
          </div>
          {showKind && <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{referenceKindLabel(reference.kind)}</div>}
        </button>
        {menu && menu.length > 0 && <Menu trigger={<IconButton icon={MoreHorizontal} label="Image actions" size="xs" />} items={menu} />}
      </figcaption>
      {footer}
    </figure>
  );
}

/** Edit a reference's caption, meaning and links. */
export function ReferenceEditor({ reference, open, onOpenChange }: { reference: Reference | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const rooms = useRooms() ?? [];
  const requirements = useAllRequirements() ?? [];
  const versions = useVersions() ?? [];
  const meta = useImageMeta(reference?.imageId);
  const lightbox = useLightbox();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Reference | null>(reference);
  const [usage, setUsage] = useState<{ versions: number; covers: number; requirements: number } | null>(null);

  useEffect(() => {
    setDraft(reference);
    if (reference) referenceUsage(reference.id).then(setUsage);
  }, [reference, open]);

  if (!reference || !draft) return null;

  const set = <K extends keyof Reference>(k: K, v: Reference[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const toggleIn = (k: 'roomIds' | 'requirementIds' | 'wallKeys' | 'directionRoomIds' | 'versionIds', v: string) =>
    setDraft((d) => (d ? { ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] } : d));

  const linkedRooms = rooms.filter((r) => draft.roomIds.includes(r.id));

  const save = async () => {
    await updateReference(reference.id, {
      title: draft.title.trim(),
      kind: draft.kind,
      intent: draft.intent,
      aspect: draft.aspect,
      explanation: draft.explanation.trim(),
      notes: draft.notes,
      source: draft.source.trim(),
      tags: draft.tags,
      roomIds: draft.roomIds,
      requirementIds: draft.requirementIds,
      wallKeys: draft.wallKeys,
      versionIds: draft.versionIds,
      directionRoomIds: draft.directionRoomIds.filter((id) => draft.roomIds.includes(id)),
    });
    toast.success('Image details saved');
    onOpenChange(false);
  };

  const remove = async () => {
    const u = usage ?? (await referenceUsage(reference.id));
    const r = await confirm({
      title: 'Delete this image?',
      tone: 'danger',
      confirmLabel: 'Delete image',
      description: (
        <>
          It will be removed from the library{u.requirements ? `, from ${u.requirements} requirement${u.requirements > 1 ? 's' : ''}` : ''}
          {u.covers ? ' and from covers' : ''}.{' '}
          {u.versions > 0 && `It was used in ${u.versions} design version${u.versions > 1 ? 's' : ''}; their history keeps a copy.`}
        </>
      ),
    });
    if (!r.confirmed) return;
    await deleteReferences([reference.id]);
    toast.success('Image deleted');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Image details"
      description="Captions and explanations are sent to the AI together with the image, so it knows what each image is for."
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={remove} className="mr-auto">
            Delete
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-3">
          <ImageThumb
            imageId={reference.imageId}
            variant="full"
            fit="contain"
            className="aspect-[4/3] w-full rounded-md checker"
            onClick={() => lightbox([{ imageId: reference.imageId, title: draft.title, description: draft.explanation }])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3">
            <span className="min-w-0 truncate">
              {meta?.name} · {meta ? `${meta.width}×${meta.height}` : ''} · {meta ? formatBytes(meta.size) : ''} · added {formatDate(reference.createdAt)}
            </span>
            <span className="flex gap-1">
              <IconButton icon={Expand} label="View full screen" onClick={() => lightbox([{ imageId: reference.imageId, title: draft.title }])} />
              <IconButton
                icon={Download}
                label="Download original"
                onClick={async () => {
                  const o = await getOriginalBlob(reference.imageId);
                  if (o) downloadBlob(o.blob, o.name);
                }}
              />
            </span>
          </div>
          {usage && usage.versions > 0 && <p className="text-[11.5px] text-ink-3">Used as input or output in {usage.versions} design version(s).</p>}
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Caption">
            <Input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Reading chair I like" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select value={draft.kind} onChange={(e) => set('kind', e.target.value as ReferenceKind)}>
                {REFERENCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Illustrates">
              <Select value={draft.aspect} onChange={(e) => set('aspect', e.target.value as ImageAspect)}>
                {IMAGE_ASPECTS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Meaning">
            <Segmented
              value={draft.intent}
              onChange={(v) => set('intent', v)}
              options={IMAGE_INTENTS.map((i) => ({ value: i.value, label: i.label, title: i.hint }))}
            />
          </Field>
          <Field label="Explanation" hint="What should be taken from this image — or avoided.">
            <Textarea
              value={draft.explanation}
              onChange={(e) => set('explanation', e.target.value)}
              minRows={2}
              placeholder="e.g. The low armchair shape and boucle fabric, not the color."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source">
              <Input value={draft.source} onChange={(e) => set('source', e.target.value)} placeholder="URL or where it came from" />
            </Field>
            <Field label="Tags">
              <TagInput value={draft.tags} onChange={(t) => set('tags', t)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} minRows={2} />
          </Field>

          <div className="border-t border-line pt-4">
            <div className="eyebrow mb-2">Linked rooms</div>
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <Chip key={r.id} active={draft.roomIds.includes(r.id)} onClick={() => toggleIn('roomIds', r.id)}>
                  {r.name}
                </Chip>
              ))}
            </div>
          </div>

          {linkedRooms.map((room) => {
            const reqs = requirements.filter((q) => q.roomId === room.id);
            const shape = computeRoomShape(room);
            return (
              <div key={room.id} className="rounded-md border border-line bg-raised p-3">
                <div className="mb-2 text-[13px] font-medium">{room.name}</div>
                <Checkbox
                  checked={draft.directionRoomIds.includes(room.id)}
                  onChange={() => toggleIn('directionRoomIds', room.id)}
                  label="Design direction reference"
                  description="Use as a style reference for this room's design direction."
                />
                {reqs.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">Requirements</div>
                    <div className="flex flex-col gap-1.5">
                      {reqs.map((q) => (
                        <Checkbox
                          key={q.id}
                          checked={draft.requirementIds.includes(q.id)}
                          onChange={() => toggleIn('requirementIds', q.id)}
                          label={q.title || 'Untitled requirement'}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {versions.some((v) => v.roomId === room.id) && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">Design versions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {versions
                        .filter((v) => v.roomId === room.id)
                        .sort((a, b) => a.number - b.number)
                        .map((v) => (
                          <Chip key={v.id} active={draft.versionIds.includes(v.id)} onClick={() => toggleIn('versionIds', v.id)}>
                            v{v.number}
                          </Chip>
                        ))}
                    </div>
                  </div>
                )}
                {shape.segments.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">Walls</div>
                    <div className="flex flex-wrap gap-1.5">
                      {shape.segments.map((s) => {
                        const key = `${room.id}:${s.id}`;
                        return (
                          <Chip key={key} active={draft.wallKeys.includes(key)} onClick={() => toggleIn('wallKeys', key)}>
                            {s.name}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

/** Pick existing references (and optionally upload new ones). */
export function ReferencePicker({
  open,
  onOpenChange,
  onPick,
  title = 'Choose images',
  preferRoomId,
  excludeIds = [],
  uploadDefaults,
  confirmLabel = 'Attach',
  single,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (ids: ID[]) => void;
  title?: string;
  preferRoomId?: ID | null;
  excludeIds?: ID[];
  uploadDefaults?: Partial<Reference>;
  confirmLabel?: string;
  single?: boolean;
}) {
  const rooms = useRooms() ?? [];
  const refs = useReferences();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ReferenceKind | 'all'>('all');
  const [roomFilter, setRoomFilter] = useState<string>(preferRoomId ?? 'all');
  const [picked, setPicked] = useState<ID[]>([]);
  const { upload, busy } = useUploadReferences();

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setRoomFilter(preferRoomId ?? 'all');
  }, [open, preferRoomId]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (refs ?? []).filter((r) => {
      if (excludeIds.includes(r.id)) return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (roomFilter !== 'all' && !r.roomIds.includes(roomFilter) && !r.directionRoomIds.includes(roomFilter)) return false;
      if (needle && ![r.title, r.explanation, r.notes, ...r.tags].join(' ').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [refs, q, kind, roomFilter, excludeIds]);

  const toggle = (id: ID) => setPicked((p) => (single ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={title}
      footer={
        <>
          <span className="mr-auto text-[12px] text-ink-3">{picked.length ? `${picked.length} selected` : 'Select one or more images'}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search captions, notes, tags" className="pl-8" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind | 'all')} className="w-[170px]">
          <option value="all">All types</option>
          {REFERENCE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="w-[180px]">
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {uploadDefaults && (
        <Dropzone
          compact
          busy={busy}
          className="mb-4"
          label="Upload new images"
          onFiles={async (files) => {
            const added = await upload(files, uploadDefaults, { quiet: true });
            if (added.length) {
              setRoomFilter('all');
              setPicked((p) => (single ? [added[0].id] : [...p, ...added.map((a) => a.id)]));
            }
          }}
        />
      )}
      {refs && list.length === 0 ? (
        <EmptyState compact title="No images found">
          Try a different filter{uploadDefaults ? ', or upload new images above' : ''}.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((r) => {
            const on = picked.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={cn(
                  'relative overflow-hidden rounded-md border text-left transition-shadow',
                  on ? 'border-ink ring-2 ring-ink' : 'border-line hover:shadow-soft',
                )}
              >
                <ImageThumb imageId={r.imageId} className="aspect-square w-full" />
                <div className="px-2 py-1.5">
                  <div className="truncate text-[12px]" dir="auto">
                    {r.title || <span className="text-ink-4">No caption</span>}
                  </div>
                  <div className="truncate text-[11px] text-ink-3">{referenceKindLabel(r.kind)}</div>
                </div>
                {on && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-white">
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                )}
                <IntentMark intent={r.intent} className="absolute left-2 top-2" />
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

export function PrimaryStar({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <IconButton
      icon={Star}
      label={active ? 'Primary reference' : 'Mark as primary reference'}
      size="xs"
      variant="overlay"
      onClick={onClick}
      className={active ? 'bg-accent text-white hover:bg-accent' : ''}
    />
  );
}
