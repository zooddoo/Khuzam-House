import type { ArchElement, FurnitureCategory, FurnitureItem, ID, RoomLayout } from '../types';
import { elementSpan, findSegment, type RoomShapeResult, type WallSegment } from '../geometry/room';
import {
  add,
  convexOverlap,
  ellipsePolygon,
  pointInPolygon,
  polygonDistance,
  rectCorners,
  scale,
  segmentDistance,
  segmentsCross,
  sub,
  type Point,
} from '../geometry/polygon';
import { formatLength } from '../units';

export type WarningCode = 'overlap' | 'bounds' | 'door' | 'window' | 'ac' | 'clearance' | 'wall-gap' | 'architecture' | 'unchecked';

export interface LayoutWarning {
  id: string;
  level: 'error' | 'warning' | 'info';
  code: WarningCode;
  message: string;
  itemIds: ID[];
  elementIds: ID[];
}

/** Gaps smaller than this are treated as intentional adjacency (pieces placed together). */
export const ADJACENT_GAP_MM = 100;
const WINDOW_ZONE_MM = 300;
const AC_ZONE_MM = 600;

const TABLE_LIKE: FurnitureCategory[] = ['table', 'dining-table', 'desk', 'island'];

export function furniturePolygon(item: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'shape'>): Point[] {
  return item.shape === 'round'
    ? ellipsePolygon(item.x, item.y, item.width, item.depth, item.rotation)
    : rectCorners(item.x, item.y, item.width, item.depth, item.rotation);
}

/** Rectangle on the inside face of a wall, `depth` deep, spanning a–b. */
export function wallZone(seg: WallSegment, a: Point, b: Point, depth: number): Point[] {
  const n = scale(seg.inward, depth);
  return [a, b, add(b, n), add(a, n)];
}

const DEFAULT_DEPTH: Partial<Record<ArchElement['type'], number>> = {
  ac: 250,
  projection: 300,
  column: 300,
  other: 100,
};

/** Footprint of a fixed element inside the room, if it occupies floor/wall space. */
export function elementFootprint(shape: RoomShapeResult, el: ArchElement): Point[] | null {
  if (el.placement === 'free') {
    if (el.x === null || el.y === null || el.width === null) return null;
    return rectCorners(el.x, el.y, el.width, el.depth ?? el.width, el.rotation);
  }
  const seg = findSegment(shape, el.wallId);
  const span = elementSpan(seg, el);
  if (!seg || !span || el.width === null) return null;
  const depth = el.depth ?? DEFAULT_DEPTH[el.type] ?? 0;
  if (depth <= 0) return null;
  return wallZone(seg, span.a, span.b, depth);
}

/** Areas a door needs kept clear: the leaf swing (for inward doors) and an approach zone. */
export function doorZones(shape: RoomShapeResult, el: ArchElement, clearanceMm: number): Point[][] {
  const seg = findSegment(shape, el.wallId);
  const span = elementSpan(seg, el);
  if (!seg || !span || el.width === null || el.width <= 0) return [];
  const zones: Point[][] = [];
  const swing = el.door?.swing ?? 'in';
  if (swing === 'in') {
    const isDouble = /double/i.test(el.subtype);
    const leaves = isDouble
      ? [
          { hinge: span.a, toward: span.b, r: el.width / 2 },
          { hinge: span.b, toward: span.a, r: el.width / 2 },
        ]
      : el.door?.hinge === 'right'
        ? [{ hinge: span.b, toward: span.a, r: el.width }]
        : [{ hinge: span.a, toward: span.b, r: el.width }];
    for (const leaf of leaves) {
      const u = scale(sub(leaf.toward, leaf.hinge), 1 / Math.max(1, Math.hypot(leaf.toward.x - leaf.hinge.x, leaf.toward.y - leaf.hinge.y)));
      const pts: Point[] = [leaf.hinge];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        pts.push(add(leaf.hinge, add(scale(u, Math.cos(t) * leaf.r), scale(seg.inward, Math.sin(t) * leaf.r))));
      }
      zones.push(pts);
    }
  }
  zones.push(wallZone(seg, span.a, span.b, Math.max(300, clearanceMm)));
  return zones;
}

/** Door zones (rectangles and quarter-circle fans) are convex, so SAT applies directly. */
function overlapsAny(poly: Point[], zones: Point[][]): boolean {
  return zones.some((z) => convexOverlap(poly, z, 1));
}

function cm(mm: number): string {
  return formatLength(mm, 'cm');
}

function label(el: ArchElement): string {
  return el.label || el.subtype || el.type;
}

export interface ValidateInput {
  shape: RoomShapeResult;
  elements: ArchElement[];
  items: FurnitureItem[];
  layout: Pick<RoomLayout, 'clearanceMm' | 'checks'>;
}

export function validateLayout({ shape, elements, items, layout }: ValidateInput): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const push = (w: Omit<LayoutWarning, 'id'>) => out.push({ ...w, id: `${w.code}:${[...w.itemIds, ...w.elementIds].join(',')}:${out.length}` });

  if (!shape.drawable) {
    push({
      level: 'info',
      code: 'unchecked',
      message: 'Layout checks need the room outline. Enter the room dimensions to enable them.',
      itemIds: [],
      elementIds: [],
    });
    return out;
  }

  const room = shape.vertices;
  const polys = new Map(items.map((it) => [it.id, furniturePolygon(it)]));
  const checks = layout.checks;
  const clearance = Math.max(0, layout.clearanceMm);

  // 1. Out of bounds
  if (checks.bounds) {
    for (const it of items) {
      const p = polys.get(it.id)!;
      const outside = p.some((v) => !pointInPolygon(v, room, 1));
      let crosses = false;
      if (!outside) {
        outer: for (let i = 0; i < p.length; i++) {
          for (let j = 0; j < room.length; j++) {
            if (segmentsCross(p[i], p[(i + 1) % p.length], room[j], room[(j + 1) % room.length])) {
              crosses = true;
              break outer;
            }
          }
        }
      }
      if (outside || crosses) {
        push({ level: 'error', code: 'bounds', message: `${it.name} extends outside the room.`, itemIds: [it.id], elementIds: [] });
      }
    }
  }

  // 2. Overlaps between furniture pieces
  if (checks.overlap) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.layer === 'floor' || b.layer === 'floor') continue;
        const tuck = (a.category === 'chair' && TABLE_LIKE.includes(b.category)) || (b.category === 'chair' && TABLE_LIKE.includes(a.category));
        if (tuck) continue;
        if (convexOverlap(polys.get(a.id)!, polys.get(b.id)!, 1)) {
          push({ level: 'error', code: 'overlap', message: `${a.name} overlaps ${b.name}.`, itemIds: [a.id, b.id], elementIds: [] });
        }
      }
    }
  }

  const unplaced: ArchElement[] = [];

  // 3. Doors
  if (checks.doors) {
    for (const el of elements.filter((e) => e.type === 'door')) {
      const zones = doorZones(shape, el, clearance);
      if (!zones.length) {
        unplaced.push(el);
        continue;
      }
      for (const it of items) {
        if (it.layer === 'floor') continue;
        if (overlapsAny(polys.get(it.id)!, zones)) {
          push({
            level: 'error',
            code: 'door',
            message: `${it.name} obstructs ${label(el)}${el.door?.swing === 'in' ? ' (door swing or approach)' : ' (approach)'}.`,
            itemIds: [it.id],
            elementIds: [el.id],
          });
        }
      }
    }
  }

  // 4. Windows
  if (checks.windows) {
    for (const el of elements.filter((e) => e.type === 'window')) {
      const seg = findSegment(shape, el.wallId);
      const span = elementSpan(seg, el);
      if (!seg || !span || el.width === null) {
        unplaced.push(el);
        continue;
      }
      const zone = wallZone(seg, span.a, span.b, WINDOW_ZONE_MM);
      for (const it of items) {
        if (it.layer === 'floor') continue;
        if (!convexOverlap(polys.get(it.id)!, zone, 1)) continue;
        if (it.height !== null && el.elevation !== null) {
          if (it.height > el.elevation) {
            push({
              level: 'warning',
              code: 'window',
              message: `${it.name} (${cm(it.height)} tall) stands in front of ${label(el)} and rises above its sill (${cm(el.elevation)}).`,
              itemIds: [it.id],
              elementIds: [el.id],
            });
          }
        } else {
          push({
            level: 'info',
            code: 'window',
            message: `${it.name} is directly in front of ${label(el)} and may block it (${it.height === null ? 'item height' : 'sill height'} unknown).`,
            itemIds: [it.id],
            elementIds: [el.id],
          });
        }
      }
    }
  }

  // 5. AC units
  if (checks.ac) {
    for (const el of elements.filter((e) => e.type === 'ac')) {
      const seg = findSegment(shape, el.wallId);
      const span = el.placement === 'wall' ? elementSpan(seg, el) : null;
      if (!seg || !span || el.width === null) {
        if (el.placement === 'wall') unplaced.push(el);
        continue;
      }
      const zone = wallZone(seg, span.a, span.b, (el.depth ?? 250) + AC_ZONE_MM);
      const floorStanding = /floor/i.test(el.subtype);
      for (const it of items) {
        if (it.layer === 'floor') continue;
        if (!convexOverlap(polys.get(it.id)!, zone, 1)) continue;
        if (floorStanding) {
          push({ level: 'warning', code: 'ac', message: `${it.name} blocks the airflow of ${label(el)}.`, itemIds: [it.id], elementIds: [el.id] });
        } else if (it.height !== null && el.elevation !== null) {
          if (it.height >= el.elevation - 200) {
            push({
              level: 'warning',
              code: 'ac',
              message: `${it.name} (${cm(it.height)} tall) reaches the ${label(el)} mounted at ${cm(el.elevation)} — airflow may be blocked.`,
              itemIds: [it.id],
              elementIds: [el.id],
            });
          }
        } else if (it.height === null || it.height > 1800) {
          push({
            level: 'info',
            code: 'ac',
            message: `${it.name} is below ${label(el)}; check it doesn't block airflow (${el.elevation === null ? 'AC height' : 'item height'} unknown).`,
            itemIds: [it.id],
            elementIds: [el.id],
          });
        }
      }
    }
  }

  // 6. Fixed architecture (columns, projections, floor-standing elements)
  if (checks.architecture) {
    for (const el of elements.filter((e) => e.type === 'column' || e.type === 'projection' || e.type === 'other')) {
      const fp = elementFootprint(shape, el);
      if (!fp) continue;
      for (const it of items) {
        if (it.layer === 'floor') continue;
        if (convexOverlap(polys.get(it.id)!, fp, 1)) {
          push({ level: 'error', code: 'architecture', message: `${it.name} collides with ${label(el)}.`, itemIds: [it.id], elementIds: [el.id] });
        }
      }
    }
  }

  // 7. Clearances
  if (checks.clearance && clearance > 0) {
    const considered = items.filter((it) => it.layer !== 'floor' && !it.ignoreClearance);
    for (let i = 0; i < considered.length; i++) {
      for (let j = i + 1; j < considered.length; j++) {
        const a = considered[i];
        const b = considered[j];
        const d = polygonDistance(polys.get(a.id)!, polys.get(b.id)!);
        if (d >= ADJACENT_GAP_MM && d < clearance) {
          push({
            level: 'warning',
            code: 'clearance',
            message: `Only ${cm(d)} between ${a.name} and ${b.name} (your minimum is ${cm(clearance)}).`,
            itemIds: [a.id, b.id],
            elementIds: [],
          });
        }
      }
    }
    for (const it of considered) {
      const p = polys.get(it.id)!;
      for (const seg of shape.segments) {
        if (!seg.start || !seg.end) continue;
        let d = Infinity;
        for (let k = 0; k < p.length; k++) d = Math.min(d, segmentDistance(p[k], p[(k + 1) % p.length], seg.start, seg.end));
        if (d >= ADJACENT_GAP_MM && d < clearance) {
          push({
            level: 'info',
            code: 'wall-gap',
            message: `${cm(d)} gap between ${it.name} and the ${seg.name} wall — narrower than your ${cm(clearance)} minimum.`,
            itemIds: [it.id],
            elementIds: [],
          });
        }
      }
    }
  }

  if (unplaced.length) {
    push({
      level: 'info',
      code: 'unchecked',
      message: `${unplaced.length === 1 ? '1 element has' : `${unplaced.length} elements have`} an unknown position or width and could not be checked: ${unplaced.map(label).join(', ')}.`,
      itemIds: [],
      elementIds: unplaced.map((e) => e.id),
    });
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
