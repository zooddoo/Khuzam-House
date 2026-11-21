import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeftRight, Columns2, Expand, Maximize2, Minus, Plus, Save, SplitSquareHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CompareItemRef, Comparison, ID, Reference } from '@/lib/types';
import { useReferences, useRooms, useVersions } from '@/lib/hooks/data';
import { useImageUrl } from '@/lib/hooks/useImageUrl';
import { saveComparison, deleteComparison } from '@/lib/db/misc';
import { referenceKindLabel, versionStatusMeta } from '@/lib/labels';
import { Button, IconButton } from '@/components/ui/Button';
import { CommitInput, Input, Segmented, Select } from '@/components/ui/Form';
import { Dialog } from '@/components/ui/Overlay';
import { EmptyState } from '@/components/ui/Display';
import { Tabs } from '@/components/ui/Tabs';
import { ImageThumb } from '@/components/images/ImageThumb';
import { IDENTITY, ZoomPan, zoomAt, type View } from '@/components/images/ZoomPan';
import { useConfirm } from '@/components/ui/Confirm';
import { cn } from '@/components/ui/cn';

interface Resolved {
  ref: CompareItemRef;
  imageId: string | null;
  label: string;
  sublabel: string;
}

export function parseItemsParam(s: string | null): CompareItemRef[] {
  if (!s) return [];
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('ver:') ? { type: 'version' as const, id: t.slice(4) } : { type: 'reference' as const, id: t.replace(/^ref:/, '') }))
    .slice(0, 4);
}

function useResolved(items: CompareItemRef[]): Resolved[] {
  const versions = useVersions() ?? [];
  const refs = useReferences() ?? [];
  const rooms = useRooms() ?? [];
  return items.map((it) => {
    if (it.type === 'version') {
      const v = versions.find((x) => x.id === it.id);
      const room = rooms.find((r) => r.id === v?.roomId);
      return {
        ref: it,
        imageId: v?.imageId ?? null,
        label: v ? `${room?.name ?? 'Room'} · v${v.number}` : 'Missing version',
        sublabel: v ? versionStatusMeta(v.status).label : '',
      };
    }
    const r = refs.find((x) => x.id === it.id);
    return {
      ref: it,
      imageId: r?.imageId ?? null,
      label: r ? r.title || referenceKindLabel(r.kind) : 'Missing image',
      sublabel: r ? referenceKindLabel(r.kind) : '',
    };
  });
}

function PaneImage({ imageId, label }: { imageId: string | null; label: string }) {
  const { url } = useImageUrl(imageId, 'full');
  return (
    <div className="flex h-full w-full items-center justify-center">
      {url ? (
        <img src={url} alt={label} draggable={false} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[12px] text-white/50">No image</span>
      )}
    </div>
  );
}

function SliderView({ a, b, view, onView }: { a: Resolved; b: Resolved; view: View; onView: (v: View) => void }) {
  const [pos, setPos] = useState(50);
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const update = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div ref={wrap} className="relative h-full w-full">
      <ZoomPan view={view} onChange={onView}>
        <div className="relative h-full w-full">
          <div className="absolute inset-0 p-2">
            <PaneImage imageId={b.imageId} label={b.label} />
          </div>
          <div className="absolute inset-0 p-2" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <PaneImage imageId={a.imageId} label={a.label} />
          </div>
        </div>
      </ZoomPan>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Comparison divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 2));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 2));
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
          (e.target as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => dragging.current && update(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        className="absolute inset-y-0 z-10 flex w-8 -translate-x-1/2 cursor-ew-resize items-center justify-center outline-none"
        style={{ left: `${pos}%` }}
      >
        <div className="h-full w-[2px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
        <div className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-pop">
          <ArrowLeftRight size={15} />
        </div>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-sm bg-black/55 px-2 py-1 text-[11.5px] text-white">{a.label}</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-sm bg-black/55 px-2 py-1 text-[11.5px] text-white">{b.label}</span>
    </div>
  );
}

/** Dialog to pick an image for comparison. */
function ComparePicker({
  open,
  onOpenChange,
  onPick,
  roomId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (r: CompareItemRef) => void;
  roomId: ID | null;
}) {
  const versions = useVersions() ?? [];
  const refs = useReferences() ?? [];
  const rooms = useRooms() ?? [];
  const [tab, setTab] = useState<'concepts' | 'site' | 'refs' | 'approved'>('concepts');
  const [room, setRoom] = useState<string>(roomId ?? 'all');
  useEffect(() => {
    if (open) setRoom(roomId ?? 'all');
  }, [open, roomId]);
  const inRoom = (ids: string[]) => room === 'all' || ids.includes(room);
  const approvedIds = new Set(rooms.map((r) => r.approvedVersionId).filter(Boolean) as string[]);
  const list: { key: string; imageId: string | null; title: string; sub: string; ref: CompareItemRef }[] =
    tab === 'concepts' || tab === 'approved'
      ? versions
          .filter((v) => v.imageId && (room === 'all' || v.roomId === room) && (tab === 'concepts' || approvedIds.has(v.id) || v.status === 'approved'))
          .map((v) => ({
            key: v.id,
            imageId: v.imageId,
            title: `${rooms.find((r) => r.id === v.roomId)?.name ?? 'Room'} · v${v.number}`,
            sub: versionStatusMeta(v.status).label,
            ref: { type: 'version', id: v.id },
          }))
      : refs
          .filter(
            (r: Reference) =>
              (tab === 'site' ? r.kind === 'site-photo' : r.kind !== 'site-photo' && r.kind !== 'generated') && inRoom([...r.roomIds, ...r.directionRoomIds]),
          )
          .map((r) => ({
            key: r.id,
            imageId: r.imageId,
            title: r.title || referenceKindLabel(r.kind),
            sub: referenceKindLabel(r.kind),
            ref: { type: 'reference', id: r.id },
          }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="xl" title="Add an image to compare">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'concepts', label: 'Generated concepts' },
            { id: 'approved', label: 'Approved designs' },
            { id: 'site', label: 'Original photos' },
            { id: 'refs', label: 'Inspiration & references' },
          ]}
          className="!border-b-0"
        />
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="w-[200px]">
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {list.length === 0 ? (
        <EmptyState compact title="Nothing here yet" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {list.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => {
                onPick(it.ref);
                onOpenChange(false);
              }}
              className="overflow-hidden rounded-md border border-line text-left hover:shadow-soft"
            >
              <ImageThumb imageId={it.imageId} className="aspect-[4/3] w-full" />
              <div className="px-2 py-1.5">
                <div className="truncate text-[12.5px]">{it.title}</div>
                <div className="text-[11px] text-ink-3">{it.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function CompareWorkspace({ comparison, initialItems }: { comparison: Comparison | null; initialItems: CompareItemRef[] }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const versions = useVersions() ?? [];
  const [items, setItems] = useState<CompareItemRef[]>(comparison?.items ?? initialItems);
  const [mode, setMode] = useState<'side' | 'slider'>(comparison?.mode ?? 'side');
  const [title, setTitle] = useState(comparison?.title ?? '');
  const [notes, setNotes] = useState(comparison?.notes ?? '');
  const [view, setView] = useState<View>(IDENTITY);
  const [picker, setPicker] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const resolved = useResolved(items);
  const roomId = useMemo(() => {
    const v = items.find((i) => i.type === 'version');
    return v ? (versions.find((x) => x.id === v.id)?.roomId ?? null) : (comparison?.roomId ?? null);
  }, [items, versions, comparison]);

  useEffect(() => {
    setItems(comparison?.items ?? initialItems);
    setMode(comparison?.mode ?? 'side');
    setTitle(comparison?.title ?? '');
    setNotes(comparison?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison?.id]);

  const save = async () => {
    const saved = await saveComparison({ id: comparison?.id, title: title.trim() || 'Comparison', roomId, items, mode, notes });
    toast.success('Comparison saved');
    if (!comparison) navigate(`/library/compare/${saved.id}`, { replace: true });
  };

  const zoom = (k: number) => {
    const r = stage.current?.getBoundingClientRect();
    const cx = r ? r.width / (mode === 'side' ? Math.min(2, Math.max(1, items.length)) : 1) / 2 : 300;
    const cy = r ? r.height / 2 : 200;
    setView((v) => zoomAt(v, k, cx, cy));
  };

  const fullscreen = () => {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => toast.error('Full screen is not available'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Comparison title"
          className="max-w-[280px]"
          aria-label="Comparison title"
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'side',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Columns2 size={13} /> Side by side
                </span>
              ),
            },
            {
              value: 'slider',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <SplitSquareHorizontal size={13} /> Slider
                </span>
              ),
            },
          ]}
        />
        <Button size="sm" icon={Plus} onClick={() => setPicker(true)} disabled={items.length >= 4}>
          Add image
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton icon={Minus} label="Zoom out" onClick={() => zoom(1 / 1.4)} />
        <IconButton icon={Plus} label="Zoom in" onClick={() => zoom(1.4)} />
        <IconButton icon={Maximize2} label="Reset zoom" onClick={() => setView(IDENTITY)} />
        <IconButton icon={Expand} label="Full screen" onClick={fullscreen} />
        {mode === 'slider' && items.length >= 2 && (
          <IconButton icon={ArrowLeftRight} label="Swap sides" onClick={() => setItems(([a, b, ...rest]) => [b, a, ...rest])} />
        )}
        <div className="ml-auto flex gap-2">
          {comparison && (
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                const r = await confirm({
                  title: 'Delete this comparison?',
                  tone: 'danger',
                  confirmLabel: 'Delete',
                  description: 'The images themselves are not affected.',
                });
                if (r.confirmed) {
                  await deleteComparison(comparison.id);
                  navigate('/library/compare');
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button size="sm" variant="primary" icon={Save} onClick={save} disabled={!items.length}>
            Save
          </Button>
        </div>
      </div>

      <div ref={stage} className="relative h-[clamp(380px,calc(100dvh-330px),820px)] overflow-hidden rounded-md bg-[#1b1915]">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[13px] text-white/60">
            Pick original photos, inspiration, concepts or the approved design to compare.
            <Button size="sm" icon={Plus} onClick={() => setPicker(true)}>
              Add image
            </Button>
          </div>
        ) : mode === 'slider' && resolved.length >= 2 ? (
          <SliderView a={resolved[0]} b={resolved[1]} view={view} onView={setView} />
        ) : (
          <div
            className={cn(
              'grid h-full gap-px bg-black/40',
              resolved.length === 1 ? 'grid-cols-1' : resolved.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2',
            )}
          >
            {resolved.map((r, i) => (
              <div key={`${r.ref.type}-${r.ref.id}-${i}`} className="relative min-h-0 bg-[#1b1915]">
                <ZoomPan view={view} onChange={setView}>
                  <div className="h-full w-full p-2">
                    <PaneImage imageId={r.imageId} label={r.label} />
                  </div>
                </ZoomPan>
                <div className="pointer-events-none absolute left-3 top-3 rounded-sm bg-black/55 px-2 py-1 text-[11.5px] text-white">
                  {r.label}
                  {r.sublabel && <span className="ml-1.5 text-white/60">{r.sublabel}</span>}
                </div>
                <button
                  type="button"
                  aria-label="Remove from comparison"
                  onClick={() => setItems((its) => its.filter((_, j) => j !== i))}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-sm bg-black/55 text-white hover:bg-black/75"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {mode === 'slider' && resolved.length === 1 && (
          <div className="absolute inset-x-0 bottom-4 text-center text-[12px] text-white/70">Add a second image to use the slider.</div>
        )}
      </div>
      <p className="text-[11.5px] text-ink-3">Scroll or pinch to zoom, drag to pan, double-click to toggle zoom. All panes stay in sync.</p>
      <div>
        <div className="eyebrow mb-2">Notes</div>
        {comparison ? (
          <CommitInput
            multiline
            minRows={3}
            value={comparison.notes}
            onCommit={(v) => saveComparison({ ...comparison, notes: v })}
            placeholder="Observations, decisions, what to change…"
          />
        ) : (
          <textarea
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations, decisions, what to change… (saved with the comparison)"
            className="min-h-[90px] w-full rounded-sm border border-line bg-raised px-3 py-2 text-[13.5px] outline-none focus:border-ink-3"
          />
        )}
      </div>
      <ComparePicker
        open={picker}
        onOpenChange={setPicker}
        roomId={roomId}
        onPick={(r) => setItems((its) => (its.some((x) => x.type === r.type && x.id === r.id) ? its : [...its, r].slice(0, 4)))}
      />
    </div>
  );
}
