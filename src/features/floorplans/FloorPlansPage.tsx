import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Crosshair, FileImage, Hand, Layers, Maximize2, Minus, MousePointer2, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Floor, Room } from '@/lib/types';
import { computeRoomShape, dimensionSummary, areaSummary } from '@/lib/geometry/room';
import { add, bbox, rectCorners, type Point } from '@/lib/geometry/polygon';
import { roomStatusMeta, TONE_DOT, TONE_HEX } from '@/lib/labels';
import { useFloors, useImageMeta, useReference, useRooms } from '@/lib/hooks/data';
import { useImageUrl } from '@/lib/hooks/useImageUrl';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { addFloor, deleteFloor, updateFloor } from '@/lib/db/misc';
import { patchRoom } from '@/lib/db/rooms';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, Field, Input } from '@/components/ui/Form';
import { Dialog, Menu } from '@/components/ui/Overlay';
import { Callout, EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/Confirm';
import { ReferencePicker } from '@/components/images/references';
import { cn } from '@/components/ui/cn';
import { fitView, pathFrom, toScreen, toWorld, type PlanView } from '@/components/plan/planMath';

const PLACEHOLDER = 3000;
const DEFAULT_PX_PER_MM = 0.1;

interface Placed {
  room: Room;
  outline: Point[];
  known: boolean;
  center: Point;
}

function placedOutline(room: Room): { outline: Point[]; known: boolean } {
  const shape = computeRoomShape(room);
  const p = room.planPlacement ?? { x: 0, y: 0, rotation: 0 };
  if (shape.drawable) {
    const b = shape.bounds;
    const c = { x: b.minX + b.width / 2, y: b.minY + b.height / 2 };
    const r = (p.rotation * Math.PI) / 180;
    const outline = shape.vertices.map((v) => {
      const dx = v.x - c.x;
      const dy = v.y - c.y;
      return { x: p.x + dx * Math.cos(r) - dy * Math.sin(r), y: p.y + dx * Math.sin(r) + dy * Math.cos(r) };
    });
    return { outline, known: true };
  }
  return { outline: rectCorners(p.x, p.y, PLACEHOLDER, PLACEHOLDER, p.rotation), known: false };
}

function FloorDialog({ open, onOpenChange, floor }: { open: boolean; onOpenChange: (o: boolean) => void; floor?: Floor | null }) {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (open) setName(floor?.name ?? '');
  }, [open, floor]);
  const save = async (n = name) => {
    if (!n.trim()) return;
    if (floor) await updateFloor(floor.id, { name: n.trim() });
    else {
      const f = await addFloor(n);
      navigate(`/floor-plans/${f.id}`);
    }
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={floor ? 'Rename floor' : 'Add a floor'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={!name.trim()}>
            {floor ? 'Save' : 'Add floor'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-3"
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ground floor" />
        </Field>
        {!floor && (
          <div className="flex flex-wrap gap-1.5">
            {['Ground floor', 'First floor', 'Second floor', 'Roof', 'Basement', 'Outdoor'].map((n) => (
              <Chip key={n} onClick={() => save(n)}>
                {n}
              </Chip>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  );
}

export function FloorPlansPage() {
  const { floorId } = useParams();
  const floors = useFloors();
  const rooms = useRooms() ?? [];
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<{ floor: Floor | null } | null>(null);
  const [mode, setMode] = useState<'view' | 'arrange' | 'calibrate'>('view');
  const [hover, setHover] = useState<string | null>(null);
  const [planPicker, setPlanPicker] = useState(false);
  const [canvasRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<PlanView | null>(null);
  const [calPoints, setCalPoints] = useState<Point[]>([]);
  const [calDistance, setCalDistance] = useState('');
  const svgRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: 'pan'; start: Point; view: PlanView }
    | { kind: 'room'; id: string; start: Point; origin: Point; moved: boolean }
    | { kind: 'plan'; start: Point; origin: Point }
    | null
  >(null);
  const [dragPos, setDragPos] = useState<{ id: string; p: Point } | null>(null);

  const floor = floors?.find((f) => f.id === floorId) ?? floors?.[0] ?? null;
  const planRef = useReference(floor?.planReferenceId);
  const planMeta = useImageMeta(planRef?.imageId);
  const { url: planUrl } = useImageUrl(planRef?.imageId, 'full');
  const onFloor = useMemo(() => rooms.filter((r) => floor && r.floorId === floor.id), [rooms, floor]);
  const unassigned = rooms.filter((r) => !r.floorId);
  const elsewhere = rooms.filter((r) => r.floorId && r.floorId !== floor?.id);

  const placed: Placed[] = useMemo(
    () =>
      onFloor
        .filter((r) => r.planPlacement)
        .map((room) => {
          const r = dragPos?.id === room.id ? { ...room, planPlacement: { ...room.planPlacement!, x: dragPos.p.x, y: dragPos.p.y } } : room;
          const { outline, known } = placedOutline(r);
          const b = bbox(outline);
          return { room, outline, known, center: { x: b.minX + b.width / 2, y: b.minY + b.height / 2 } };
        }),
    [onFloor, dragPos],
  );
  const notPlaced = onFloor.filter((r) => !r.planPlacement);

  const pxPerMm = floor?.planCalibration?.pxPerMm ?? DEFAULT_PX_PER_MM;
  const planOrigin = { x: floor?.planCalibration?.offsetX ?? 0, y: floor?.planCalibration?.offsetY ?? 0 };
  const planSize = planMeta ? { w: planMeta.width / pxPerMm, h: planMeta.height / pxPerMm } : null;

  const fit = () => {
    if (!size.width || !size.height) return;
    const pts = placed.flatMap((p) => p.outline);
    if (planSize) pts.push(planOrigin, add(planOrigin, { x: planSize.w, y: planSize.h }));
    const b = pts.length ? bbox(pts) : { minX: 0, minY: 0, width: 12000, height: 9000 };
    setView(fitView({ minX: b.minX - 1000, minY: b.minY - 1000, width: b.width + 2000, height: b.height + 2000 }, size.width, size.height, 30));
  };

  useEffect(() => {
    setView(null);
  }, [floor?.id]);
  useEffect(() => {
    if (!view && size.width && size.height) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size.width, size.height, planSize?.w]);
  // Re-fit when rooms are added to or removed from the plan.
  useEffect(() => {
    if (size.width && size.height) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.length]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setView((v) => {
        if (!v) return v;
        const scale = Math.min(1, Math.max(0.002, v.scale * Math.exp(-e.deltaY * 0.0015)));
        const k = scale / v.scale;
        return { scale, tx: p.x - (p.x - v.tx) * k, ty: p.y - (p.y - v.ty) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [floor?.id]);

  if (!floors) return <LoadingBlock />;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const placeRoom = async (room: Room) => {
    if (!floor) return;
    const pts = placed.flatMap((p) => p.outline);
    const b = pts.length ? bbox(pts) : null;
    const shape = computeRoomShape(room);
    const w = shape.drawable ? shape.bounds.width : PLACEHOLDER;
    const h = shape.drawable ? shape.bounds.height : PLACEHOLDER;
    const x = b ? b.maxX + 800 + w / 2 : w / 2;
    const y = b ? b.minY + h / 2 : h / 2;
    await patchRoom(room.id, { floorId: floor.id, planPlacement: { x: Math.round(x), y: Math.round(y), rotation: 0 } });
    setView(null);
  };

  const onRoomDown = (e: ReactPointerEvent, p: Placed) => {
    e.stopPropagation();
    if (mode === 'view') {
      navigate(`/rooms/${p.room.id}/overview`);
      return;
    }
    if (mode !== 'arrange' || !view) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      kind: 'room',
      id: p.room.id,
      start: toWorld(view, local(e)),
      origin: { x: p.room.planPlacement!.x, y: p.room.planPlacement!.y },
      moved: false,
    };
  };

  const onBgDown = (e: ReactPointerEvent) => {
    if (!view) return;
    if (mode === 'calibrate' && planMeta) {
      const w = toWorld(view, local(e));
      const imgPx = { x: (w.x - planOrigin.x) * pxPerMm, y: (w.y - planOrigin.y) * pxPerMm };
      setCalPoints((pts) => (pts.length >= 2 ? [imgPx] : [...pts, imgPx]));
      return;
    }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'pan', start: local(e), view };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !view) return;
    if (d.kind === 'pan') {
      const p = local(e);
      setView({ ...d.view, tx: d.view.tx + p.x - d.start.x, ty: d.view.ty + p.y - d.start.y });
    } else if (d.kind === 'room') {
      const w = toWorld(view, local(e));
      d.moved = true;
      setDragPos({ id: d.id, p: { x: Math.round((d.origin.x + w.x - d.start.x) / 50) * 50, y: Math.round((d.origin.y + w.y - d.start.y) / 50) * 50 } });
    }
  };

  const onUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'room' && d.moved && dragPos) {
      const room = rooms.find((r) => r.id === d.id);
      if (room?.planPlacement) await patchRoom(room.id, { planPlacement: { ...room.planPlacement, x: dragPos.p.x, y: dragPos.p.y } });
    }
    setDragPos(null);
  };

  const applyCalibration = async () => {
    if (!floor || calPoints.length !== 2) return;
    const mm = Number(calDistance.replace(',', '.')) * 1000;
    if (!Number.isFinite(mm) || mm <= 0) {
      toast.error('Enter the real distance in metres');
      return;
    }
    const pxDist = Math.hypot(calPoints[1].x - calPoints[0].x, calPoints[1].y - calPoints[0].y);
    if (pxDist < 5) {
      toast.error('Pick two points further apart');
      return;
    }
    await updateFloor(floor.id, { planCalibration: { pxPerMm: pxDist / mm, offsetX: planOrigin.x, offsetY: planOrigin.y } });
    setCalPoints([]);
    setCalDistance('');
    setMode('view');
    setView(null);
    toast.success('Plan scale set', { description: 'The uploaded plan is now drawn at the scale you measured.' });
  };

  const calibrated = !!floor?.planCalibration && !!planRef;

  return (
    <div>
      <PageHeader
        eyebrow="Bait Khuzam"
        title="Floor Plans"
        description="Arrange rooms floor by floor. Click a room to open its workspace."
        actions={
          <Button icon={Plus} onClick={() => setDialog({ floor: null })}>
            Add floor
          </Button>
        }
      />

      {floors.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No floors yet"
          action={
            <>
              {['Ground floor', 'First floor', 'Roof'].map((n) => (
                <Button key={n} icon={Plus} onClick={async () => navigate(`/floor-plans/${(await addFloor(n)).id}`)}>
                  {n}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setDialog({ floor: null })}>
                Other…
              </Button>
            </>
          }
        >
          The project files did not include an architectural floor plan, so floors and their rooms are up to you. Create floors, then place rooms on them.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {floors.map((f) => (
              <Chip key={f.id} active={f.id === floor?.id} onClick={() => navigate(`/floor-plans/${f.id}`)}>
                {f.name} <span className="opacity-60">{rooms.filter((r) => r.floorId === f.id).length}</span>
              </Chip>
            ))}
          </div>

          {floor && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-sm border border-line bg-mist/70 p-0.5">
                    {(
                      [
                        { m: 'view', icon: MousePointer2, label: 'Open rooms' },
                        { m: 'arrange', icon: Hand, label: 'Arrange' },
                      ] as const
                    ).map(({ m, icon: Icon, label }) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          'inline-flex h-7 items-center gap-1.5 rounded-[2px] px-2.5 text-[12.5px]',
                          mode === m ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
                        )}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                  <IconButton
                    icon={Minus}
                    label="Zoom out"
                    onClick={() =>
                      setView(
                        (v) =>
                          v && {
                            ...v,
                            scale: v.scale * 0.8,
                            tx: size.width / 2 - (size.width / 2 - v.tx) * 0.8,
                            ty: size.height / 2 - (size.height / 2 - v.ty) * 0.8,
                          },
                      )
                    }
                  />
                  <IconButton
                    icon={Plus}
                    label="Zoom in"
                    onClick={() =>
                      setView(
                        (v) =>
                          v && {
                            ...v,
                            scale: v.scale * 1.25,
                            tx: size.width / 2 - (size.width / 2 - v.tx) * 1.25,
                            ty: size.height / 2 - (size.height / 2 - v.ty) * 1.25,
                          },
                      )
                    }
                  />
                  <IconButton icon={Maximize2} label="Fit" onClick={fit} />
                  <span className="ml-auto" />
                  <Button size="sm" icon={FileImage} onClick={() => setPlanPicker(true)}>
                    {planRef ? 'Change plan image' : 'Use an architectural plan'}
                  </Button>
                  {planRef && (
                    <Button
                      size="sm"
                      icon={Crosshair}
                      variant={mode === 'calibrate' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setMode(mode === 'calibrate' ? 'view' : 'calibrate');
                        setCalPoints([]);
                      }}
                    >
                      Set scale
                    </Button>
                  )}
                </div>

                <div ref={canvasRef} className="relative h-[clamp(420px,calc(100dvh-320px),760px)] overflow-hidden rounded-md border border-line">
                  <div
                    ref={svgRef}
                    className={cn('h-full w-full touch-none', mode === 'calibrate' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    {view && size.width > 0 && (
                      <svg
                        width={size.width}
                        height={size.height}
                        onPointerDown={onBgDown}
                        style={{ display: 'block', fontFamily: 'Inter Variable, Inter, sans-serif' }}
                      >
                        <rect width={size.width} height={size.height} fill="#fbf9f5" />
                        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
                          {planUrl && planSize && (
                            <image
                              href={planUrl}
                              x={planOrigin.x}
                              y={planOrigin.y}
                              width={planSize.w}
                              height={planSize.h}
                              opacity={floor.planOpacity}
                              preserveAspectRatio="none"
                            />
                          )}
                          {placed.map((p) => {
                            const meta = roomStatusMeta(p.room.status);
                            const active = hover === p.room.id;
                            return (
                              <path
                                key={p.room.id}
                                d={pathFrom(p.outline)}
                                fill={active ? '#f2e6da' : '#ffffff'}
                                fillOpacity={planUrl ? 0.55 : 0.95}
                                stroke={active ? '#8e5b3c' : '#2f2a24'}
                                strokeWidth={active ? 2.5 : 1.5}
                                strokeDasharray={p.known ? undefined : '8 6'}
                                vectorEffect="non-scaling-stroke"
                                style={{ cursor: mode === 'arrange' ? 'move' : 'pointer' }}
                                onPointerDown={(e) => onRoomDown(e, p)}
                                onPointerEnter={() => setHover(p.room.id)}
                                onPointerLeave={() => setHover(null)}
                                aria-label={`${p.room.name} — ${meta.label}`}
                              />
                            );
                          })}
                        </g>
                        {placed.map((p) => {
                          const c = toScreen(view, p.center);
                          const meta = roomStatusMeta(p.room.status);
                          return (
                            <g key={`l-${p.room.id}`} transform={`translate(${c.x} ${c.y})`} pointerEvents="none">
                              <text textAnchor="middle" y={-6} fontSize={13} fill="#26221d" fontWeight={500}>
                                {p.room.name}
                              </text>
                              <text textAnchor="middle" y={10} fontSize={10.5} fill="#877d70">
                                {p.known ? `${dimensionSummary(p.room)} · ${areaSummary(computeRoomShape(p.room))}` : 'Size unknown'}
                              </text>
                              <circle cx={0} cy={24} r={3.5} fill={TONE_HEX[meta.tone]} />
                            </g>
                          );
                        })}
                        {mode === 'calibrate' &&
                          calPoints.map((ip, i) => {
                            const w = { x: planOrigin.x + ip.x / pxPerMm, y: planOrigin.y + ip.y / pxPerMm };
                            const s = toScreen(view, w);
                            return <circle key={i} cx={s.x} cy={s.y} r={6} fill="#8e5b3c" stroke="#fff" strokeWidth={2} />;
                          })}
                      </svg>
                    )}
                  </div>
                  <div className="pointer-events-none absolute left-3 top-3 rounded-sm bg-raised/90 px-2.5 py-1.5 text-[11.5px] font-medium tracking-wide text-ink-2 shadow-sm backdrop-blur">
                    {calibrated ? 'Over your uploaded plan · scale set by you · room outlines placed by hand' : 'Schematic — Not to Scale'}
                  </div>
                  {placed.length === 0 && !planRef && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-ink-3">
                      Place rooms from the panel on the right.
                    </div>
                  )}
                </div>

                {mode === 'calibrate' && (
                  <Callout
                    tone="info"
                    title="Set the plan's scale"
                    action={
                      <>
                        <Input
                          value={calDistance}
                          onChange={(e) => setCalDistance(e.target.value)}
                          placeholder="Real distance in metres, e.g. 6.2"
                          className="!w-[260px]"
                          disabled={calPoints.length !== 2}
                        />
                        <Button size="sm" variant="primary" disabled={calPoints.length !== 2} onClick={applyCalibration}>
                          Apply scale
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setMode('view');
                            setCalPoints([]);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    }
                  >
                    Click two points on the plan whose real distance you know (e.g. the ends of a dimensioned wall). {calPoints.length}/2 points picked.
                  </Callout>
                )}
                {!calibrated && placed.some((p) => p.known) && (
                  <p className="text-[11.5px] text-ink-3">
                    Rooms are drawn from their own dimensions, but their positions are arranged by hand — this is a schematic, not a measured floor plan.
                  </p>
                )}
              </div>

              <aside className="flex flex-col gap-5">
                <div className="rounded-md border border-line bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="display text-[22px]">{floor.name}</h2>
                    <Menu
                      trigger={<IconButton icon={Pencil} label="Floor actions" />}
                      items={[
                        { label: 'Rename', icon: Pencil, onSelect: () => setDialog({ floor }) },
                        ...(planRef
                          ? [{ label: 'Remove plan image', icon: X, onSelect: () => updateFloor(floor.id, { planReferenceId: null, planCalibration: null }) }]
                          : []),
                        'separator' as const,
                        {
                          label: 'Delete floor',
                          icon: Trash2,
                          danger: true,
                          onSelect: async () => {
                            const r = await confirm({
                              title: `Delete ${floor.name}?`,
                              tone: 'danger',
                              confirmLabel: 'Delete floor',
                              description: 'Rooms on this floor are kept and become unassigned.',
                            });
                            if (r.confirmed) {
                              await deleteFloor(floor.id);
                              navigate('/floor-plans');
                            }
                          },
                        },
                      ]}
                    />
                  </div>
                  {planRef && (
                    <Field label={`Plan opacity · ${Math.round(floor.planOpacity * 100)}%`}>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={floor.planOpacity}
                        onChange={(e) => updateFloor(floor.id, { planOpacity: Number(e.target.value) })}
                        className="w-full accent-[#26221d]"
                      />
                    </Field>
                  )}
                  <div className="eyebrow mb-2 mt-4">Rooms on this floor</div>
                  {onFloor.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">None yet.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {onFloor.map((r) => (
                        <li
                          key={r.id}
                          className={cn('flex items-center gap-2 rounded-sm px-1.5 py-1.5', hover === r.id && 'bg-mist')}
                          onMouseEnter={() => setHover(r.id)}
                          onMouseLeave={() => setHover(null)}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[roomStatusMeta(r.status).tone])} />
                          <button
                            type="button"
                            onClick={() => navigate(`/rooms/${r.id}/overview`)}
                            className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-accent"
                          >
                            {r.name}
                          </button>
                          {r.planPlacement ? (
                            <>
                              <IconButton
                                icon={RotateCw}
                                label="Rotate 90°"
                                size="xs"
                                onClick={() => patchRoom(r.id, { planPlacement: { ...r.planPlacement!, rotation: (r.planPlacement!.rotation + 90) % 360 } })}
                              />
                              <IconButton icon={X} label="Remove from plan" size="xs" onClick={() => patchRoom(r.id, { planPlacement: null })} />
                            </>
                          ) : (
                            <Button size="xs" onClick={() => placeRoom(r)}>
                              Place
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {notPlaced.length > 0 && (
                    <p className="mt-2 text-[11.5px] text-ink-3">{notPlaced.length} room(s) on this floor are not placed on the plan yet.</p>
                  )}
                </div>

                {(unassigned.length > 0 || elsewhere.length > 0) && (
                  <div className="rounded-md border border-line bg-surface p-4">
                    <div className="eyebrow mb-2">Add rooms to {floor.name}</div>
                    <ul className="flex flex-col">
                      {[...unassigned, ...elsewhere].map((r) => (
                        <li key={r.id} className="flex items-center gap-2 py-1">
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {r.name}
                            {r.floorId && <span className="ml-1 text-[11px] text-ink-4">({floors.find((f) => f.id === r.floorId)?.name})</span>}
                          </span>
                          <Button size="xs" icon={Plus} onClick={() => placeRoom(r)}>
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11.5px] leading-relaxed text-ink-3">
                  Rooms with unknown dimensions appear as dashed placeholder squares. Switch to <strong>Arrange</strong> to drag rooms into position.
                </p>
              </aside>
            </div>
          )}
        </>
      )}

      <FloorDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} floor={dialog?.floor} />
      {floor && (
        <ReferencePicker
          open={planPicker}
          onOpenChange={setPlanPicker}
          single
          title={`Architectural plan for ${floor.name}`}
          confirmLabel="Use this plan"
          uploadDefaults={{ kind: 'plan', title: `${floor.name} plan` }}
          onPick={async (ids) => {
            await updateFloor(floor.id, { planReferenceId: ids[0] ?? null, planCalibration: null });
            setView(null);
            toast.success('Plan image added', { description: 'Use “Set scale” to calibrate it against a known distance.' });
          }}
        />
      )}
    </div>
  );
}
