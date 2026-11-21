import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { Armchair, ExternalLink, Layers, MoreHorizontal, Pencil, Plus, Search, Sofa, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FurnitureCategory, LibraryItem, LibraryKind, Reference } from '@/lib/types';
import { useLibrary, useReferences, useRooms } from '@/lib/hooks/data';
import { deleteLibraryItem, saveLibraryItem } from '@/lib/db/misc';
import { updateRoom } from '@/lib/db/rooms';
import { createFurnitureRecord } from '@/lib/db/factories';
import { computeRoomShape } from '@/lib/geometry/room';
import { centroid } from '@/lib/geometry/polygon';
import { fmtPrice } from '@/i18n/format';
import { formatLength, formatSize } from '@/lib/units';
import { tr } from '@/i18n/messages';
import { useT } from '@/i18n';
import { matchesSearch, toAsciiDigits } from '@/i18n/arabic';
import { roomDisplayName } from '@/lib/names';
import { AttachmentsSection } from '@/components/files/Attachments';
import { EnglishField } from '@/components/translate/EnglishField';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, Field, Input, Select, Textarea } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Dialog, Menu } from '@/components/ui/Overlay';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { LinkTabs } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/Confirm';
import { ImageThumb } from '@/components/images/ImageThumb';
import { PickerButtons } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';

const MATERIAL_CATEGORY_VALUES = ['paint', 'wood', 'stone', 'tiles', 'metals', 'fabrics', 'curtains', 'lighting', 'other'] as const;

export const MATERIAL_CATEGORIES: { value: string; readonly label: string }[] = MATERIAL_CATEGORY_VALUES.map((value) => ({
  value,
  get label() {
    return tr().materials.materialCategory[value];
  },
}));

/** Furniture categories use the same values as plan furniture so items drop straight into layouts. */
const FURNITURE_LIBRARY_VALUES: FurnitureCategory[] = ['sofa', 'armchair', 'bed', 'table', 'dining-table', 'chair', 'desk', 'cabinet', 'storage', 'outdoor', 'tv-unit', 'lighting', 'rug', 'other'];

export const FURNITURE_LIBRARY_CATEGORIES: { value: FurnitureCategory; readonly label: string }[] = FURNITURE_LIBRARY_VALUES.map((value) => ({
  value,
  get label() {
    return tr().enums.furnitureCategory[value];
  },
}));

function categoriesFor(kind: LibraryKind) {
  return kind === 'material' ? MATERIAL_CATEGORIES : FURNITURE_LIBRARY_CATEGORIES;
}

function blankItem(kind: LibraryKind): Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    kind,
    category: kind === 'material' ? 'paint' : 'sofa',
    name: '',
    width: null,
    depth: null,
    height: null,
    material: '',
    color: '',
    brand: '',
    productUrl: '',
    notes: '',
    price: null,
    currency: 'SAR',
    roomIds: [],
  };
}

function ItemDialog({
  open,
  onOpenChange,
  item,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: LibraryItem | null;
  kind: LibraryKind;
}) {
  const rooms = useRooms() ?? [];
  const t = useT();
  const M = t.materials;
  const { upload, busy } = useUploadReferences();
  const [draft, setDraft] = useState(blankItem(kind));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(item ? { ...item } : blankItem(kind));
    setPendingFiles([]);
    setError(null);
  }, [open, item, kind]);

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    if (!draft.name.trim()) {
      setError(M.nameRequired);
      return;
    }
    if (draft.productUrl && !/^https?:\/\//i.test(draft.productUrl.trim())) {
      setError(M.urlInvalid);
      return;
    }
    const saved = await saveLibraryItem({ ...(item ? { id: item.id } : {}), ...draft, name: draft.name.trim(), productUrl: draft.productUrl.trim() });
    if (pendingFiles.length)
      await upload(
        pendingFiles,
        { kind: kind === 'material' ? 'material' : 'furniture', libraryItemIds: [saved.id], title: saved.name, roomIds: saved.roomIds },
        { quiet: true },
      );
    toast.success(item ? M.saved : M.added(saved.name));
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={item ? M.editTitle(item.name) : kind === 'material' ? M.addMaterialTitle : M.addFurnitureTitle}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field label={t.common.name} error={error}>
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={kind === 'material' ? M.materialPlaceholder : M.furniturePlaceholder}
              dir="auto"
            />
          </Field>
          <Field label={t.common.category}>
            <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
              {categoriesFor(kind).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <EnglishField source={draft.name} compact />
        {item ? (
          <AttachmentsSection
            field="libraryItemIds"
            value={item.id}
            defaults={{ kind: kind === 'material' ? 'material' : 'furniture', title: item.name, roomIds: item.roomIds }}
            title={M.photosFiles}
            emptyHint={M.photosFilesHint}
            compact
          />
        ) : (
          <div>
            <div className="mb-2 text-[12px] font-medium text-ink-2">{M.photosFiles}</div>
            <PickerButtons onFiles={(files) => setPendingFiles((p) => [...p, ...files])} />
            {pendingFiles.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {pendingFiles.map((f, i) => (
                  <li key={i} className="flex max-w-[180px] items-center gap-1 rounded-sm border border-dashed border-line px-2 py-1 text-[11.5px] text-ink-3">
                    <bdi className="truncate">{f.name}</bdi>
                    <button
                      type="button"
                      className="touch-target shrink-0 text-ink-4 hover:text-danger"
                      aria-label={t.common.remove}
                      onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11.5px] text-ink-3">{M.pendingHint}</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <LengthField label={kind === 'material' ? M.sizeLength : M.width} value={draft.width} unit="cm" onChange={(v) => set('width', v)} />
          <LengthField label={kind === 'material' ? M.sizeWidth : M.depth} value={draft.depth} unit="cm" onChange={(v) => set('depth', v)} />
          <LengthField
            label={kind === 'material' ? M.thickness : M.height}
            value={draft.height}
            unit={kind === 'material' ? 'mm' : 'cm'}
            onChange={(v) => set('height', v)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={M.material}>
            <Input value={draft.material} onChange={(e) => set('material', e.target.value)} dir="auto" />
          </Field>
          <Field label={M.color}>
            <Input value={draft.color} onChange={(e) => set('color', e.target.value)} dir="auto" />
          </Field>
          <Field label={M.brand}>
            <Input value={draft.brand} onChange={(e) => set('brand', e.target.value)} dir="auto" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_100px]">
          <Field label={M.productUrl}>
            <Input value={draft.productUrl} onChange={(e) => set('productUrl', e.target.value)} placeholder="https://…" dir="ltr" inputMode="url" />
          </Field>
          <Field label={M.price}>
            <Input
              inputMode="decimal"
              value={draft.price === null ? '' : String(draft.price)}
              onChange={(e) => {
                const v = toAsciiDigits(e.target.value).replace(/[,٫]/, '.');
                set('price', v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : draft.price);
              }}
            />
          </Field>
          <Field label={M.currency}>
            <Input dir="ltr" value={draft.currency} onChange={(e) => set('currency', e.target.value.toUpperCase().slice(0, 4))} />
          </Field>
        </div>
        <Field label={M.rooms} hint={M.roomsHint}>
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((r) => (
              <Chip
                key={r.id}
                active={draft.roomIds.includes(r.id)}
                onClick={() => set('roomIds', draft.roomIds.includes(r.id) ? draft.roomIds.filter((x) => x !== r.id) : [...draft.roomIds, r.id])}
              >
                {roomDisplayName(r)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={t.common.notes}>
          <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} minRows={2} dir="auto" />
        </Field>
        <EnglishField source={draft.notes} compact />
      </div>
    </Dialog>
  );
}

export function MaterialsPage() {
  const { tab = 'furniture' } = useParams();
  const [params, setParams] = useSearchParams();
  const library = useLibrary();
  const refs = useReferences() ?? [];
  const rooms = useRooms() ?? [];
  const confirm = useConfirm();
  const t = useT();
  const M = t.materials;
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [room, setRoom] = useState('all');
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const kind: LibraryKind = tab === 'materials' ? 'material' : 'furniture';

  useEffect(() => setCategory('all'), [kind]);
  useEffect(() => {
    const open = params.get('open');
    if (open && library) {
      const it = library.find((l) => l.id === open);
      if (it) setEditing(it);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams, library]);

  const imagesFor = useMemo(() => {
    const m = new Map<string, Reference[]>();
    for (const r of refs) for (const id of r.libraryItemIds) m.set(id, [...(m.get(id) ?? []), r]);
    return m;
  }, [refs]);

  const list = useMemo(() => {
    return (library ?? []).filter(
      (l) =>
        l.kind === kind &&
        (category === 'all' || l.category === category) &&
        (room === 'all' || l.roomIds.includes(room)) &&
        matchesSearch(`${l.name} ${l.brand} ${l.material} ${l.color} ${l.notes} ${categoriesFor(l.kind).find((c) => c.value === l.category)?.label ?? ''}`, q),
    );
  }, [library, kind, category, room, q]);

  if (tab !== 'furniture' && tab !== 'materials') return <Navigate to="/materials/furniture" replace />;
  if (!library) return <LoadingBlock />;

  const placeInRoom = async (item: LibraryItem, roomId: string) => {
    const target = rooms.find((r) => r.id === roomId);
    if (!target) return;
    const shape = computeRoomShape(target);
    await saveLibraryItem({ ...item, roomIds: item.roomIds.includes(roomId) ? item.roomIds : [...item.roomIds, roomId] });
    if (!shape.drawable) {
      toast.info(M.associated(item.name, roomDisplayName(target)), { description: M.associatedHint });
      return;
    }
    const c = centroid(shape.vertices);
    const known = item.width !== null && item.depth !== null;
    await updateRoom(
      roomId,
      (d) =>
        void d.layout.items.push(
          createFurnitureRecord({
            name: item.name,
            category: (FURNITURE_LIBRARY_CATEGORIES.some((x) => x.value === item.category) ? item.category : 'other') as FurnitureCategory,
            width: item.width ?? 1000,
            depth: item.depth ?? 600,
            height: item.height,
            x: Math.round(c.x),
            y: Math.round(c.y),
            dimsStatus: known ? 'confirmed' : 'estimated',
            libraryItemId: item.id,
          }),
        ),
    );
    toast.success(M.placed(item.name, roomDisplayName(target)), {
      description: known ? M.placedHint : M.placedEstimated,
    });
  };

  const remove = async (item: LibraryItem) => {
    const r = await confirm({
      title: M.deleteTitle(item.name),
      tone: 'danger',
      confirmLabel: t.refs.deleteConfirm,
      description: M.deleteBody,
    });
    if (!r.confirmed) return;
    await deleteLibraryItem(item.id);
    toast.success(M.deleted, { description: t.trash.moveHint });
  };

  return (
    <div>
      <PageHeader
        eyebrow={M.eyebrow}
        title={M.title}
        description={M.lead}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {kind === 'material' ? M.addMaterial : M.addFurniture}
          </Button>
        }
      />
      <LinkTabs
        base="/materials"
        className="mb-6"
        tabs={[
          { id: 'furniture', label: M.furniture, icon: Sofa, badge: library.filter((l) => l.kind === 'furniture').length },
          { id: 'materials', label: M.materials, icon: Layers, badge: library.filter((l) => l.kind === 'material').length },
        ]}
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={M.searchPlaceholder} className="ps-8" aria-label={M.searchLabel} />
        </div>
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="sm:w-[190px]" aria-label={t.common.room}>
          <option value="all">{M.anyRoom}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {roomDisplayName(r)}
            </option>
          ))}
        </Select>
      </div>
      <div className="scroll-thin -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
        <Chip active={category === 'all'} onClick={() => setCategory('all')} className="shrink-0">
          {t.common.all}
        </Chip>
        {categoriesFor(kind).map((c) => (
          <Chip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)} className="shrink-0">
            {c.label}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={kind === 'material' ? Layers : Armchair}
          title={library.some((l) => l.kind === kind) ? M.nothingMatches : kind === 'material' ? M.noMaterials : M.noFurniture}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              {kind === 'material' ? M.addMaterial : M.addFurniture}
            </Button>
          }
        >
          {kind === 'furniture' ? M.noFurnitureBody : M.noMaterialsBody}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          {list.map((item) => {
            const imgs = imagesFor.get(item.id) ?? [];
            const dims =
              item.width !== null || item.depth !== null
                ? formatSize(item.width, item.depth, 'cm') + (item.height !== null ? ` · ${M.heightShort} ${formatLength(item.height, 'cm')}` : '')
                : '';
            return (
              <article key={item.id} className="group overflow-hidden rounded-md border border-line bg-surface">
                <button type="button" onClick={() => setEditing(item)} className="block w-full" aria-label={M.editTitle(item.name)}>
                  {imgs[0] ? (
                    <ImageThumb imageId={imgs[0].imageId} className="aspect-[4/3] w-full" />
                  ) : (
                    <div className="hairline-grid aspect-[4/3] w-full bg-mist/50" />
                  )}
                </button>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] text-ink" dir="auto">
                      {item.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                      {[item.brand, categoriesFor(kind).find((c) => c.value === item.category)?.label].filter(Boolean).join(' · ')}
                    </div>
                    {dims && <div className="mt-1 text-[11.5px] text-ink-2 tabular">{dims}</div>}
                    {item.price !== null && <div className="mt-0.5 text-[11.5px] text-ink-2">{fmtPrice(item.price, item.currency)}</div>}
                    {item.roomIds.length > 0 && (
                      <div className="mt-1.5 truncate text-[11px] text-accent">
                        {item.roomIds
                          .map((id) => roomDisplayName(rooms.find((r) => r.id === id)))
                          .filter(Boolean)
                          .join('، ')}
                      </div>
                    )}
                  </div>
                  <Menu
                    trigger={<IconButton icon={MoreHorizontal} label={t.common.moreActions} />}
                    items={[
                      { label: t.common.edit, icon: Pencil, onSelect: () => setEditing(item) },
                      ...(kind === 'furniture'
                        ? [{ heading: M.placeIn } as const, ...rooms.map((r) => ({ label: roomDisplayName(r), onSelect: () => placeInRoom(item, r.id) }))]
                        : []),
                      ...(item.productUrl
                        ? [{ label: M.openProduct, icon: ExternalLink, onSelect: () => window.open(item.productUrl, '_blank', 'noopener,noreferrer') }]
                        : []),
                      'separator' as const,
                      { label: t.common.delete, icon: Trash2, danger: true, onSelect: () => remove(item) },
                    ]}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ItemDialog open={creating} onOpenChange={setCreating} item={null} kind={kind} />
      <ItemDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        item={editing}
        kind={editing?.kind ?? kind}
      />
    </div>
  );
}
