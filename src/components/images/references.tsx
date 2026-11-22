import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, Check, Download, Expand, Link2, MoreHorizontal, Search, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FileKind, ID, ImageAspect, LibraryItem, Reference, ReferenceKind, Room, StoredFile } from '@/lib/types';
import { elementTypeLabel, IMAGE_ASPECTS, IMAGE_INTENTS, REFERENCE_KINDS, referenceKindLabel } from '@/lib/labels';
import { useAllRequirements, useFilesMap, useImageMeta, useLibrary, useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { deleteReferences, referenceUsage, updateReference } from '@/lib/db/references';
import { getOriginalBlob } from '@/lib/hooks/useImageUrl';
import { downloadBlob } from '@/lib/download';
import { computeRoomShape } from '@/lib/geometry/room';
import { wallTitle } from '@/lib/geometry/names';
import { roomDisplayName } from '@/lib/names';
import { matchesSearch } from '@/i18n/arabic';
import { fmtBytes, fmtDate } from '@/i18n/format';
import { useI18n, useT } from '@/i18n';
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
import { FileKindIcon } from '../files/FileIcon';

export function IntentMark({ intent, className }: { intent: Reference['intent']; className?: string }) {
  const t = useT();
  if (intent === 'neutral') return null;
  return intent === 'want' ? (
    <span title={t.refs.wantHint} className={cn('inline-flex h-5 items-center gap-1 rounded-[3px] bg-ok/90 px-1.5 text-[10.5px] font-medium text-white', className)}>
      <Check size={11} strokeWidth={2.5} /> {t.refs.want}
    </span>
  ) : (
    <span title={t.refs.avoidHint} className={cn('inline-flex h-5 items-center gap-1 rounded-[3px] bg-danger/90 px-1.5 text-[10.5px] font-medium text-white', className)}>
      <Ban size={11} strokeWidth={2.5} /> {t.refs.avoid}
    </span>
  );
}

/** Text a reference can be found by: file name, caption, notes, tags, type and room names. */
export function referenceSearchText(r: Reference, file: StoredFile | undefined, rooms: Room[], fileKindLabel?: string): string {
  const roomNames = rooms.filter((x) => r.roomIds.includes(x.id) || r.directionRoomIds.includes(x.id)).flatMap((x) => [x.name, x.nameAr ?? '']);
  return [r.title, r.explanation, r.notes, r.source, ...r.tags, file?.name ?? '', file?.ext ?? '', fileKindLabel ?? '', ...roomNames].join(' ');
}

/** Opens a reference: photos and other files in the full-screen viewer. */
export function useOpenReference() {
  const lightbox = useLightbox();
  return (refs: Reference[], index = 0) =>
    lightbox(
      refs.map((r) => ({ imageId: r.imageId, title: r.title || undefined, description: r.explanation || undefined })),
      index,
    );
}

/** Gallery card for a reference (photo or any other file). */
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
  const t = useT();
  const file = useImageMeta(reference.imageId);
  return (
    <figure
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border bg-surface transition-shadow hover:shadow-soft',
        selected ? 'border-ink ring-1 ring-ink' : 'border-line',
      )}
    >
      <ImageThumb imageId={reference.imageId} className={cn('w-full', aspect)} onClick={onOpen} alt={reference.title} showName>
        <div className="pointer-events-none absolute start-2 top-2 flex gap-1">
          <IntentMark intent={reference.intent} />
        </div>
      </ImageThumb>
      {onToggleSelect && (
        <button
          type="button"
          aria-label={selected ? t.refs.deselect : t.refs.select}
          onClick={onToggleSelect}
          className={cn(
            'absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-sm border transition-opacity',
            selected
              ? 'border-ink bg-ink text-white opacity-100'
              : 'border-white/80 bg-ink/30 text-transparent opacity-100 group-hover:opacity-100 focus:opacity-100 sm:opacity-0',
          )}
        >
          <Check size={13} strokeWidth={2.5} />
        </button>
      )}
      <figcaption className="flex min-w-0 items-start gap-2 px-3 py-2.5">
        <button type="button" onClick={onEdit ?? onOpen} className="min-w-0 flex-1 text-start">
          <div className="truncate text-[13px] text-ink" dir="auto">
            {reference.title || file?.name || <span className="text-ink-4">{t.refs.noCaption}</span>}
          </div>
          {showKind && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-ink-3">
              {file && file.kind !== 'image' && <FileKindIcon kind={file.kind} size={12} />}
              {referenceKindLabel(reference.kind)}
              {file && file.kind !== 'image' && <span className="uppercase">· {file.ext || t.enums.fileKind[file.kind]}</span>}
            </div>
          )}
        </button>
        {menu && menu.length > 0 && <Menu trigger={<IconButton icon={MoreHorizontal} label={t.refs.actions} size="sm" />} items={menu} />}
      </figcaption>
      {footer}
    </figure>
  );
}

type ArrayLinkField = 'roomIds' | 'requirementIds' | 'wallKeys' | 'directionRoomIds' | 'versionIds' | 'elementIds' | 'libraryItemIds' | 'referenceIds';

/** Edit an attachment's caption, meaning and everything it is linked to. */
export function ReferenceEditor({ reference, open, onOpenChange }: { reference: Reference | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, lang } = useI18n();
  const rooms = useRooms() ?? [];
  const requirements = useAllRequirements() ?? [];
  const versions = useVersions() ?? [];
  const library = useLibrary() ?? [];
  const allRefs = useReferences() ?? [];
  const meta = useImageMeta(reference?.imageId);
  const lightbox = useLightbox();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Reference | null>(reference);
  const [usage, setUsage] = useState<{ versions: number; covers: number; requirements: number } | null>(null);
  const [pickRefs, setPickRefs] = useState(false);

  useEffect(() => {
    setDraft(reference ? { ...reference, referenceIds: reference.referenceIds ?? [] } : null);
    if (reference) referenceUsage(reference.id).then(setUsage);
  }, [reference, open]);

  if (!reference || !draft) return null;

  const set = <K extends keyof Reference>(k: K, v: Reference[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const toggleIn = (k: ArrayLinkField, v: string) =>
    setDraft((d) => {
      if (!d) return d;
      const list = (d[k] as string[]) ?? [];
      return { ...d, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const linkedRooms = rooms.filter((r) => draft.roomIds.includes(r.id));
  const linkedRefs = allRefs.filter((r) => draft.referenceIds.includes(r.id));

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
      elementIds: draft.elementIds,
      versionIds: draft.versionIds,
      libraryItemIds: draft.libraryItemIds,
      referenceIds: draft.referenceIds.filter((id) => id !== reference.id),
      directionRoomIds: draft.directionRoomIds.filter((id) => draft.roomIds.includes(id)),
    });
    toast.success(t.refs.saved);
    onOpenChange(false);
  };

  const remove = async () => {
    const u = usage ?? (await referenceUsage(reference.id));
    const r = await confirm({
      title: t.refs.deleteTitle,
      tone: 'danger',
      confirmLabel: t.refs.deleteConfirm,
      description: t.refs.deleteBody(u.requirements, u.covers, u.versions),
    });
    if (!r.confirmed) return;
    await deleteReferences([reference.id]);
    toast.success(t.trash.undoToast, { description: t.trash.moveHint });
    onOpenChange(false);
  };

  const isImage = meta?.kind === 'image';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={t.refs.detailsTitle}
      description={t.refs.detailsHelp}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={remove} className="me-auto">
            {t.common.delete}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-3">
          <ImageThumb
            imageId={reference.imageId}
            variant="full"
            fit="contain"
            showName
            className="aspect-[4/3] w-full rounded-md checker"
            onClick={() => lightbox([{ imageId: reference.imageId, title: draft.title, description: draft.explanation }])}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3">
            <span className="min-w-0 break-all" dir="auto">
              {meta ? t.refs.fileInfo(meta.name, fmtBytes(meta.size), fmtDate(reference.createdAt)) : ''}
              {meta && isImage && meta.width ? ` · ${t.refs.pixels(meta.width, meta.height)}` : ''}
            </span>
            <span className="flex gap-1">
              <IconButton icon={Expand} label={t.refs.viewFull} onClick={() => lightbox([{ imageId: reference.imageId, title: draft.title }])} />
              <IconButton
                icon={Download}
                label={t.files.downloadOriginal}
                onClick={async () => {
                  const o = await getOriginalBlob(reference.imageId);
                  if (o) downloadBlob(o.blob, o.name);
                }}
              />
            </span>
          </div>
          {usage && usage.versions > 0 && <p className="text-[11.5px] text-ink-3">{t.refs.usedInVersions(usage.versions)}</p>}
        </div>

        <div className="flex flex-col gap-4">
          <Field label={t.refs.caption}>
            <Input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder={t.refs.captionPlaceholder} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.common.type}>
              <Select value={draft.kind} onChange={(e) => set('kind', e.target.value as ReferenceKind)}>
                {REFERENCE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.refs.illustrates}>
              <Select value={draft.aspect} onChange={(e) => set('aspect', e.target.value as ImageAspect)}>
                {IMAGE_ASPECTS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t.refs.meaning}>
            <Segmented value={draft.intent} onChange={(v) => set('intent', v)} options={IMAGE_INTENTS.map((i) => ({ value: i.value, label: i.label, title: i.hint }))} />
          </Field>
          <Field label={t.refs.explanation} hint={t.refs.explanationHint}>
            <Textarea value={draft.explanation} onChange={(e) => set('explanation', e.target.value)} minRows={2} placeholder={t.refs.explanationPlaceholder} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.common.source}>
              <Input value={draft.source} onChange={(e) => set('source', e.target.value)} placeholder={t.refs.sourcePlaceholder} />
            </Field>
            <Field label={t.common.tags}>
              <TagInput value={draft.tags} onChange={(tags) => set('tags', tags)} />
            </Field>
          </div>
          <Field label={t.common.notes}>
            <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} minRows={2} />
          </Field>

          <div className="border-t border-line pt-4">
            <div className="eyebrow mb-2">{t.refs.linkedRooms}</div>
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <Chip key={r.id} active={draft.roomIds.includes(r.id)} onClick={() => toggleIn('roomIds', r.id)}>
                  <span dir="auto">{roomDisplayName(r, lang)}</span>
                </Chip>
              ))}
            </div>
          </div>

          {linkedRooms.map((room) => {
            const reqs = requirements.filter((q) => q.roomId === room.id);
            const shape = computeRoomShape(room);
            const roomVersions = versions.filter((v) => v.roomId === room.id).sort((a, b) => a.number - b.number);
            return (
              <div key={room.id} className="rounded-md border border-line bg-raised p-3">
                <div className="mb-2 text-[13px] font-medium" dir="auto">
                  {roomDisplayName(room, lang)}
                </div>
                <Checkbox
                  checked={draft.directionRoomIds.includes(room.id)}
                  onChange={() => toggleIn('directionRoomIds', room.id)}
                  label={t.refs.directionRef}
                  description={t.refs.directionRefHint}
                />
                {reqs.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">{t.refs.requirements}</div>
                    <div className="flex flex-col gap-1.5">
                      {reqs.map((q) => (
                        <Checkbox
                          key={q.id}
                          checked={draft.requirementIds.includes(q.id)}
                          onChange={() => toggleIn('requirementIds', q.id)}
                          label={<span dir="auto">{q.title || t.refs.untitledRequirement}</span>}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {roomVersions.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">{t.refs.versions}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {roomVersions.map((v) => (
                        <Chip key={v.id} active={draft.versionIds.includes(v.id)} onClick={() => toggleIn('versionIds', v.id)}>
                          {t.versions.short(v.number)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
                {shape.segments.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">{t.refs.walls}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {shape.segments.map((s) => {
                        const key = `${room.id}:${s.id}`;
                        return (
                          <Chip key={key} active={draft.wallKeys.includes(key)} onClick={() => toggleIn('wallKeys', key)}>
                            {wallTitle(s, lang)}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}
                {room.elements.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-ink-3">{t.refs.elements}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {room.elements.map((el) => (
                        <Chip key={el.id} active={draft.elementIds.includes(el.id)} onClick={() => toggleIn('elementIds', el.id)}>
                          <span dir="auto">{elementDisplayLabel(el, lang)}</span>
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {library.length > 0 && (
            <div className="border-t border-line pt-4">
              <div className="eyebrow mb-2">{t.refs.library}</div>
              <div className="flex flex-wrap gap-1.5">
                {library.map((item: LibraryItem) => (
                  <Chip key={item.id} active={draft.libraryItemIds.includes(item.id)} onClick={() => toggleIn('libraryItemIds', item.id)}>
                    <span dir="auto">{item.name}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <div className="eyebrow mb-2">{t.refs.attachedTo}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {linkedRefs.map((r) => (
                <span key={r.id} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-raised pe-1 ps-3 text-[12px]">
                  <span className="max-w-[180px] truncate" dir="auto">
                    {r.title || t.refs.noCaption}
                  </span>
                  <button type="button" aria-label={t.ui.remove(r.title || '')} className="p-1 text-ink-3 hover:text-ink" onClick={() => toggleIn('referenceIds', r.id)}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <Button size="sm" variant="ghost" icon={Link2} onClick={() => setPickRefs(true)}>
                {t.refs.attachToReference}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <ReferencePicker
        open={pickRefs}
        onOpenChange={setPickRefs}
        excludeIds={[reference.id, ...draft.referenceIds]}
        onPick={(ids) => setDraft((d) => (d ? { ...d, referenceIds: Array.from(new Set([...d.referenceIds, ...ids])) } : d))}
      />
    </Dialog>
  );
}

/** Label of an architectural element in the interface language. */
export function elementDisplayLabel(el: { label: string; type: Parameters<typeof elementTypeLabel>[0] }, lang: 'ar' | 'en'): string {
  const english = elementTypeLabel(el.type, 'en');
  if (!el.label || el.label === english) return elementTypeLabel(el.type, lang);
  const numbered = new RegExp(`^${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`).exec(el.label);
  if (numbered) return `${elementTypeLabel(el.type, lang)} ${numbered[1]}`;
  return el.label;
}

/** Pick existing references (and optionally upload new ones). */
export function ReferencePicker({
  open,
  onOpenChange,
  onPick,
  title,
  preferRoomId,
  excludeIds = [],
  uploadDefaults,
  confirmLabel,
  single,
  imagesOnly = false,
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
  /** Only photos can be picked (e.g. design inputs). */
  imagesOnly?: boolean;
}) {
  const { t, lang } = useI18n();
  const rooms = useRooms() ?? [];
  const refs = useReferences();
  const files = useFilesMap();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ReferenceKind | 'all'>('all');
  const [fileKind, setFileKind] = useState<FileKind | 'all'>('all');
  const [roomFilter, setRoomFilter] = useState<string>(preferRoomId ?? 'all');
  const [picked, setPicked] = useState<ID[]>([]);
  const { upload, busy } = useUploadReferences();

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setRoomFilter(preferRoomId ?? 'all');
  }, [open, preferRoomId]);

  const list = useMemo(() => {
    return (refs ?? []).filter((r) => {
      if (excludeIds.includes(r.id)) return false;
      const file = files?.get(r.imageId);
      if (imagesOnly && file && file.kind !== 'image') return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (fileKind !== 'all' && file?.kind !== fileKind) return false;
      if (roomFilter !== 'all' && !r.roomIds.includes(roomFilter) && !r.directionRoomIds.includes(roomFilter)) return false;
      if (q.trim() && !matchesSearch(referenceSearchText(r, file, rooms, file ? t.enums.fileKind[file.kind] : ''), q)) return false;
      return true;
    });
  }, [refs, files, q, kind, fileKind, roomFilter, excludeIds, imagesOnly, rooms, t]);

  const toggle = (id: ID) => setPicked((p) => (single ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const fileKinds = Object.keys(t.enums.fileKind) as FileKind[];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={title ?? (imagesOnly ? t.refs.chooseImages : t.refs.chooseTitle)}
      footer={
        <>
          <span className="me-auto text-[12px] text-ink-3">{picked.length ? t.common.selected(picked.length) : t.refs.selectHint}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              onOpenChange(false);
            }}
          >
            {confirmLabel ?? t.refs.attach}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.refs.searchPlaceholder} className="ps-8" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind | 'all')} className="w-[170px]">
          <option value="all">{t.refs.allTypes}</option>
          {REFERENCE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        {!imagesOnly && (
          <Select value={fileKind} onChange={(e) => setFileKind(e.target.value as FileKind | 'all')} className="w-[160px]">
            <option value="all">{t.refs.allFileTypes}</option>
            {fileKinds.map((k) => (
              <option key={k} value={k}>
                {t.enums.fileKind[k]}
              </option>
            ))}
          </Select>
        )}
        <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="w-[180px]">
          <option value="all">{t.common.allRooms}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {roomDisplayName(r, lang)}
            </option>
          ))}
        </Select>
      </div>
      {uploadDefaults && (
        <Dropzone
          compact
          busy={busy}
          imagesOnly={imagesOnly}
          className="mb-4"
          label={imagesOnly ? t.refs.uploadNewImages : t.refs.uploadNew}
          onFiles={async (picked) => {
            const added = await upload(picked, uploadDefaults, { quiet: true, imagesOnly });
            if (added.length) {
              setRoomFilter('all');
              setPicked((p) => (single ? [added[0].id] : [...p, ...added.map((a) => a.id)]));
            }
          }}
        />
      )}
      {refs && list.length === 0 ? (
        <EmptyState compact title={t.refs.noneFound}>
          {t.refs.noneFoundHint(!!uploadDefaults)}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((r) => {
            const on = picked.includes(r.id);
            const file = files?.get(r.imageId);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className={cn('relative overflow-hidden rounded-md border text-start transition-shadow', on ? 'border-ink ring-2 ring-ink' : 'border-line hover:shadow-soft')}
              >
                <ImageThumb imageId={r.imageId} className="aspect-square w-full" showName />
                <div className="px-2 py-1.5">
                  <div className="truncate text-[12px]" dir="auto">
                    {r.title || file?.name || <span className="text-ink-4">{t.refs.noCaption}</span>}
                  </div>
                  <div className="truncate text-[11px] text-ink-3">{referenceKindLabel(r.kind)}</div>
                </div>
                {on && (
                  <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-white">
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                )}
                <IntentMark intent={r.intent} className="absolute start-2 top-2" />
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

export function PrimaryStar({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <IconButton
      icon={Star}
      label={active ? t.refs.primary : t.refs.makePrimary}
      size="xs"
      variant="overlay"
      onClick={onClick}
      className={active ? 'bg-accent text-white hover:bg-accent' : ''}
    />
  );
}
