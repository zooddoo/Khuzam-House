import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { Armchair, ExternalLink, Layers, Library, MoreHorizontal, Pencil, Plus, Search, Sofa, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FurnitureCategory, LibraryItem, LibraryKind, Reference } from '@/lib/types';
import { useLibrary, useReferences, useRooms } from '@/lib/hooks/data';
import { deleteLibraryItem, saveLibraryItem } from '@/lib/db/misc';
import { linkReferences, unlinkReferences } from '@/lib/db/references';
import { updateRoom } from '@/lib/db/rooms';
import { createFurnitureRecord } from '@/lib/db/factories';
import { computeRoomShape } from '@/lib/geometry/room';
import { centroid } from '@/lib/geometry/polygon';
import { formatPrice } from '@/lib/format';
import { formatSize } from '@/lib/units';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, Field, Input, Select, Textarea } from '@/components/ui/Form';
import { LengthField } from '@/components/ui/MeasureInput';
import { Dialog, Menu } from '@/components/ui/Overlay';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { LinkTabs } from '@/components/ui/Tabs';
import { useConfirm } from '@/components/ui/Confirm';
import { ImageThumb } from '@/components/images/ImageThumb';
import { ReferencePicker } from '@/components/images/references';
import { UploadButton } from '@/components/images/Dropzone';
import { useUploadReferences } from '@/components/images/useUpload';
import { useLightbox } from '@/components/images/Lightbox';

export const MATERIAL_CATEGORIES = [
  { value: 'paint', label: 'Paint' },
  { value: 'wood', label: 'Wood' },
  { value: 'stone', label: 'Stone' },
  { value: 'tiles', label: 'Tiles' },
  { value: 'metals', label: 'Metals' },
  { value: 'fabrics', label: 'Fabrics' },
  { value: 'curtains', label: 'Curtains' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'other', label: 'Other' },
];

/** Furniture categories use the same values as plan furniture so items drop straight into layouts. */
export const FURNITURE_LIBRARY_CATEGORIES: { value: FurnitureCategory; label: string }[] = [
  { value: 'sofa', label: 'Sofas' },
  { value: 'armchair', label: 'Armchairs' },
  { value: 'bed', label: 'Beds' },
  { value: 'table', label: 'Tables' },
  { value: 'dining-table', label: 'Dining tables' },
  { value: 'chair', label: 'Chairs' },
  { value: 'desk', label: 'Desks' },
  { value: 'cabinet', label: 'Cabinets' },
  { value: 'storage', label: 'Storage' },
  { value: 'outdoor', label: 'Outdoor furniture' },
  { value: 'tv-unit', label: 'TV units' },
  { value: 'lighting', label: 'Lamps' },
  { value: 'rug', label: 'Rugs' },
  { value: 'other', label: 'Other' },
];

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
  images,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: LibraryItem | null;
  kind: LibraryKind;
  images: Reference[];
}) {
  const rooms = useRooms() ?? [];
  const lightbox = useLightbox();
  const { upload, busy } = useUploadReferences();
  const [draft, setDraft] = useState(blankItem(kind));
  const [picker, setPicker] = useState(false);
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
      setError('Give the item a name');
      return;
    }
    if (draft.productUrl && !/^https?:\/\//i.test(draft.productUrl.trim())) {
      setError('The product link must start with http:// or https://');
      return;
    }
    const saved = await saveLibraryItem({ ...(item ? { id: item.id } : {}), ...draft, name: draft.name.trim(), productUrl: draft.productUrl.trim() });
    if (pendingFiles.length)
      await upload(
        pendingFiles,
        { kind: kind === 'material' ? 'material' : 'furniture', libraryItemIds: [saved.id], title: saved.name, roomIds: saved.roomIds },
        { quiet: true },
      );
    toast.success(item ? 'Saved' : `${saved.name} added`);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={item ? `Edit ${item.name}` : kind === 'material' ? 'Add a material' : 'Add a furniture item'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field label="Name" error={error}>
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={kind === 'material' ? 'e.g. Limewash — Sand' : 'e.g. Modular sofa'}
            />
          </Field>
          <Field label="Category">
            <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
              {categoriesFor(kind).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-2">Images</span>
            <div className="flex gap-1.5">
              <UploadButton
                size="xs"
                onFiles={async (files) =>
                  item
                    ? upload(files, {
                        kind: kind === 'material' ? 'material' : 'furniture',
                        libraryItemIds: [item.id],
                        title: item.name,
                        roomIds: item.roomIds,
                      })
                    : setPendingFiles((p) => [...p, ...files])
                }
              >
                Upload
              </UploadButton>
              {item && (
                <Button size="xs" variant="ghost" icon={Library} onClick={() => setPicker(true)}>
                  From library
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((r) => (
              <div key={r.id} className="group relative">
                <ImageThumb
                  imageId={r.imageId}
                  className="h-20 w-24 rounded-sm border border-line"
                  onClick={() => lightbox([{ imageId: r.imageId, title: r.title }])}
                />
                <button
                  type="button"
                  onClick={() => item && unlinkReferences([r.id], 'libraryItemIds', item.id)}
                  className="absolute right-1 top-1 hidden rounded-sm bg-ink/60 px-1 text-[10px] text-white group-hover:block"
                >
                  Remove
                </button>
              </div>
            ))}
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex h-20 w-24 items-center justify-center rounded-sm border border-dashed border-line p-1 text-center text-[10.5px] text-ink-3"
              >
                {f.name}
              </div>
            ))}
            {!images.length && !pendingFiles.length && <p className="text-[12px] text-ink-3">No images yet.</p>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LengthField label={kind === 'material' ? 'Size (length)' : 'Width'} value={draft.width} unit="cm" onChange={(v) => set('width', v)} />
          <LengthField label={kind === 'material' ? 'Size (width)' : 'Depth'} value={draft.depth} unit="cm" onChange={(v) => set('depth', v)} />
          <LengthField
            label={kind === 'material' ? 'Thickness' : 'Height'}
            value={draft.height}
            unit={kind === 'material' ? 'mm' : 'cm'}
            onChange={(v) => set('height', v)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Material">
            <Input value={draft.material} onChange={(e) => set('material', e.target.value)} />
          </Field>
          <Field label="Color / finish">
            <Input value={draft.color} onChange={(e) => set('color', e.target.value)} />
          </Field>
          <Field label="Brand">
            <Input value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_100px]">
          <Field label="Product URL">
            <Input value={draft.productUrl} onChange={(e) => set('productUrl', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Price (optional)">
            <Input
              inputMode="decimal"
              value={draft.price === null ? '' : String(draft.price)}
              onChange={(e) => {
                const v = e.target.value.replace(',', '.');
                set('price', v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : draft.price);
              }}
            />
          </Field>
          <Field label="Currency">
            <Input value={draft.currency} onChange={(e) => set('currency', e.target.value.toUpperCase().slice(0, 4))} />
          </Field>
        </div>
        <Field label="Associated rooms" hint="Optional. Associated items are listed in that room's redesign prompt as selected products.">
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((r) => (
              <Chip
                key={r.id}
                active={draft.roomIds.includes(r.id)}
                onClick={() => set('roomIds', draft.roomIds.includes(r.id) ? draft.roomIds.filter((x) => x !== r.id) : [...draft.roomIds, r.id])}
              >
                {r.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} minRows={2} />
        </Field>
      </div>
      {item && (
        <ReferencePicker
          open={picker}
          onOpenChange={setPicker}
          title={`Images for ${item.name}`}
          excludeIds={images.map((i) => i.id)}
          onPick={(ids) => linkReferences(ids, 'libraryItemIds', item.id)}
        />
      )}
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
    const needle = q.trim().toLowerCase();
    return (library ?? []).filter(
      (l) =>
        l.kind === kind &&
        (category === 'all' || l.category === category) &&
        (room === 'all' || l.roomIds.includes(room)) &&
        (!needle || `${l.name} ${l.brand} ${l.material} ${l.color} ${l.notes}`.toLowerCase().includes(needle)),
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
      toast.info(`${item.name} associated with ${target.name}`, { description: 'Add the room’s dimensions to place it on the layout plan.' });
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
    toast.success(`${item.name} placed in ${target.name}`, {
      description: known ? 'Drag it into position in the Layout tab.' : 'Its size is unknown, so a placeholder size marked “estimated” was used.',
    });
  };

  const remove = async (item: LibraryItem) => {
    const r = await confirm({
      title: `Delete ${item.name}?`,
      tone: 'danger',
      confirmLabel: 'Delete',
      description: 'Furniture already placed in room layouts keeps its size; only the library link is removed.',
    });
    if (!r.confirmed) return;
    await deleteLibraryItem(item.id);
    toast.success('Deleted');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Optional, shared library"
        title="Materials & Furniture"
        description="Save pieces and finishes once and reuse them in any room you choose. Nothing here is applied to a room unless you associate or place it."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {kind === 'material' ? 'Add material' : 'Add furniture'}
          </Button>
        }
      />
      <LinkTabs
        base="/materials"
        className="mb-6"
        tabs={[
          { id: 'furniture', label: 'Furniture', icon: Sofa, badge: library.filter((l) => l.kind === 'furniture').length },
          { id: 'materials', label: 'Materials', icon: Layers, badge: library.filter((l) => l.kind === 'material').length },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, material" className="pl-8" aria-label="Search library" />
        </div>
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="w-[190px]" aria-label="Room">
          <option value="all">Any room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>
          All
        </Chip>
        {categoriesFor(kind).map((c) => (
          <Chip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={kind === 'material' ? Layers : Armchair}
          title={library.some((l) => l.kind === kind) ? 'Nothing matches' : kind === 'material' ? 'No materials yet' : 'No furniture yet'}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Add {kind === 'material' ? 'a material' : 'furniture'}
            </Button>
          }
        >
          {kind === 'furniture'
            ? 'Record real products with their dimensions to place them accurately on room layouts.'
            : 'Keep paints, woods, stones, tiles and fabrics you are considering, with brands and links.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {list.map((item) => {
            const imgs = imagesFor.get(item.id) ?? [];
            const dims =
              item.width !== null || item.depth !== null
                ? formatSize(item.width, item.depth, 'cm') + (item.height !== null ? ` · H ${Math.round(item.height / 10)} cm` : '')
                : '';
            return (
              <article key={item.id} className="group overflow-hidden rounded-md border border-line bg-surface">
                <button type="button" onClick={() => setEditing(item)} className="block w-full">
                  {imgs[0] ? (
                    <ImageThumb imageId={imgs[0].imageId} className="aspect-[4/3] w-full" />
                  ) : (
                    <div className="hairline-grid aspect-[4/3] w-full bg-mist/50" />
                  )}
                </button>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] text-ink">{item.name}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                      {[item.brand, categoriesFor(kind).find((c) => c.value === item.category)?.label].filter(Boolean).join(' · ')}
                    </div>
                    {dims && <div className="mt-1 text-[11.5px] text-ink-2 tabular">{dims}</div>}
                    {item.price !== null && <div className="mt-0.5 text-[11.5px] text-ink-2">{formatPrice(item.price, item.currency)}</div>}
                    {item.roomIds.length > 0 && (
                      <div className="mt-1.5 truncate text-[11px] text-accent">
                        {item.roomIds
                          .map((id) => rooms.find((r) => r.id === id)?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                  <Menu
                    trigger={<IconButton icon={MoreHorizontal} label="Item actions" />}
                    items={[
                      { label: 'Edit', icon: Pencil, onSelect: () => setEditing(item) },
                      ...(kind === 'furniture'
                        ? [{ heading: 'Place in room layout' } as const, ...rooms.map((r) => ({ label: r.name, onSelect: () => placeInRoom(item, r.id) }))]
                        : []),
                      ...(item.productUrl
                        ? [{ label: 'Open product page', icon: ExternalLink, onSelect: () => window.open(item.productUrl, '_blank', 'noopener,noreferrer') }]
                        : []),
                      'separator' as const,
                      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => remove(item) },
                    ]}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ItemDialog open={creating} onOpenChange={setCreating} item={null} kind={kind} images={[]} />
      <ItemDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        item={editing}
        kind={editing?.kind ?? kind}
        images={editing ? (imagesFor.get(editing.id) ?? []) : []}
      />
    </div>
  );
}
