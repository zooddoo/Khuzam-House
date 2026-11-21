import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { ArchElement, FurnitureItem, LengthUnit, Room } from '@/lib/types';
import { elementSpan, findSegment, type RoomShapeResult, type WallSegment } from '@/lib/geometry/room';
import { add, offsetPolygon, scale as vscale, type Point } from '@/lib/geometry/polygon';
import { furniturePolygon } from '@/lib/layout/validate';
import { formatLength, formatSize } from '@/lib/units';
import type { Lang } from '@/i18n/prefs';
import { getPrefs } from '@/i18n/prefs';
import { msgs } from '@/i18n/messages';
import { wallTitle } from '@/lib/geometry/names';
import { furnitureNameLabel } from '@/lib/labels';
import { niceScaleBar, PLAN_COLORS as C, pathFrom, toScreen, uprightAngle, WALL_T, type PlanView } from './planMath';

export type HandleKind = 'move' | 'rotate' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface PlanSvgProps {
  room: Room;
  shape: RoomShapeResult;
  items: FurnitureItem[];
  unit: LengthUnit;
  view: PlanView;
  width: number;
  height: number;
  selectedId?: string | null;
  selectedElementId?: string | null;
  warnItemIds?: Set<string>;
  highlightWallId?: string | null;
  showGrid?: boolean;
  showDims?: boolean;
  showFurniture?: boolean;
  showLabels?: boolean;
  showCompass?: boolean;
  showScale?: boolean;
  minimal?: boolean;
  onItemPointerDown?: (e: ReactPointerEvent, item: FurnitureItem, handle: HandleKind) => void;
  onElementPointerDown?: (e: ReactPointerEvent, el: ArchElement) => void;
  onWallPointerDown?: (e: ReactPointerEvent, seg: WallSegment) => void;
  onBackgroundPointerDown?: (e: ReactPointerEvent) => void;
  overlay?: ReactNode;
  idPrefix?: string;
  /** Label language. Images sent to AI models use English. */
  lang?: Lang;
}

function Grid({ view, width, height, gridMm }: { view: PlanView; width: number; height: number; gridMm: number }) {
  const lines: ReactNode[] = [];
  const step = gridMm * view.scale >= 7 ? gridMm : gridMm * 5 * view.scale >= 7 ? gridMm * 5 : 1000;
  const x0 = Math.floor(-view.tx / view.scale / step) * step;
  const y0 = Math.floor(-view.ty / view.scale / step) * step;
  const x1 = (width - view.tx) / view.scale;
  const y1 = (height - view.ty) / view.scale;
  let n = 0;
  for (let x = x0; x <= x1 && n < 600; x += step, n++) {
    const sx = view.tx + x * view.scale;
    const major = Math.round(x) % 1000 === 0;
    lines.push(<line key={`x${x}`} x1={sx} y1={0} x2={sx} y2={height} stroke={major ? C.gridMajor : C.grid} strokeWidth={1} />);
  }
  n = 0;
  for (let y = y0; y <= y1 && n < 600; y += step, n++) {
    const sy = view.ty + y * view.scale;
    const major = Math.round(y) % 1000 === 0;
    lines.push(<line key={`y${y}`} x1={0} y1={sy} x2={width} y2={sy} stroke={major ? C.gridMajor : C.grid} strokeWidth={1} />);
  }
  return <g shapeRendering="crispEdges">{lines}</g>;
}

function outward(seg: WallSegment): Point {
  return { x: -seg.inward.x, y: -seg.inward.y };
}

/** Draw one architectural element in world coordinates (inside a scaled group). */
function ElementShape({
  el,
  shape,
  selected,
  onPointerDown,
}: {
  el: ArchElement;
  shape: RoomShapeResult;
  selected: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const dash = el.status === 'estimated' ? '6 4' : el.status === 'unknown' ? '2 3' : undefined;
  const sw = selected ? 2.4 : 1.4;
  const common = { vectorEffect: 'non-scaling-stroke' as const, onPointerDown, style: { cursor: onPointerDown ? 'pointer' : undefined } };

  if (el.placement === 'free') {
    if (el.x === null || el.y === null) return null;
    const w = el.width ?? 300;
    const d = el.depth ?? el.width ?? 300;
    const pts = [
      { x: -w / 2, y: -d / 2 },
      { x: w / 2, y: -d / 2 },
      { x: w / 2, y: d / 2 },
      { x: -w / 2, y: d / 2 },
    ];
    const r = (el.rotation * Math.PI) / 180;
    const world = pts.map((p) => ({ x: el.x! + p.x * Math.cos(r) - p.y * Math.sin(r), y: el.y! + p.x * Math.sin(r) + p.y * Math.cos(r) }));
    if (el.type === 'beam')
      return <path d={pathFrom(world)} fill="none" stroke={selected ? C.selected : C.column} strokeWidth={sw} strokeDasharray="10 5" {...common} />;
    if (el.type === 'electrical')
      return <circle cx={el.x} cy={el.y} r={90} fill={C.floor} stroke={C.electrical} strokeWidth={sw} strokeDasharray={dash} {...common} />;
    return (
      <path
        d={pathFrom(world)}
        fill={el.type === 'column' ? C.column : C.acFill}
        fillOpacity={el.type === 'column' ? 0.85 : 1}
        stroke={selected ? C.selected : C.column}
        strokeWidth={sw}
        strokeDasharray={dash}
        {...common}
      />
    );
  }

  const seg = findSegment(shape, el.wallId);
  const span = elementSpan(seg, el);
  if (!seg || !span) return null;
  const out = outward(seg);
  const inn = seg.inward;
  const width = el.width ?? 0;
  const bandOuter = (p: Point) => add(p, vscale(out, WALL_T + 2));
  const bandInner = (p: Point) => add(p, vscale(inn, 2));

  switch (el.type) {
    case 'door': {
      if (width <= 0) return <circle cx={span.a.x} cy={span.a.y} r={80} fill={C.warn} {...common} />;
      const opening = [bandInner(span.a), bandInner(span.b), bandOuter(span.b), bandOuter(span.a)];
      const swing = el.door?.swing ?? 'in';
      const isDouble = /double/i.test(el.subtype);
      const dir = swing === 'out' ? out : inn;
      const leaves: ReactNode[] = [];
      const leaf = (hinge: Point, latch: Point, r: number, key: string) => {
        const tip = add(hinge, vscale(dir, r));
        const large = 0;
        const v1 = { x: latch.x - hinge.x, y: latch.y - hinge.y };
        const v2 = { x: tip.x - hinge.x, y: tip.y - hinge.y };
        const sweep = v1.x * v2.y - v1.y * v2.x > 0 ? 1 : 0;
        leaves.push(
          <g key={key}>
            <line
              x1={hinge.x}
              y1={hinge.y}
              x2={tip.x}
              y2={tip.y}
              stroke={selected ? C.selected : C.door}
              strokeWidth={sw + 0.6}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={dash}
            />
            <path
              d={`M ${latch.x} ${latch.y} A ${r} ${r} 0 ${large} ${sweep} ${tip.x} ${tip.y}`}
              fill="none"
              stroke={selected ? C.selected : C.door}
              strokeWidth={1}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          </g>,
        );
      };
      if (swing === 'in' || swing === 'out') {
        if (isDouble) {
          const mid = add(span.a, vscale(seg.dir, width / 2));
          leaf(span.a, mid, width / 2, 'l');
          leaf(span.b, mid, width / 2, 'r');
        } else if (el.door?.hinge === 'right') leaf(span.b, span.a, width, 'r');
        else leaf(span.a, span.b, width, 'l');
      } else if (swing === 'sliding') {
        const o1 = vscale(out, WALL_T * 0.35);
        const o2 = vscale(out, WALL_T * 0.65);
        const mid = add(span.a, vscale(seg.dir, width / 2));
        leaves.push(
          <g key="s">
            <line
              x1={add(span.a, o1).x}
              y1={add(span.a, o1).y}
              x2={add(add(mid, o1), vscale(seg.dir, 60)).x}
              y2={add(add(mid, o1), vscale(seg.dir, 60)).y}
              stroke={C.door}
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={add(add(mid, o2), vscale(seg.dir, -60)).x}
              y1={add(add(mid, o2), vscale(seg.dir, -60)).y}
              x2={add(span.b, o2).x}
              y2={add(span.b, o2).y}
              stroke={C.door}
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
            />
          </g>,
        );
      }
      return (
        <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? 'pointer' : undefined }}>
          <path d={pathFrom(opening)} fill={C.floor} stroke="none" />
          {leaves}
          {selected && <path d={pathFrom(opening)} fill="none" stroke={C.selected} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        </g>
      );
    }
    case 'window': {
      if (width <= 0) return <circle cx={span.a.x} cy={span.a.y} r={80} fill={C.window} {...common} />;
      const opening = [bandInner(span.a), bandInner(span.b), bandOuter(span.b), bandOuter(span.a)];
      const g1a = add(span.a, vscale(out, WALL_T * 0.38));
      const g1b = add(span.b, vscale(out, WALL_T * 0.38));
      const g2a = add(span.a, vscale(out, WALL_T * 0.62));
      const g2b = add(span.b, vscale(out, WALL_T * 0.62));
      return (
        <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? 'pointer' : undefined }}>
          <path
            d={pathFrom(opening)}
            fill={C.windowFill}
            stroke={selected ? C.selected : C.window}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={dash}
          />
          <line x1={g1a.x} y1={g1a.y} x2={g1b.x} y2={g1b.y} stroke={C.window} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={g2a.x} y1={g2a.y} x2={g2b.x} y2={g2b.y} stroke={C.window} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      );
    }
    case 'recess': {
      const depth = el.depth ?? 200;
      const pts = [span.a, span.b, add(span.b, vscale(out, Math.min(depth, WALL_T + 400))), add(span.a, vscale(out, Math.min(depth, WALL_T + 400)))];
      return <path d={pathFrom(pts)} fill={C.floor} stroke={selected ? C.selected : C.column} strokeWidth={sw} strokeDasharray={dash ?? '4 3'} {...common} />;
    }
    case 'electrical': {
      const at = width > 0 ? add(span.a, vscale(seg.dir, width / 2)) : span.a;
      const c = add(at, vscale(inn, 110));
      return (
        <circle cx={c.x} cy={c.y} r={70} fill={C.floor} stroke={selected ? C.selected : C.electrical} strokeWidth={sw} strokeDasharray={dash} {...common} />
      );
    }
    default: {
      const depth = el.depth ?? (el.type === 'ac' ? 250 : el.type === 'column' || el.type === 'projection' ? 300 : 120);
      const pts = [span.a, span.b, add(span.b, vscale(inn, depth)), add(span.a, vscale(inn, depth))];
      const fill =
        el.type === 'ac' ? C.acFill : el.type === 'column' ? C.column : el.type === 'projection' ? '#e3d9ca' : el.type === 'beam' ? 'none' : '#eee8df';
      const stroke = el.type === 'ac' ? C.ac : C.column;
      return (
        <path
          d={pathFrom(pts)}
          fill={fill}
          fillOpacity={el.type === 'column' ? 0.85 : 1}
          stroke={selected ? C.selected : stroke}
          strokeWidth={sw}
          strokeDasharray={el.type === 'beam' ? '10 5' : dash}
          {...common}
        />
      );
    }
  }
}

function elementLabelPoint(el: ArchElement, shape: RoomShapeResult): Point | null {
  if (el.placement === 'free') return el.x !== null && el.y !== null ? { x: el.x, y: el.y } : null;
  const seg = findSegment(shape, el.wallId);
  const span = elementSpan(seg, el);
  if (!seg || !span) return null;
  const mid = add(span.a, vscale(seg.dir, (el.width ?? 0) / 2));
  const depth = el.type === 'door' ? Math.min(450, (el.width ?? 800) * 0.45) : el.type === 'window' ? 260 : (el.depth ?? 250) / 2 + 160;
  return add(mid, vscale(el.type === 'window' ? seg.inward : seg.inward, depth));
}


export function PlanSvg(props: PlanSvgProps) {
  const {
    room,
    shape,
    items,
    unit,
    view,
    width,
    height,
    selectedId,
    selectedElementId,
    warnItemIds,
    highlightWallId,
    showGrid = true,
    showDims = true,
    showFurniture = true,
    showLabels = true,
    showCompass = true,
    showScale = true,
    minimal,
    onItemPointerDown,
    onElementPointerDown,
    onWallPointerDown,
    onBackgroundPointerDown,
    overlay,
    lang = getPrefs().lang,
  } = props;
  const L = msgs(lang).plan;
  const fmtOpts = { lang };
  const s = view.scale;
  const verts = shape.vertices;
  const closed = shape.closureGapMm === null || shape.closureGapMm < 20;
  const outer = shape.drawable && closed ? offsetPolygon(verts, WALL_T) : [];
  const wallPath = shape.drawable && closed ? `${pathFrom(outer)} ${pathFrom(verts)}` : '';
  const fontPx = minimal ? 10 : 11.5;
  const bar = niceScaleBar(s, lang);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      direction="ltr"
      style={{
        display: 'block',
        direction: 'ltr',
        fontFamily: lang === 'ar' ? 'IBM Plex Sans Arabic, Inter Variable, Inter, system-ui, sans-serif' : 'Inter Variable, Inter, system-ui, sans-serif',
        userSelect: 'none',
      }}
      onPointerDown={onBackgroundPointerDown}
    >
      <rect x={0} y={0} width={width} height={height} fill={C.paper} />
      {showGrid && <Grid view={view} width={width} height={height} gridMm={room.layout.gridMm || 100} />}

      <g transform={`translate(${view.tx} ${view.ty}) scale(${s})`}>
        {shape.drawable && (
          <>
            <path d={pathFrom(verts)} fill={C.floor} />
            {closed ? (
              <path d={wallPath} fill={C.wall} fillRule="evenodd" />
            ) : (
              <>
                <path
                  d={
                    pathFrom(verts, false) +
                    ` L ${shape.segments[shape.segments.length - 1]?.end?.x ?? 0} ${shape.segments[shape.segments.length - 1]?.end?.y ?? 0}`
                  }
                  fill="none"
                  stroke={C.wall}
                  strokeWidth={WALL_T}
                  strokeLinejoin="miter"
                />
                {shape.segments.length > 0 && shape.segments[0].start && shape.segments[shape.segments.length - 1].end && (
                  <line
                    x1={shape.segments[shape.segments.length - 1].end!.x}
                    y1={shape.segments[shape.segments.length - 1].end!.y}
                    x2={shape.segments[0].start!.x}
                    y2={shape.segments[0].start!.y}
                    stroke={C.warn}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </>
            )}
            {highlightWallId &&
              shape.segments
                .filter((sg) => sg.id === highlightWallId && sg.start && sg.end)
                .map((sg) => (
                  <line
                    key={sg.id}
                    x1={sg.start!.x}
                    y1={sg.start!.y}
                    x2={sg.end!.x}
                    y2={sg.end!.y}
                    stroke="#b07a55"
                    strokeWidth={6}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            {onWallPointerDown &&
              shape.segments
                .filter((sg) => sg.start && sg.end)
                .map((sg) => (
                  <line
                    key={`hit-${sg.id}`}
                    x1={sg.start!.x}
                    y1={sg.start!.y}
                    x2={sg.end!.x}
                    y2={sg.end!.y}
                    stroke="transparent"
                    strokeWidth={WALL_T * 2}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => onWallPointerDown(e, sg)}
                  />
                ))}
            {room.elements.map((el) => (
              <ElementShape
                key={el.id}
                el={el}
                shape={shape}
                selected={el.id === selectedElementId}
                onPointerDown={onElementPointerDown ? (e) => onElementPointerDown(e, el) : undefined}
              />
            ))}
            {showFurniture &&
              items.map((it) => {
                const poly = furniturePolygon(it);
                const selected = it.id === selectedId;
                const warn = warnItemIds?.has(it.id);
                const isRug = it.layer === 'floor';
                return (
                  <path
                    key={it.id}
                    d={pathFrom(poly)}
                    fill={isRug ? '#f6f1ea' : it.color || C.furniture}
                    fillOpacity={isRug ? 0.7 : 0.92}
                    stroke={warn ? C.warn : selected ? C.selected : isRug ? C.rug : C.furnitureStroke}
                    strokeWidth={selected ? 2 : 1.2}
                    strokeDasharray={isRug ? '4 3' : warn ? '5 3' : it.dimsStatus === 'estimated' ? undefined : undefined}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: onItemPointerDown ? (it.locked ? 'not-allowed' : 'move') : undefined }}
                    onPointerDown={onItemPointerDown ? (e) => onItemPointerDown(e, it, 'move') : undefined}
                  />
                );
              })}
          </>
        )}
      </g>

      {/* Screen-space labels */}
      {shape.drawable &&
        showDims &&
        shape.segments.map((sg) => {
          if (!sg.start || !sg.end) return null;
          const out = outward(sg);
          const off = WALL_T + 380;
          const a = toScreen(view, add(sg.start, vscale(out, off)));
          const b = toScreen(view, add(sg.end, vscale(out, off)));
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
          const angle = uprightAngle(sg.heading);
          const tick = (p: Point) => {
            const t1 = toScreen(view, add(p, vscale(out, off - 120)));
            const t2 = toScreen(view, add(p, vscale(out, off + 120)));
            return <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={C.dim} strokeWidth={1} />;
          };
          const text = `${sg.length.certainty === 'estimated' ? '≈ ' : ''}${formatLength(sg.length.mm, unit, fmtOpts)}`;
          return (
            <g key={`dim-${sg.id}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.dim} strokeWidth={1} />
              {tick(sg.start)}
              {tick(sg.end)}
              {lenPx > 34 && (
                <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}>
                  <rect x={-text.length * 3.4 - 5} y={-8} width={text.length * 6.8 + 10} height={16} fill={C.paper} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={fontPx} fill={C.dimText} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {text}
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {shape.drawable &&
        showLabels &&
        shape.segments.map((sg) => {
          if (!sg.start || !sg.end) return null;
          const midW = { x: (sg.start.x + sg.end.x) / 2, y: (sg.start.y + sg.end.y) / 2 };
          const p = toScreen(view, add(midW, vscale(sg.inward, 260)));
          const lenPx = (sg.length.mm ?? 0) * s;
          if (lenPx < 60) return null;
          return (
            <g key={`lbl-${sg.id}`} transform={`translate(${p.x} ${p.y}) rotate(${uprightAngle(sg.heading)})`}>
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={lang === 'ar' ? 11 : 9.5}
                letterSpacing={lang === 'ar' ? 0 : 1.4}
                fill={C.label}
                direction={lang === 'ar' ? 'rtl' : 'ltr'}
              >
                {lang === 'ar' ? wallTitle(sg, lang) : wallTitle(sg, lang).toUpperCase()}
              </text>
            </g>
          );
        })}

      {shape.drawable &&
        showLabels &&
        room.elements.map((el) => {
          const short = L.elementShort[el.type] ?? '';
          const lp = elementLabelPoint(el, shape);
          if (!lp || (!short && el.status === 'confirmed')) return null;
          const p = toScreen(view, lp);
          const label = `${short}${el.status === 'estimated' ? ' ≈' : el.status === 'unknown' ? ' ?' : ''}`.trim();
          if (!label) return null;
          return (
            <text
              key={`el-${el.id}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9.5}
              fontWeight={600}
              fill={el.type === 'ac' ? C.ac : C.column}
              pointerEvents="none"
            >
              {label}
            </text>
          );
        })}

      {shape.drawable &&
        showFurniture &&
        showLabels &&
        items.map((it) => {
          const c = toScreen(view, { x: it.x, y: it.y });
          // Label runs along the item's width axis, kept upright.
          const along = it.width * s;
          const across = it.depth * s;
          if (along < 46 || across < 18) return null;
          const showSize = across >= 34 && !minimal;
          return (
            <g key={`fl-${it.id}`} transform={`translate(${c.x} ${c.y}) rotate(${uprightAngle(it.rotation)})`} pointerEvents="none">
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y={showSize ? -6 : 0}
                fontSize={Math.min(12, Math.max(9.5, along / 12))}
                fill={C.furnitureText}
                fontWeight={500}
              >
                {truncateLabel(furnitureNameLabel(it.name, lang), Math.floor(along / 7))}
              </text>
              {showSize && (
                <text textAnchor="middle" dominantBaseline="central" y={8} fontSize={9.5} fill={C.dim} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatSize(it.width, it.depth, unit === 'm' ? 'cm' : unit, lang)}
                  {it.dimsStatus === 'estimated' ? ' ≈' : ''}
                </text>
              )}
            </g>
          );
        })}

      {showCompass && (
        <g transform={`translate(${width - 34} 36)`} pointerEvents="none">
          <circle r={15} fill={C.paper} stroke={C.gridMajor} />
          <path d="M 0 -10 L 5 6 L 0 3 L -5 6 Z" fill={C.wall} />
          <text y={-19} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.dimText}>
            {L.north}
          </text>
        </g>
      )}
      {showScale && (
        <g transform={`translate(18 ${height - 22})`} pointerEvents="none">
          <rect x={0} y={-3} width={bar.px} height={6} fill="none" stroke={C.dimText} />
          <rect x={0} y={-3} width={bar.px / 2} height={6} fill={C.dimText} />
          <text x={bar.px + 8} y={0} dominantBaseline="central" fontSize={10.5} fill={C.dimText}>
            {bar.label}
          </text>
        </g>
      )}
      {overlay}
    </svg>
  );
}

function truncateLabel(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, Math.max(3, max - 1))}…` : name;
}
