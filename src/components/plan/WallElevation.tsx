import { useMemo } from 'react';
import type { Room } from '@/lib/types';
import { effectiveWallHeight, type WallSegment } from '@/lib/geometry/room';
import { dot, segmentDistance, sub } from '@/lib/geometry/polygon';
import { furniturePolygon } from '@/lib/layout/validate';
import { formatLength } from '@/lib/units';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { PLAN_COLORS as C } from './planMath';

const NOMINAL_H = 2800;

/** Front elevation of one wall, seen from inside the room (wall start on the left). */
export function WallElevation({
  room,
  seg,
  height = 300,
  selectedElementId,
  onElementClick,
}: {
  room: Room;
  seg: WallSegment;
  height?: number;
  selectedElementId?: string | null;
  onElementClick?: (id: string) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const wallH = effectiveWallHeight(seg.wall, room.ceilingHeight);
  const L = seg.length.mm;
  const H = wallH.mm ?? NOMINAL_H;
  const unit = room.displayUnit;

  const furniture = useMemo(() => {
    if (!seg.start || !seg.end || L === null) return [];
    return room.layout.items
      .filter((it) => it.layer !== 'floor')
      .map((it) => {
        const poly = furniturePolygon(it);
        let d = Infinity;
        for (let k = 0; k < poly.length; k++) d = Math.min(d, segmentDistance(poly[k], poly[(k + 1) % poly.length], seg.start!, seg.end!));
        if (d > 350) return null;
        const ts = poly.map((p) => dot(sub(p, seg.start!), seg.dir));
        return { it, x0: Math.max(0, Math.min(...ts)), x1: Math.min(L, Math.max(...ts)) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.x1 > x.x0);
  }, [room.layout.items, seg, L]);

  if (L === null) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-md border border-line bg-surface text-[12.5px] text-ink-3">
        Wall length unknown — enter dimensions to see the elevation.
      </div>
    );
  }

  const w = size.width || 1;
  const padX = 46;
  const padTop = 22;
  const padBottom = 44;
  const scale = Math.min((w - padX * 2) / L, (height - padTop - padBottom) / H);
  const ox = (w - L * scale) / 2;
  const oy = padTop + (height - padTop - padBottom - H * scale);
  const X = (mm: number) => ox + mm * scale;
  const Y = (mmFromFloor: number) => oy + (H - mmFromFloor) * scale;
  const els = room.elements.filter((e) => e.placement === 'wall' && e.wallId === seg.id && e.offset !== null);

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-md border border-line bg-surface" style={{ height }}>
      {size.width > 0 && (
        <svg width={w} height={height} style={{ display: 'block', fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' }}>
          <rect
            x={X(0)}
            y={Y(H)}
            width={L * scale}
            height={H * scale}
            fill="#ffffff"
            stroke={C.wall}
            strokeWidth={1.5}
            strokeDasharray={wallH.mm === null ? '6 4' : undefined}
          />
          <line x1={X(0) - 12} y1={Y(0)} x2={X(L) + 12} y2={Y(0)} stroke={C.wall} strokeWidth={2.5} />

          {furniture.map(({ it, x0, x1 }) => {
            const h = it.height ?? 600;
            return (
              <g key={it.id}>
                <rect
                  x={X(x0)}
                  y={Y(h)}
                  width={(x1 - x0) * scale}
                  height={h * scale}
                  fill={it.color || C.furniture}
                  fillOpacity={0.75}
                  stroke={C.furnitureStroke}
                  strokeWidth={1}
                  strokeDasharray={it.height === null ? '4 3' : undefined}
                />
                {(x1 - x0) * scale > 50 && (
                  <text x={X((x0 + x1) / 2)} y={Y(h) + 13} textAnchor="middle" fontSize={10} fill={C.furnitureText}>
                    {it.name}
                    {it.height === null ? ' (height ?)' : ''}
                  </text>
                )}
              </g>
            );
          })}

          {els.map((el) => {
            const x = el.offset!;
            const ew = el.width ?? 0;
            const elev = el.elevation ?? (el.type === 'door' ? 0 : el.type === 'window' ? 900 : 0);
            const eh = el.height ?? (el.type === 'door' ? 2100 : el.type === 'column' ? H : 300);
            const selected = el.id === selectedElementId;
            const dash = el.status === 'estimated' ? '5 3' : el.status === 'unknown' ? '2 3' : undefined;
            const stroke = selected ? C.selected : el.type === 'window' ? C.window : el.type === 'ac' ? C.ac : el.type === 'electrical' ? C.electrical : C.door;
            const fill =
              el.type === 'window'
                ? C.windowFill
                : el.type === 'ac'
                  ? C.acFill
                  : el.type === 'door'
                    ? '#f6f1ea'
                    : el.type === 'column'
                      ? '#cfc4b4'
                      : el.type === 'recess'
                        ? '#f1ece4'
                        : '#eee8df';
            if (el.type === 'electrical') {
              return (
                <circle
                  key={el.id}
                  cx={X(x + ew / 2)}
                  cy={Y(elev)}
                  r={5}
                  fill="#fff"
                  stroke={stroke}
                  strokeWidth={1.5}
                  onClick={() => onElementClick?.(el.id)}
                  style={{ cursor: onElementClick ? 'pointer' : undefined }}
                />
              );
            }
            return (
              <g key={el.id} onClick={() => onElementClick?.(el.id)} style={{ cursor: onElementClick ? 'pointer' : undefined }}>
                <rect
                  x={X(x)}
                  y={Y(elev + eh)}
                  width={Math.max(2, ew * scale)}
                  height={eh * scale}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={selected ? 2 : 1.2}
                  strokeDasharray={dash}
                />
                {el.type === 'window' && <line x1={X(x + ew / 2)} y1={Y(elev + eh)} x2={X(x + ew / 2)} y2={Y(elev)} stroke={C.window} strokeWidth={0.8} />}
                {ew * scale > 30 && (
                  <text x={X(x + ew / 2)} y={Y(elev + eh / 2)} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={stroke}>
                    {el.type === 'ac' ? 'AC' : el.label}
                  </text>
                )}
              </g>
            );
          })}

          <text x={X(L / 2)} y={height - 14} textAnchor="middle" fontSize={11} fill={C.dimText}>
            {formatLength(L, unit)}
            {seg.length.certainty === 'estimated' ? ' (estimated)' : ''}
          </text>
          <text x={X(0)} y={height - 30} textAnchor="start" fontSize={9.5} fill={C.label}>
            ← start
          </text>
          <text x={X(L)} y={height - 30} textAnchor="end" fontSize={9.5} fill={C.label}>
            end →
          </text>
          <g transform={`translate(${X(0) - 16} ${Y(H / 2)}) rotate(-90)`}>
            <text textAnchor="middle" fontSize={10.5} fill={wallH.mm === null ? C.warn : C.dimText}>
              {wallH.mm === null ? 'height unknown' : formatLength(wallH.mm, unit)}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
