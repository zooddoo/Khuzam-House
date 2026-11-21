import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Copy, Download, Eye, Grid3x3, Lock, Magnet, Maximize2, Minus, Plus, Redo2, RotateCw, Ruler, Trash2, Undo2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import type { ArchElement, FurnitureCategory, FurnitureItem, LayoutChecks, Room } from '@/lib/types';
import { computeRoomShape } from '@/lib/geometry/room';
import { centroid, degToRad, type Point } from '@/lib/geometry/polygon';
import { validateLayout } from '@/lib/layout/validate';
import { FURNITURE_CATEGORIES, FURNITURE_PRESETS, type FurniturePreset } from '@/lib/labels';
import { formatLength, formatSize } from '@/lib/units';
import { createFurnitureRecord } from '@/lib/db/factories';
import { updateRoom } from '@/lib/db/rooms';
import { saveLibraryItem } from '@/lib/db/misc';
import { newId } from '@/lib/ids';
import { useLibrary } from '@/lib/hooks/data';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { downloadBlob, safeFilename } from '@/lib/download';
import { Button, IconButton } from '../ui/Button';
import { Checkbox, CommitInput, Field, Input, Segmented, Select, Toggle } from '../ui/Form';
import { LengthField } from '../ui/MeasureInput';
import { Menu, Popover, PopoverClose } from '../ui/Overlay';
import { Callout, EmptyState, GroupLabel } from '../ui/Display';
import { cn } from '../ui/cn';
import { PlanSvg, type HandleKind } from './PlanSvg';
import { fitView, planBounds, toScreen, toWorld, type PlanView } from './planMath';
import { renderPlanPng, renderPlanSvg } from './exportPlan';

const COLORS = ['', '#e8dccd', '#d9c8b0', '#c9d3c0', '#cfd8df', '#e7d0c6', '#d6cfe0', '#eee3c4'];
const MIN_SIZE = 50;

type Drag = { kind: 'pan'; start: Point; view: PlanView } | { kind: 'item'; handle: HandleKind; id: string; start: Point; item: FurnitureItem; moved: boolean };

function rotate(p: Point, deg: number): Point {
  const r = degToRad(deg);
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
}

const snapTo = (v: number, step: number) => Math.round(v / step) * step;

export function RoomPlanEditor({ room, onEditElement }: { room: Room; onEditElement?: (el: ArchElement) => void }) {
  const shape = useMemo(() => computeRoomShape(room), [room]);
  const library = useLibrary() ?? [];
  const [items, setItems] = useState<FurnitureItem[]>(room.layout.items);
  const [history, setHistory] = useState<{ past: FurnitureItem[][]; future: FurnitureItem[][] }>({ past: [], future: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showDims, setShowDims] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [canvasRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<PlanView | null>(null);
  const drag = useRef<Drag | null>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const unit = room.displayUnit;
  const layout = room.layout;

  // Sync from the database when not interacting.
  useEffect(() => {
    if (!drag.current) setItems(room.layout.items);
  }, [room.layout.items]);

  const fit = useCallback(() => {
    if (size.width && size.height) setView(fitView(planBounds(shape), size.width, size.height, 30));
  }, [shape, size.width, size.height]);

  useEffect(() => {
    if (!view && size.width && size.height) fit();
  }, [size.width, size.height, view, fit]);

  const warnings = useMemo(() => validateLayout({ shape, elements: room.elements, items, layout }), [shape, room.elements, items, layout]);
  const warnIds = useMemo(() => new Set(warnings.filter((w) => w.level !== 'info').flatMap((w) => w.itemIds)), [warnings]);

  const commit = useCallback(
    async (next: FurnitureItem[], prev: FurnitureItem[] = itemsRef.current) => {
      setHistory((h) => ({ past: [...h.past.slice(-49), prev], future: [] }));
      setItems(next);
      await updateRoom(room.id, (d) => void (d.layout.items = next));
    },
    [room.id],
  );

  const patchItem = (id: string, patch: Partial<FurnitureItem>) => commit(itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const undo = async () => {
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [itemsRef.current, ...h.future] }));
    setItems(prev);
    await updateRoom(room.id, (d) => void (d.layout.items = prev));
  };
  const redo = async () => {
    const next = history.future[0];
    if (!next) return;
    setHistory((h) => ({ past: [...h.past, itemsRef.current], future: h.future.slice(1) }));
    setItems(next);
    await updateRoom(room.id, (d) => void (d.layout.items = next));
  };

  const center = useMemo<Point>(() => (shape.drawable ? centroid(shape.vertices) : { x: 0, y: 0 }), [shape]);

  const addItem = (p: Partial<FurnitureItem> & { name: string }) => {
    const item = createFurnitureRecord({ x: Math.round(center.x), y: Math.round(center.y), ...p });
    commit([...itemsRef.current, item]);
    setSelectedId(item.id);
    setSelectedEl(null);
  };

  const addPreset = (preset: FurniturePreset) =>
    addItem({
      name: preset.label.replace(/\s*\(.*\)$/, ''),
      category: preset.category,
      width: preset.width,
      depth: preset.depth,
      height: preset.height,
      shape: preset.shape ?? 'rect',
      layer: preset.layer ?? 'standard',
      dimsStatus: 'estimated',
    });

  const removeItem = (id: string) => {
    commit(itemsRef.current.filter((it) => it.id !== id));
    setSelectedId(null);
    toast('Item removed', { action: { label: 'Undo', onClick: () => undo() } });
  };

  const duplicateItem = (id: string) => {
    const src = itemsRef.current.find((i) => i.id === id);
    if (!src) return;
    const copy = { ...src, id: newId('f'), name: `${src.name}`, x: src.x + 300, y: src.y + 300 };
    commit([...itemsRef.current, copy]);
    setSelectedId(copy.id);
  };

  // Wheel zoom (non-passive).
  useEffect(() => {
    const el = svgWrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setView((v) => {
        if (!v) return v;
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const scale = Math.min(2, Math.max(0.01, v.scale * factor));
        const k = scale / v.scale;
        return { scale, tx: p.x - (p.x - v.tx) * k, ty: p.y - (p.y - v.ty) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgWrap.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onItemDown = (e: ReactPointerEvent, item: FurnitureItem, handle: HandleKind) => {
    e.stopPropagation();
    setSelectedId(item.id);
    setSelectedEl(null);
    svgWrap.current?.focus();
    if (item.locked || !view) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'item', handle, id: item.id, start: toWorld(view, local(e)), item: { ...item }, moved: false };
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (!view) return;
    setSelectedId(null);
    setSelectedEl(null);
    svgWrap.current?.focus();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'pan', start: local(e), view };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !view) return;
    if (d.kind === 'pan') {
      const p = local(e);
      setView({ ...d.view, tx: d.view.tx + p.x - d.start.x, ty: d.view.ty + p.y - d.start.y });
      return;
    }
    const p = toWorld(view, local(e));
    const it0 = d.item;
    const free = e.altKey || !layout.snap;
    let next: FurnitureItem = it0;
    if (d.handle === 'move') {
      const step = Math.max(10, (layout.gridMm || 100) / 2);
      let x = it0.x + (p.x - d.start.x);
      let y = it0.y + (p.y - d.start.y);
      if (!free) {
        x = snapTo(x, step);
        y = snapTo(y, step);
      }
      next = { ...it0, x, y };
    } else if (d.handle === 'rotate') {
      let a = (Math.atan2(p.y - it0.y, p.x - it0.x) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (!free) a = snapTo(a, 15) % 360;
      next = { ...it0, rotation: Math.round(a) };
    } else {
      const lp = rotate({ x: p.x - it0.x, y: p.y - it0.y }, -it0.rotation);
      let w = it0.width;
      let h = it0.depth;
      let cx = 0;
      let cy = 0;
      const step = free ? 1 : 10;
      if (d.handle.includes('e')) {
        w = Math.max(MIN_SIZE, snapTo(lp.x + it0.width / 2, step));
        cx = -it0.width / 2 + w / 2;
      } else if (d.handle.includes('w')) {
        w = Math.max(MIN_SIZE, snapTo(it0.width / 2 - lp.x, step));
        cx = it0.width / 2 - w / 2;
      }
      if (d.handle.includes('s')) {
        h = Math.max(MIN_SIZE, snapTo(lp.y + it0.depth / 2, step));
        cy = -it0.depth / 2 + h / 2;
      } else if (d.handle.includes('n')) {
        h = Math.max(MIN_SIZE, snapTo(it0.depth / 2 - lp.y, step));
        cy = it0.depth / 2 - h / 2;
      }
      const c = rotate({ x: cx, y: cy }, it0.rotation);
      next = { ...it0, width: w, depth: h, x: it0.x + c.x, y: it0.y + c.y, dimsStatus: 'estimated' };
    }
    d.moved = true;
    setItems((list) => list.map((x) => (x.id === d.id ? next : x)));
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'item' && d.moved) {
      const prev = itemsRef.current.map((x) => (x.id === d.id ? d.item : x));
      commit(itemsRef.current, prev);
      if (d.handle !== 'move' && d.handle !== 'rotate')
        toast.message('Size changed by dragging — marked as estimated', { description: 'Enter exact dimensions in the panel to confirm them.' });
    }
  };

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const selectedElement = room.elements.find((e) => e.id === selectedEl) ?? null;

  const onKey = (e: ReactKeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === '0') return fit();
    if (e.key === '+' || e.key === '=') return setView((v) => v && zoomBy(v, 1.25));
    if (e.key === '-') return setView((v) => v && zoomBy(v, 0.8));
    if (!selected) return;
    if (e.key === 'Escape') setSelectedId(null);
    if (selected.locked) return;
    const step = e.shiftKey ? 100 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      patchItem(selected.id, { x: selected.x + dx, y: selected.y + dy });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeItem(selected.id);
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      patchItem(selected.id, { rotation: (((selected.rotation + (e.shiftKey ? -15 : 90)) % 360) + 360) % 360 });
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateItem(selected.id);
    }
  };

  const zoomBy = (v: PlanView, k: number): PlanView => {
    const cx = size.width / 2;
    const cy = size.height / 2;
    const scale = Math.min(2, Math.max(0.01, v.scale * k));
    const f = scale / v.scale;
    return { scale, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
  };

  const setChecks = (patch: Partial<LayoutChecks>) => updateRoom(room.id, (d) => void Object.assign(d.layout.checks, patch));

  const exportPng = async () => {
    try {
      const blob = await renderPlanPng({ ...room, layout: { ...room.layout, items } });
      downloadBlob(blob, `${safeFilename(room.name)}-plan.png`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const exportSvg = async () => {
    const svg = await renderPlanSvg({ ...room, layout: { ...room.layout, items } });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFilename(room.name)}-plan.svg`);
  };

  const saveToLibrary = async (it: FurnitureItem) => {
    const lib = await saveLibraryItem({
      kind: 'furniture',
      category: it.category,
      name: it.name,
      width: it.width,
      depth: it.depth,
      height: it.height,
      material: '',
      color: '',
      brand: '',
      productUrl: '',
      notes: it.notes,
      price: null,
      currency: 'SAR',
      roomIds: [room.id],
    });
    patchItem(it.id, { libraryItemId: lib.id });
    toast.success(`${it.name} saved to Materials & Furniture`);
  };

  if (!shape.drawable) {
    return (
      <EmptyState icon={Ruler} title="The layout editor needs the room's dimensions">
        Enter the length and width (or the walls of a custom shape) in the Dimensions tab. Furniture is placed to scale, so the room size must be known.
      </EmptyState>
    );
  }

  const handles = selected && view && !selected.locked ? handleLayout(view, selected) : null;
  const estimatedDims = room.geometry.length.certainty === 'estimated' || room.geometry.width.certainty === 'estimated' || shape.area.certainty === 'estimated';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Popover
          trigger={
            <Button variant="primary" size="sm" icon={Plus}>
              Add furniture
            </Button>
          }
          className="w-[360px] p-0"
        >
          <div className="max-h-[420px] overflow-y-auto p-2">
            <div className="eyebrow px-2 pb-1 pt-1">Typical sizes (edit after adding)</div>
            <div className="grid grid-cols-2 gap-1">
              {FURNITURE_PRESETS.map((p) => (
                <PopoverClose asChild key={p.label}>
                  <button type="button" onClick={() => addPreset(p)} className="rounded-sm px-2 py-1.5 text-left hover:bg-mist">
                    <div className="text-[12.5px] text-ink">{p.label}</div>
                    <div className="text-[11px] text-ink-3 tabular">{formatSize(p.width, p.depth, 'cm')}</div>
                  </button>
                </PopoverClose>
              ))}
            </div>
            <PopoverClose asChild>
              <button
                type="button"
                onClick={() => addItem({ name: 'Custom item', width: 1000, depth: 600 })}
                className="mt-1 w-full rounded-sm px-2 py-1.5 text-left text-[12.5px] text-accent hover:bg-mist"
              >
                + Custom item
              </button>
            </PopoverClose>
            {library.filter((l) => l.kind === 'furniture').length > 0 && (
              <>
                <div className="eyebrow px-2 pb-1 pt-3">From your library</div>
                {library
                  .filter((l) => l.kind === 'furniture')
                  .map((l) => (
                    <PopoverClose asChild key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (l.width === null || l.depth === null)
                            toast.info(`${l.name} has no footprint size yet — a placeholder size is used and marked estimated.`);
                          addItem({
                            name: l.name,
                            category: (FURNITURE_CATEGORIES.some((c) => c.value === l.category) ? l.category : 'other') as FurnitureCategory,
                            width: l.width ?? 1000,
                            depth: l.depth ?? 600,
                            height: l.height,
                            dimsStatus: l.width !== null && l.depth !== null ? 'confirmed' : 'estimated',
                            libraryItemId: l.id,
                          });
                        }}
                        className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-mist"
                      >
                        <div className="text-[12.5px]">{l.name}</div>
                        <div className="text-[11px] text-ink-3">
                          {l.width !== null && l.depth !== null ? formatSize(l.width, l.depth, 'cm') : 'Size unknown'}
                        </div>
                      </button>
                    </PopoverClose>
                  ))}
              </>
            )}
          </div>
        </Popover>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton icon={Undo2} label="Undo (⌘Z)" disabled={!history.past.length} onClick={undo} />
        <IconButton icon={Redo2} label="Redo (⇧⌘Z)" disabled={!history.future.length} onClick={redo} />
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton icon={Minus} label="Zoom out (−)" onClick={() => setView((v) => v && zoomBy(v, 0.8))} />
        <IconButton icon={Plus} label="Zoom in (+)" onClick={() => setView((v) => v && zoomBy(v, 1.25))} />
        <IconButton icon={Maximize2} label="Fit to view (0)" onClick={fit} />
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton icon={Grid3x3} label="Grid" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
        <IconButton icon={Ruler} label="Dimensions" active={showDims} onClick={() => setShowDims((v) => !v)} />
        <IconButton icon={Eye} label="Labels" active={showLabels} onClick={() => setShowLabels((v) => !v)} />
        <IconButton
          icon={Magnet}
          label={layout.snap ? 'Snapping on (hold Alt to move freely)' : 'Snapping off'}
          active={layout.snap}
          onClick={() => updateRoom(room.id, (d) => void (d.layout.snap = !d.layout.snap))}
        />
        <div className="ml-auto">
          <Menu
            trigger={
              <Button size="sm" icon={Download}>
                Export plan
              </Button>
            }
            items={[
              { label: 'PNG image', onSelect: exportPng },
              { label: 'SVG drawing', onSelect: exportSvg },
            ]}
          />
        </div>
      </div>

      {estimatedDims && <Callout tone="warn">Some room dimensions are estimated, so clearances and fit are approximate.</Callout>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={canvasRef} className="relative h-[clamp(420px,calc(100dvh-300px),780px)] overflow-hidden rounded-md border border-line">
          <div
            ref={svgWrap}
            tabIndex={0}
            role="application"
            aria-label="Room layout editor. Arrow keys move the selected item, R rotates, Delete removes."
            onKeyDown={onKey}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {view && size.width > 0 && (
              <PlanSvg
                room={room}
                shape={shape}
                items={items}
                unit={unit}
                view={view}
                width={size.width}
                height={size.height}
                selectedId={selectedId}
                selectedElementId={selectedEl}
                warnItemIds={warnIds}
                showGrid={showGrid}
                showDims={showDims}
                showLabels={showLabels}
                onItemPointerDown={onItemDown}
                onElementPointerDown={(e, el) => {
                  e.stopPropagation();
                  setSelectedEl(el.id);
                  setSelectedId(null);
                }}
                onBackgroundPointerDown={onBgDown}
                overlay={
                  handles && selected ? (
                    <g>
                      <line x1={handles.topMid.x} y1={handles.topMid.y} x2={handles.rot.x} y2={handles.rot.y} stroke="#26221d" strokeWidth={1} />
                      <circle
                        cx={handles.rot.x}
                        cy={handles.rot.y}
                        r={6.5}
                        fill="#ffffff"
                        stroke="#26221d"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => onItemDown(e, selected, 'rotate')}
                      />
                      {handles.points.map((h) => (
                        <rect
                          key={h.kind}
                          x={h.p.x - 5}
                          y={h.p.y - 5}
                          width={10}
                          height={10}
                          fill="#ffffff"
                          stroke="#26221d"
                          strokeWidth={1.5}
                          style={{ cursor: h.cursor }}
                          onPointerDown={(e) => onItemDown(e, selected, h.kind)}
                        />
                      ))}
                    </g>
                  ) : null
                }
              />
            )}
          </div>
          <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-ink-4">
            Drag to move · handle to rotate · scroll to zoom · drag background to pan
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {selected ? (
            <ItemPanel
              room={room}
              item={selected}
              onPatch={(patch) => patchItem(selected.id, patch)}
              onDelete={() => removeItem(selected.id)}
              onDuplicate={() => duplicateItem(selected.id)}
              onSaveToLibrary={() => saveToLibrary(selected)}
              warnings={warnings.filter((w) => w.itemIds.includes(selected.id))}
            />
          ) : selectedElement ? (
            <div className="rounded-md border border-line bg-surface p-4">
              <GroupLabel>Architectural element</GroupLabel>
              <div className="text-[14px]">{selectedElement.label}</div>
              <div className="mt-1 text-[12px] text-ink-3">
                {selectedElement.subtype} · {selectedElement.status}
                {selectedElement.width !== null && ` · ${formatLength(selectedElement.width, unit)} wide`}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                Architecture can't be dragged here, so confirmed positions are never changed by accident.
              </p>
              {onEditElement && (
                <Button size="sm" className="mt-3" onClick={() => onEditElement(selectedElement)}>
                  Edit element properties
                </Button>
              )}
            </div>
          ) : (
            <LayoutSettings room={room} items={items} onSelect={setSelectedId} setChecks={setChecks} />
          )}
          <WarningsPanel warnings={warnings} onSelect={(id) => setSelectedId(id)} />
        </div>
      </div>
    </div>
  );
}

function handleLayout(view: PlanView, it: FurnitureItem) {
  const pts: { kind: HandleKind; local: Point; cursor: string }[] = [
    { kind: 'nw', local: { x: -it.width / 2, y: -it.depth / 2 }, cursor: 'nwse-resize' },
    { kind: 'n', local: { x: 0, y: -it.depth / 2 }, cursor: 'ns-resize' },
    { kind: 'ne', local: { x: it.width / 2, y: -it.depth / 2 }, cursor: 'nesw-resize' },
    { kind: 'e', local: { x: it.width / 2, y: 0 }, cursor: 'ew-resize' },
    { kind: 'se', local: { x: it.width / 2, y: it.depth / 2 }, cursor: 'nwse-resize' },
    { kind: 's', local: { x: 0, y: it.depth / 2 }, cursor: 'ns-resize' },
    { kind: 'sw', local: { x: -it.width / 2, y: it.depth / 2 }, cursor: 'nesw-resize' },
    { kind: 'w', local: { x: -it.width / 2, y: 0 }, cursor: 'ew-resize' },
  ];
  const world = (l: Point) => {
    const r = rotate(l, it.rotation);
    return { x: it.x + r.x, y: it.y + r.y };
  };
  const topMid = toScreen(view, world({ x: 0, y: -it.depth / 2 }));
  const c = toScreen(view, { x: it.x, y: it.y });
  const dir = { x: topMid.x - c.x, y: topMid.y - c.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const rot = { x: topMid.x + (dir.x / len) * 26, y: topMid.y + (dir.y / len) * 26 };
  return { points: pts.map((h) => ({ kind: h.kind, cursor: h.cursor, p: toScreen(view, world(h.local)) })), topMid, rot };
}

function ItemPanel({
  room,
  item,
  onPatch,
  onDelete,
  onDuplicate,
  onSaveToLibrary,
  warnings,
}: {
  room: Room;
  item: FurnitureItem;
  onPatch: (p: Partial<FurnitureItem>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveToLibrary: () => void;
  warnings: { id: string; message: string; level: string }[];
}) {
  const unit = room.displayUnit;
  const shape = computeRoomShape(room);
  const minX = shape.bounds.minX;
  const minY = shape.bounds.minY;
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="eyebrow">Furniture</span>
        <div className="flex gap-0.5">
          <IconButton
            icon={item.locked ? Lock : Unlock}
            label={item.locked ? 'Unlock position' : 'Lock position'}
            active={item.locked}
            onClick={() => onPatch({ locked: !item.locked })}
          />
          <IconButton icon={RotateCw} label="Rotate 90° (R)" onClick={() => onPatch({ rotation: (item.rotation + 90) % 360 })} disabled={item.locked} />
          <IconButton icon={Copy} label="Duplicate (⌘D)" onClick={onDuplicate} />
          <IconButton icon={Trash2} label="Delete (Del)" variant="danger" onClick={onDelete} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <CommitInput value={item.name} onCommit={(v) => onPatch({ name: v || 'Item' })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select
              value={item.category}
              onChange={(e) => onPatch({ category: e.target.value as FurnitureCategory, layer: e.target.value === 'rug' ? 'floor' : item.layer })}
            >
              {FURNITURE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shape">
            <Segmented
              size="sm"
              value={item.shape}
              onChange={(v) => onPatch({ shape: v })}
              options={[
                { value: 'rect', label: 'Rect' },
                { value: 'round', label: 'Round' },
              ]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LengthField
            compact
            label="Width"
            value={item.width}
            unit={unit === 'm' ? 'cm' : unit}
            required
            onChange={(v) => v && onPatch({ width: Math.max(MIN_SIZE, v), dimsStatus: 'confirmed' })}
          />
          <LengthField
            compact
            label="Depth"
            value={item.depth}
            unit={unit === 'm' ? 'cm' : unit}
            required
            onChange={(v) => v && onPatch({ depth: Math.max(MIN_SIZE, v), dimsStatus: 'confirmed' })}
          />
          <LengthField compact label="Height" value={item.height} unit={unit === 'm' ? 'cm' : unit} onChange={(v) => onPatch({ height: v })} />
        </div>
        <Field label="Dimensions are">
          <Segmented
            size="sm"
            value={item.dimsStatus}
            onChange={(v) => onPatch({ dimsStatus: v })}
            options={[
              { value: 'confirmed', label: 'Real / measured' },
              { value: 'estimated', label: 'Approximate' },
            ]}
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <LengthField
            compact
            label="From west"
            value={Math.round(item.x - item.width / 2 - minX)}
            unit={unit === 'm' ? 'cm' : unit}
            allowZero
            onChange={(v) => v !== null && onPatch({ x: v + minX + item.width / 2 })}
          />
          <LengthField
            compact
            label="From north"
            value={Math.round(item.y - item.depth / 2 - minY)}
            unit={unit === 'm' ? 'cm' : unit}
            allowZero
            onChange={(v) => v !== null && onPatch({ y: v + minY + item.depth / 2 })}
          />
          <Field label="Rotation">
            <Input
              type="number"
              value={Math.round(item.rotation)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onPatch({ rotation: ((v % 360) + 360) % 360 });
              }}
              className="!h-8 text-[13px]"
            />
          </Field>
        </div>
        <p className="-mt-1 text-[11px] text-ink-4">“From west / north” measure the item’s unrotated edge from the room’s west and north sides.</p>
        <Field label="Color on plan">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c || 'default'}
                type="button"
                aria-label={c ? `Color ${c}` : 'Default color'}
                onClick={() => onPatch({ color: c })}
                className={cn('h-6 w-6 rounded-sm border', item.color === c ? 'border-ink ring-1 ring-ink' : 'border-line')}
                style={{ background: c || '#f2e6da' }}
              />
            ))}
          </div>
        </Field>
        <Checkbox
          checked={item.layer === 'floor'}
          onChange={(v) => onPatch({ layer: v ? 'floor' : 'standard' })}
          label="Floor layer (rug)"
          description="Can sit under other furniture without overlap warnings."
        />
        <Checkbox checked={item.ignoreClearance} onChange={(v) => onPatch({ ignoreClearance: v })} label="Ignore clearance checks" />
        <Field label="Notes">
          <CommitInput multiline minRows={1} value={item.notes} onCommit={(v) => onPatch({ notes: v })} />
        </Field>
        {!item.libraryItemId ? (
          <Button size="sm" variant="ghost" onClick={onSaveToLibrary} className="self-start">
            Save to Materials & Furniture
          </Button>
        ) : (
          <p className="text-[11.5px] text-ink-3">Linked to an item in Materials & Furniture.</p>
        )}
        {warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {warnings.map((w) => (
              <p key={w.id} className={cn('text-[12px] leading-snug', w.level === 'info' ? 'text-ink-3' : 'text-danger')}>
                {w.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LayoutSettings({
  room,
  items,
  onSelect,
  setChecks,
}: {
  room: Room;
  items: FurnitureItem[];
  onSelect: (id: string) => void;
  setChecks: (p: Partial<LayoutChecks>) => void;
}) {
  const c = room.layout.checks;
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <GroupLabel>Layout</GroupLabel>
      {items.length === 0 ? (
        <p className="mb-4 text-[12.5px] text-ink-3">
          No furniture yet. Use “Add furniture”, then drag pieces into place. Enter real sizes whenever you know them.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1.5 text-left hover:bg-mist"
              >
                <span className="truncate text-[13px]">{it.name}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3 tabular">
                  {formatSize(it.width, it.depth, 'cm')}
                  {it.dimsStatus === 'estimated' ? ' ≈' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <LengthField
          label="Minimum walking clearance"
          value={room.layout.clearanceMm}
          unit="cm"
          onChange={(v) => v !== null && updateRoom(room.id, (d) => void (d.layout.clearanceMm = v))}
          hint="Gaps narrower than this are flagged. Gaps under 10 cm count as pieces placed together."
        />
        <div className="grid grid-cols-2 gap-2">
          <Toggle size="sm" checked={c.overlap} onChange={(v) => setChecks({ overlap: v })} label={<span className="text-[12px]">Overlaps</span>} />
          <Toggle size="sm" checked={c.bounds} onChange={(v) => setChecks({ bounds: v })} label={<span className="text-[12px]">Room bounds</span>} />
          <Toggle size="sm" checked={c.doors} onChange={(v) => setChecks({ doors: v })} label={<span className="text-[12px]">Doors</span>} />
          <Toggle size="sm" checked={c.windows} onChange={(v) => setChecks({ windows: v })} label={<span className="text-[12px]">Windows</span>} />
          <Toggle size="sm" checked={c.ac} onChange={(v) => setChecks({ ac: v })} label={<span className="text-[12px]">AC units</span>} />
          <Toggle size="sm" checked={c.architecture} onChange={(v) => setChecks({ architecture: v })} label={<span className="text-[12px]">Columns</span>} />
          <Toggle size="sm" checked={c.clearance} onChange={(v) => setChecks({ clearance: v })} label={<span className="text-[12px]">Clearances</span>} />
        </div>
        <Field label="Grid size">
          <Select value={String(room.layout.gridMm)} onChange={(e) => updateRoom(room.id, (d) => void (d.layout.gridMm = Number(e.target.value)))}>
            {[50, 100, 250, 500].map((g) => (
              <option key={g} value={g}>
                {g / 10} cm
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}

function WarningsPanel({ warnings, onSelect }: { warnings: ReturnType<typeof validateLayout>; onSelect: (id: string) => void }) {
  const problems = warnings.filter((w) => w.level !== 'info');
  const infos = warnings.filter((w) => w.level === 'info');
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <GroupLabel>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle size={12} /> Checks
        </span>
      </GroupLabel>
      {warnings.length === 0 ? (
        <p className="text-[12.5px] text-ok">No conflicts found.</p>
      ) : (
        <ul className="scroll-thin flex max-h-[300px] flex-col gap-2 overflow-y-auto">
          {[...problems, ...infos].map((w) => (
            <li key={w.id}>
              <button
                type="button"
                disabled={!w.itemIds.length}
                onClick={() => w.itemIds[0] && onSelect(w.itemIds[0])}
                className={cn('flex w-full gap-2 text-left text-[12px] leading-snug', w.itemIds.length && 'hover:underline')}
              >
                <span
                  className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', w.level === 'error' ? 'bg-danger' : w.level === 'warning' ? 'bg-warn' : 'bg-ink-4')}
                />
                <span className={w.level === 'info' ? 'text-ink-3' : 'text-ink-2'}>{w.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-4">Furniture is never moved automatically — you decide how to resolve each warning.</p>
    </div>
  );
}
