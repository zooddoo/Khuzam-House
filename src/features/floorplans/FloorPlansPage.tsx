import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Crosshair, FileImage, Hand, Layers, Maximize2, Minus, MousePointer2, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Floor, Room } from '@/lib/types';
import { computeRoomShape, dimensionSummary, areaSummary } from '@/lib/geometry/room';
import { add, bbox, rectCorners, type Point } from '@/lib/geometry/polygon';
import { roomStatusMeta, TONE_DOT, TONE_HEX } from '@/lib/labels';
import { floorDisplayName, roomDisplayName } from '@/lib/names';
import { useI18n } from '@/i18n';
import { num } from '@/i18n/format';
import { toAsciiDigits } from '@/i18n/arabic';
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

const FLOOR_PRESETS = ['Ground floor', 'First floor', 'Second floor', 'Roof', 'Basement', 'Outdoor'] as const;

function FloorDialog({ open, onOpenChange, floor }: { open: boolean; onOpenChange: (o: boolean) => void; floor?: Floor | null }) {
  const { t, lang } = useI18n();
  const F = t.floors;
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (open) {
      setName(floor?.name ?? '');
      setNameAr(floor?.nameAr ?? '');
    }
  }, [open, floor]);
  const save = async (en = name, ar = nameAr) => {
    if (!en.trim() && !ar.trim()) return;
    const english = en.trim() || ar.trim();
    if (floor) await updateFloor(floor.id, { name: english, nameAr: ar.trim() });
    else {
      const f = await addFloor(english, ar.trim());
      navigate(`/floor-plans/${f.id}`);
    }
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={floor ? F.rename : F.addTitle}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={!name.trim() && !nameAr.trim()}>
            {floor ? t.common.save : F.add}
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
        <Field label={t.common.nameAr}>
          <Input autoFocus={lang === 'ar'} value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={F.placeholderAr} dir="rtl" lang="ar" />
        </Field>
        <Field label={t.common.nameEn} hint={t.common.nameEnHint}>
          <Input autoFocus={lang === 'en'} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ground floor" dir="ltr" lang="en" />
        </Field>
        {!floor && (
          <div className="flex flex-wrap gap-1.5">
            {FLOOR_PRESETS.map((n) => (
              <Chip key={n} onClick={() => save(n, F.preset[n])}>
                {lang === 'ar' ? F.preset[n] : n}
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
  const { t, lang } = useI18n();
  const F = t.floors;
  const pointers = useRef(new Map<number, Point>());
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
    | { kind: 'pan'; start: Point; view: PlanView; tapRoom?: string; moved?: boolean }
    | { kind: 'pinch'; dist: number; mid: Point; view: PlanView }
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

  const onDownCapture = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2 && view) {
      const [a, b] = Array.from(pointers.current.values());
      drag.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      setDragPos(null);
    }
  };

  const onRoomDown = (e: ReactPointerEvent, p: Placed) => {
    e.stopPropagation();
    if (pointers.current.size > 1 || !view) return;
    if (mode === 'view') {
      // Open the room on tap; a drag pans the plan instead.
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      drag.current = { kind: 'pan', start: local(e), view, tapRoom: p.room.id, moved: false };
      return;
    }
    if (mode !== 'arrange') return;
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
    if (!view || pointers.current.size > 1) return;
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
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
    const d = drag.current;
    if (!d || !view) return;
    if (d.kind === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = Math.min(1, Math.max(0.002, d.view.scale * (dist / d.dist)));
      const k = scale / d.view.scale;
      setView({ scale, tx: mid.x - (d.mid.x - d.view.tx) * k, ty: mid.y - (d.mid.y - d.view.ty) * k });
    } else if (d.kind === 'pan') {
      const p = local(e);
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 8) d.moved = true;
      if (d.tapRoom && !d.moved) return;
      setView({ ...d.view, tx: d.view.tx + p.x - d.start.x, ty: d.view.ty + p.y - d.start.y });
    } else if (d.kind === 'room') {
      const w = toWorld(view, local(e));
      d.moved = true;
      setDragPos({ id: d.id, p: { x: Math.round((d.origin.x + w.x - d.start.x) / 50) * 50, y: Math.round((d.origin.y + w.y - d.start.y) / 50) * 50 } });
    }
  };

  const onUp = async (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'pinch') {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    drag.current = null;
    if (d?.kind === 'pan' && d.tapRoom && !d.moved && e.type === 'pointerup') {
      navigate(`/rooms/${d.tapRoom}/overview`);
      return;
    }
    if (d?.kind === 'room' && d.moved && dragPos) {
      const room = rooms.find((r) => r.id === d.id);
      if (room?.planPlacement) await patchRoom(room.id, { planPlacement: { ...room.planPlacement, x: dragPos.p.x, y: dragPos.p.y } });
    }
    setDragPos(null);
  };

  const applyCalibration = async () => {
    if (!floor || calPoints.length !== 2) return;
    const mm = Number(toAsciiDigits(calDistance).replace(/[,٫]/, '.')) * 1000;
    if (!Number.isFinite(mm) || mm <= 0) {
      toast.error(F.calDistanceError);
      return;
    }
    const pxDist = Math.hypot(calPoints[1].x - calPoints[0].x, calPoints[1].y - calPoints[0].y);
    if (pxDist < 5) {
      toast.error(F.calTooClose);
      return;
    }
    await updateFloor(floor.id, { planCalibration: { pxPerMm: pxDist / mm, offsetX: planOrigin.x, offsetY: planOrigin.y } });
    setCalPoints([]);
    setCalDistance('');
    setMode('view');
    setView(null);
    toast.success(F.calSet, { description: F.calSetHint });
  };

  const calibrated = !!floor?.planCalibration && !!planRef;

  return (
    <div>
      <PageHeader
        eyebrow={t.app.name}
        title={F.title}
        description={F.lead}
        actions={
          <Button icon={Plus} onClick={() => setDialog({ floor: null })}>
            {F.add}
          </Button>
        }
      />

      {floors.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={F.emptyTitle}
          action={
            <>
              {(['Ground floor', 'First floor', 'Roof'] as const).map((n) => (
                <Button key={n} icon={Plus} onClick={async () => navigate(`/floor-plans/${(await addFloor(n, F.preset[n])).id}`)}>
                  {lang === 'ar' ? F.preset[n] : n}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setDialog({ floor: null })}>
                {F.other}
              </Button>
            </>
          }
        >
          {F.emptyBody}
        </EmptyState>
      ) : (
        <>
          <div className="scroll-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {floors.map((f) => (
              <Chip key={f.id} active={f.id === floor?.id} onClick={() => navigate(`/floor-plans/${f.id}`)} className="shrink-0">
                {floorDisplayName(f)} <span className="opacity-60">{num(rooms.filter((r) => r.floorId === f.id).length)}</span>
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
                        { m: 'view', icon: MousePointer2, label: F.modeOpen },
                        { m: 'arrange', icon: Hand, label: F.modeArrange },
                      ] as const
                    ).map(({ m, icon: Icon, label }) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-[2px] px-2.5 text-[12.5px] sm:h-7',
                          mode === m ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
                        )}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                  <IconButton
                    icon={Minus}
                    label={t.common.zoomOut}
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
                    label={t.common.zoomIn}
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
                  <IconButton icon={Maximize2} label={t.common.fit} onClick={fit} />
                  <span className="ms-auto" />
                  <Button size="sm" icon={FileImage} onClick={() => setPlanPicker(true)}>
                    {planRef ? F.changePlan : F.usePlan}
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
                      {F.setScale}
                    </Button>
                  )}
                </div>

                <div ref={canvasRef} className="relative h-[clamp(340px,calc(100dvh-280px),760px)] overflow-hidden rounded-md border border-line">
                  <div
                    ref={svgRef}
                    className={cn('h-full w-full touch-none', mode === 'calibrate' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
                    onPointerDownCapture={onDownCapture}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    {view && size.width > 0 && (
                      <svg
                        width={size.width}
                        height={size.height}
                        onPointerDown={onBgDown}
                        direction="ltr"
                        style={{
                          display: 'block',
                          direction: 'ltr',
                          fontFamily: lang === 'ar' ? 'IBM Plex Sans Arabic, Inter Variable, Inter, sans-serif' : 'Inter Variable, Inter, sans-serif',
                        }}
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
                                aria-label={`${roomDisplayName(p.room)} — ${meta.label}`}
                              />
                            );
                          })}
                        </g>
                        {placed.map((p) => {
                          const c = toScreen(view, p.center);
                          const meta = roomStatusMeta(p.room.status);
                          return (
                            <g key={`l-${p.room.id}`} transform={`translate(${c.x} ${c.y})`} pointerEvents="none">
                              <text textAnchor="middle" y={-6} fontSize={13} fill="#26221d" fontWeight={500} direction={lang === 'ar' ? 'rtl' : 'ltr'}>
                                {roomDisplayName(p.room)}
                              </text>
                              <text textAnchor="middle" y={10} fontSize={10.5} fill="#877d70" direction={lang === 'ar' ? 'rtl' : 'ltr'}>
                                {p.known ? `${dimensionSummary(p.room)} · ${areaSummary(computeRoomShape(p.room))}` : F.sizeUnknown}
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
                  <div className="pointer-events-none absolute start-3 top-3 max-w-[calc(100%-1.5rem)] rounded-sm bg-raised/90 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-2 shadow-sm backdrop-blur">
                    {calibrated ? F.badgeCalibrated : F.badgeSchematic}
                  </div>
                  {placed.length === 0 && !planRef && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-ink-3">{F.placeHint}</div>
                  )}
                </div>

                {mode === 'calibrate' && (
                  <Callout
                    tone="info"
                    title={F.calTitle}
                    action={
                      <>
                        <Input
                          value={calDistance}
                          onChange={(e) => setCalDistance(e.target.value)}
                          placeholder={F.calPlaceholder}
                          className="!w-full sm:!w-[260px]"
                          inputMode="decimal"
                          dir="ltr"
                          disabled={calPoints.length !== 2}
                        />
                        <Button size="sm" variant="primary" disabled={calPoints.length !== 2} onClick={applyCalibration}>
                          {F.calApply}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setMode('view');
                            setCalPoints([]);
                          }}
                        >
                          {t.common.cancel}
                        </Button>
                      </>
                    }
                  >
                    {F.calBody(calPoints.length)}
                  </Callout>
                )}
                {!calibrated && placed.some((p) => p.known) && (
                  <p className="text-[11.5px] text-ink-3">{F.schematicNote}</p>
                )}
              </div>

              <aside className="flex flex-col gap-5">
                <div className="rounded-md border border-line bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="display text-[22px]">{floorDisplayName(floor)}</h2>
                    <Menu
                      trigger={<IconButton icon={Pencil} label={F.actions} />}
                      items={[
                        { label: t.common.rename, icon: Pencil, onSelect: () => setDialog({ floor }) },
                        ...(planRef
                          ? [{ label: F.removePlan, icon: X, onSelect: () => updateFloor(floor.id, { planReferenceId: null, planCalibration: null }) }]
                          : []),
                        'separator' as const,
                        {
                          label: F.delete,
                          icon: Trash2,
                          danger: true,
                          onSelect: async () => {
                            const r = await confirm({
                              title: F.deleteTitle(floorDisplayName(floor)),
                              tone: 'danger',
                              confirmLabel: t.refs.deleteConfirm,
                              description: F.deleteBody,
                            });
                            if (r.confirmed) {
                              await deleteFloor(floor.id);
                              toast.success(F.deleted, { description: t.trash.moveHint });
                              navigate('/floor-plans');
                            }
                          },
                        },
                      ]}
                    />
                  </div>
                  {planRef && (
                    <Field label={F.opacity(Math.round(floor.planOpacity * 100))}>
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
                  <div className="eyebrow mb-2 mt-4">{F.roomsOnFloor}</div>
                  {onFloor.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">{F.noneYet}</p>
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
                            className="min-h-9 min-w-0 flex-1 truncate text-start text-[13px] hover:text-accent"
                          >
                            {roomDisplayName(r)}
                          </button>
                          {r.planPlacement ? (
                            <>
                              <IconButton
                                icon={RotateCw}
                                label={F.rotate90}
                                size="sm"
                                onClick={() => patchRoom(r.id, { planPlacement: { ...r.planPlacement!, rotation: (r.planPlacement!.rotation + 90) % 360 } })}
                              />
                              <IconButton icon={X} label={F.removeFromPlan} size="sm" onClick={() => patchRoom(r.id, { planPlacement: null })} />
                            </>
                          ) : (
                            <Button size="sm" onClick={() => placeRoom(r)}>
                              {F.place}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {notPlaced.length > 0 && (
                    <p className="mt-2 text-[11.5px] text-ink-3">{F.notPlaced(notPlaced.length)}</p>
                  )}
                </div>

                {(unassigned.length > 0 || elsewhere.length > 0) && (
                  <div className="rounded-md border border-line bg-surface p-4">
                    <div className="eyebrow mb-2">{F.addRoomsTo(floorDisplayName(floor))}</div>
                    <ul className="flex flex-col">
                      {[...unassigned, ...elsewhere].map((r) => (
                        <li key={r.id} className="flex items-center gap-2 py-1">
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {roomDisplayName(r)}
                            {r.floorId && <span className="ms-1 text-[11px] text-ink-4">({floorDisplayName(floors.find((f) => f.id === r.floorId))})</span>}
                          </span>
                          <Button size="sm" icon={Plus} onClick={() => placeRoom(r)}>
                            {t.common.add}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11.5px] leading-relaxed text-ink-3">{F.footnote}</p>
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
          title={F.planFor(floorDisplayName(floor))}
          confirmLabel={F.useThisPlan}
          imagesOnly
          uploadDefaults={{ kind: 'plan', title: `${floor.name} plan` }}
          onPick={async (ids) => {
            await updateFloor(floor.id, { planReferenceId: ids[0] ?? null, planCalibration: null });
            setView(null);
            toast.success(F.planAdded, { description: F.planAddedHint });
          }}
        />
      )}
    </div>
  );
}
