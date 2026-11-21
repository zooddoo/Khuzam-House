import type { ArchElement, Certainty, Corner, ID, LengthUnit, Measure, Room, RoomGeometry, Wall, WallDesign } from '../types';
import { combineCertainty, formatArea, formatLength, isKnown, UNKNOWN } from '../units';
import { tr } from '../../i18n/messages';
import { wallTitle } from './names';
import { add, bbox, dist, headingVector, normalizeAngle, polygonArea, scale, selfIntersections, signedArea, type Point } from './polygon';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface GeometryIssue {
  level: IssueLevel;
  code: string;
  message: string;
  wallIds?: ID[];
}

export interface WallSegment {
  id: ID;
  name: string;
  wall: Wall | undefined;
  length: Measure;
  heading: number;
  start: Point | null;
  end: Point | null;
  /** Unit direction of travel along the wall. */
  dir: Point;
  /** Unit normal pointing into the room. */
  inward: Point;
  /** Compass side of the room the wall is on, e.g. "N", "SE". */
  compass: string;
}

export interface RoomShapeResult {
  /** True when every length needed to draw the outline is known. */
  drawable: boolean;
  vertices: Point[];
  segments: WallSegment[];
  bounds: ReturnType<typeof bbox>;
  area: { mm2: number | null; certainty: Certainty };
  perimeter: { mm: number | null; certainty: Certainty };
  closureGapMm: number | null;
  issues: GeometryIssue[];
  /** Human labels of the missing inputs, e.g. ["Length", "Width"]. */
  missing: string[];
}

export const STEP_SUFFIX = ' (step)';

const COMPASS_LABEL: Record<string, string> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
};

export function compassLabel(c: string): string {
  return COMPASS_LABEL[c] ?? c;
}

/** Element name for messages: the owner's label, with default type names translated. */
function elementName(el: ArchElement): string {
  const t = tr();
  const english = ELEMENT_EN[el.type];
  if (!el.label || el.label === english) return t.enums.elementType[el.type];
  const m = new RegExp(`^${english} (\\d+)$`).exec(el.label);
  return m ? `${t.enums.elementType[el.type]} ${m[1]}` : el.label;
}

const ELEMENT_EN: Record<ArchElement['type'], string> = {
  door: 'Door',
  window: 'Window',
  ac: 'AC unit',
  column: 'Column',
  beam: 'Structural beam',
  recess: 'Wall recess',
  projection: 'Wall projection',
  electrical: 'Electrical point',
  other: 'Other fixed element',
};

export function emptyWallDesign(): WallDesign {
  return { cladding: '', artwork: '', tv: '', lighting: '', furniture: '', other: '' };
}

export function createWall(id: ID, name: string, partial: Partial<Wall> = {}): Wall {
  return {
    id,
    name,
    autoName: true,
    length: { ...UNKNOWN },
    heading: 0,
    heightOverride: false,
    height: { ...UNKNOWN },
    notes: '',
    design: emptyWallDesign(),
    ...partial,
  };
}

/** Compass side a wall faces, given its direction of travel when walking clockwise. */
export function compassFromHeading(headingDeg: number, clockwise = true): string {
  // Outward normal = heading rotated 90° counter-clockwise (screen coords) for clockwise polygons.
  const outward = normalizeAngle(headingDeg + (clockwise ? -90 : 90));
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const idx = Math.round(outward / 45) % 8;
  return names[idx];
}

function sub(a: Measure, b: Measure): Measure {
  if (!isKnown(a) || !isKnown(b)) return { ...UNKNOWN };
  return { mm: a.mm - b.mm, certainty: combineCertainty(a.certainty, b.certainty) };
}

interface ParametricWall {
  id: ID;
  defaultName: string;
  length: Measure;
  heading: number;
}

interface ParametricLayout {
  walls: ParametricWall[];
  vertices: Point[] | null;
  issues: GeometryIssue[];
  missing: string[];
}

const PARAM_NAMES: Record<string, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
  N2: `North${STEP_SUFFIX}`,
  E2: `East${STEP_SUFFIX}`,
  S2: `South${STEP_SUFFIX}`,
  W2: `West${STEP_SUFFIX}`,
};

function pw(id: ID, length: Measure, heading: number): ParametricWall {
  return { id, defaultName: PARAM_NAMES[id] ?? id, length, heading };
}

/** Wall layout for rectangles and L-shapes, derived from their parameters. */
export function parametricLayout(g: RoomGeometry): ParametricLayout {
  const L = g.length;
  const W = g.width;
  const issues: GeometryIssue[] = [];
  const missing: string[] = [];
  const t = tr().geometry;
  if (!isKnown(L)) missing.push(t.length);
  if (!isKnown(W)) missing.push(t.width);

  if (g.shape === 'rectangle') {
    const walls = [pw('N', L, 0), pw('E', W, 90), pw('S', L, 180), pw('W', W, 270)];
    const vertices =
      isKnown(L) && isKnown(W)
        ? [
            { x: 0, y: 0 },
            { x: L.mm, y: 0 },
            { x: L.mm, y: W.mm },
            { x: 0, y: W.mm },
          ]
        : null;
    return { walls, vertices, issues, missing };
  }

  // L-shape
  const cl = g.lCutout.length;
  const cw = g.lCutout.width;
  if (!isKnown(cl)) missing.push(t.cutoutLength);
  if (!isKnown(cw)) missing.push(t.cutoutWidth);
  let valid = true;
  if (isKnown(L) && isKnown(cl) && cl.mm >= L.mm) {
    valid = false;
    issues.push({ level: 'error', code: 'cutout-length', message: t.cutoutLengthTooBig });
  }
  if (isKnown(W) && isKnown(cw) && cw.mm >= W.mm) {
    valid = false;
    issues.push({ level: 'error', code: 'cutout-width', message: t.cutoutWidthTooBig });
  }
  const Lc = sub(L, cl);
  const Wc = sub(W, cw);
  const all = isKnown(L) && isKnown(W) && isKnown(cl) && isKnown(cw) && valid;
  const l = L.mm ?? 0;
  const w = W.mm ?? 0;
  const a = cl.mm ?? 0;
  const b = cw.mm ?? 0;
  let walls: ParametricWall[];
  let vertices: Point[];
  switch (g.lCutout.corner) {
    case 'ne':
      walls = [pw('N', Lc, 0), pw('E2', cw, 90), pw('N2', cl, 0), pw('E', Wc, 90), pw('S', L, 180), pw('W', W, 270)];
      vertices = [
        { x: 0, y: 0 },
        { x: l - a, y: 0 },
        { x: l - a, y: b },
        { x: l, y: b },
        { x: l, y: w },
        { x: 0, y: w },
      ];
      break;
    case 'nw':
      walls = [pw('N', Lc, 0), pw('E', W, 90), pw('S', L, 180), pw('W', Wc, 270), pw('N2', cl, 0), pw('W2', cw, 270)];
      vertices = [
        { x: a, y: 0 },
        { x: l, y: 0 },
        { x: l, y: w },
        { x: 0, y: w },
        { x: 0, y: b },
        { x: a, y: b },
      ];
      break;
    case 'se':
      walls = [pw('N', L, 0), pw('E', Wc, 90), pw('S2', cl, 180), pw('E2', cw, 90), pw('S', Lc, 180), pw('W', W, 270)];
      vertices = [
        { x: 0, y: 0 },
        { x: l, y: 0 },
        { x: l, y: w - b },
        { x: l - a, y: w - b },
        { x: l - a, y: w },
        { x: 0, y: w },
      ];
      break;
    case 'sw':
    default:
      walls = [pw('N', L, 0), pw('E', W, 90), pw('S', Lc, 180), pw('W2', cw, 270), pw('S2', cl, 180), pw('W', Wc, 270)];
      vertices = [
        { x: 0, y: 0 },
        { x: l, y: 0 },
        { x: l, y: w },
        { x: a, y: w },
        { x: a, y: w - b },
        { x: 0, y: w - b },
      ];
      break;
  }
  return { walls, vertices: all ? vertices : null, issues, missing };
}

/** Default wall ids for a shape. */
export function wallIdsForGeometry(g: RoomGeometry): ID[] {
  if (g.shape === 'custom') return [];
  return parametricLayout(g).walls.map((w) => w.id);
}

/** Names for custom walls: compass side, numbered when repeated. */
export function autoNamesForCustom(walls: Wall[]): string[] {
  const compasses = walls.map((w) => compassFromHeading(w.heading));
  const counts = new Map<string, number>();
  compasses.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const seen = new Map<string, number>();
  return compasses.map((c) => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return (counts.get(c) ?? 0) > 1 ? `${compassLabel(c)} ${n}` : compassLabel(c);
  });
}

/**
 * Make the walls array match the geometry. For rectangles and L-shapes the
 * set of walls is fixed by the shape; metadata (names, notes, heights, design
 * notes) of walls that still exist is preserved.
 */
export function syncWalls(g: RoomGeometry, walls: Wall[]): Wall[] {
  if (g.shape === 'custom') {
    const names = autoNamesForCustom(walls);
    return walls.map((w, i) => (w.autoName ? { ...w, name: names[i] } : w));
  }
  const layout = parametricLayout(g);
  return layout.walls.map((p) => {
    const existing = walls.find((w) => w.id === p.id);
    if (existing) {
      return {
        ...existing,
        name: existing.autoName ? p.defaultName : existing.name,
        length: p.length,
        heading: p.heading,
      };
    }
    return createWall(p.id, p.defaultName, { length: p.length, heading: p.heading });
  });
}

function segmentFrom(id: ID, name: string, wall: Wall | undefined, length: Measure, heading: number, start: Point | null, clockwise: boolean): WallSegment {
  const dir = headingVector(heading);
  const inward = clockwise ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };
  const end = start && isKnown(length) ? add(start, scale(dir, length.mm)) : null;
  return { id, name, wall, length, heading, start, end, dir, inward, compass: compassFromHeading(heading, clockwise) };
}

/** Compute the room outline, wall segments and derived metrics. */
export function computeRoomShape(room: Pick<Room, 'geometry' | 'walls'>): RoomShapeResult {
  const g = room.geometry;
  const issues: GeometryIssue[] = [];

  if (g.shape !== 'custom') {
    const layout = parametricLayout(g);
    issues.push(...layout.issues);
    const vertices = layout.vertices ?? [];
    const segments = layout.walls.map((p, i) => {
      const meta = room.walls.find((w) => w.id === p.id);
      return segmentFrom(p.id, meta?.name ?? p.defaultName, meta, p.length, p.heading, vertices.length ? vertices[i] : null, true);
    });
    const known = layout.vertices !== null;
    let areaMm2: number | null = null;
    let areaCert: Certainty = 'unknown';
    if (known) {
      areaMm2 = polygonArea(vertices);
      const cs = [g.length.certainty, g.width.certainty];
      if (g.shape === 'l-shape') cs.push(g.lCutout.length.certainty, g.lCutout.width.certainty);
      areaCert = combineCertainty(...cs);
    }
    const perim = isKnown(g.length) && isKnown(g.width) ? 2 * (g.length.mm + g.width.mm) : null;
    return {
      drawable: known,
      vertices,
      segments,
      bounds: bbox(vertices),
      area: { mm2: areaMm2, certainty: areaCert },
      perimeter: {
        mm: perim,
        certainty: perim === null ? 'unknown' : combineCertainty(g.length.certainty, g.width.certainty),
      },
      closureGapMm: null,
      issues,
      missing: layout.missing,
    };
  }

  // Custom polygon from wall segments.
  const t = tr().geometry;
  const walls = room.walls;
  const missing: string[] = [];
  if (walls.length < 3) {
    issues.push({ level: 'error', code: 'too-few-walls', message: t.tooFewWalls });
  }
  walls.forEach((w) => {
    if (!isKnown(w.length)) missing.push(t.wallLength(wallTitle(w)));
    else if (w.length.mm <= 0) issues.push({ level: 'error', code: 'zero-wall', message: t.zeroWall(wallTitle(w)), wallIds: [w.id] });
  });
  const allKnown = missing.length === 0 && walls.length >= 3;

  // Walk the walls from the fixed origin.
  const origin: Point = { x: g.customOrigin?.x ?? 0, y: g.customOrigin?.y ?? 0 };
  const pts: Point[] = [];
  if (allKnown) {
    let p = origin;
    for (const w of walls) {
      pts.push(p);
      p = add(p, scale(headingVector(w.heading), w.length.mm as number));
    }
    pts.push(p); // end point (should equal origin)
  }
  const vertices = allKnown ? pts.slice(0, -1) : [];
  const orientation = allKnown ? signedArea(vertices) : 1;
  const clockwise = orientation >= 0;
  const segments = walls.map((w, i) => segmentFrom(w.id, w.name, w, w.length, w.heading, allKnown ? pts[i] : null, clockwise));

  let closureGap: number | null = null;
  let areaMm2: number | null = null;
  let areaCert: Certainty = 'unknown';
  let perimMm: number | null = null;
  if (allKnown) {
    closureGap = dist(pts[pts.length - 1], origin);
    perimMm = walls.reduce((s, w) => s + (w.length.mm as number), 0);
    const tolerance = Math.max(10, perimMm * 0.002);
    areaMm2 = polygonArea(vertices);
    areaCert = combineCertainty(...walls.map((w) => w.length.certainty));
    if (closureGap > tolerance) {
      issues.push({
        level: 'warning',
        code: 'not-closed',
        message: t.notClosed(formatLength(closureGap, 'cm')),
      });
      areaCert = combineCertainty(areaCert, 'estimated');
    }
    if (!clockwise) {
      issues.push({
        level: 'info',
        code: 'counter-clockwise',
        message: t.counterClockwise,
      });
    }
    const crossings = selfIntersections(vertices);
    if (crossings.length) {
      issues.push({
        level: 'warning',
        code: 'self-intersect',
        message: t.selfIntersect,
        wallIds: crossings.flatMap(([a, b]) => [walls[a].id, walls[b].id]),
      });
    }
    if (areaMm2 < 1) {
      issues.push({ level: 'error', code: 'zero-area', message: t.zeroArea });
    }
  }

  return {
    drawable: allKnown,
    vertices,
    segments,
    bounds: bbox(vertices),
    area: { mm2: areaMm2, certainty: areaCert },
    perimeter: { mm: perimMm, certainty: perimMm === null ? 'unknown' : combineCertainty(...walls.map((w) => w.length.certainty)) },
    closureGapMm: closureGap,
    issues,
    missing,
  };
}

/** Height that applies to a wall: its own override, else the room ceiling height. */
export function effectiveWallHeight(wall: Wall | undefined, ceiling: Measure): Measure {
  if (wall?.heightOverride) return wall.height;
  return ceiling;
}

export interface WallAreaRow {
  wallId: ID;
  name: string;
  length: Measure;
  height: Measure;
  grossMm2: number | null;
  openingsMm2: number;
  /** Openings on this wall whose size is unknown (net area is then approximate). */
  unknownOpenings: number;
  netMm2: number | null;
  certainty: Certainty;
}

export function wallAreas(room: Room, shape: RoomShapeResult = computeRoomShape(room)): WallAreaRow[] {
  return shape.segments.map((seg) => {
    const h = effectiveWallHeight(seg.wall, room.ceilingHeight);
    const gross = isKnown(seg.length) && isKnown(h) ? seg.length.mm * h.mm : null;
    let openings = 0;
    let unknownOpenings = 0;
    for (const el of room.elements) {
      if (el.placement !== 'wall' || el.wallId !== seg.id) continue;
      if (el.type !== 'door' && el.type !== 'window') continue;
      if (el.width !== null && el.height !== null) openings += el.width * el.height;
      else unknownOpenings++;
    }
    return {
      wallId: seg.id,
      name: seg.name,
      length: seg.length,
      height: h,
      grossMm2: gross,
      openingsMm2: openings,
      unknownOpenings,
      netMm2: gross === null ? null : Math.max(0, gross - openings),
      certainty: gross === null ? 'unknown' : combineCertainty(seg.length.certainty, h.certainty),
    };
  });
}

export function findSegment(shape: RoomShapeResult, wallId: ID | null): WallSegment | undefined {
  if (!wallId) return undefined;
  return shape.segments.find((s) => s.id === wallId);
}

/** Endpoints of a wall-mounted element along its wall, or null if not placeable. */
export function elementSpan(seg: WallSegment | undefined, el: Pick<ArchElement, 'offset' | 'width'>): { a: Point; b: Point } | null {
  if (!seg || !seg.start || el.offset === null) return null;
  const a = add(seg.start, scale(seg.dir, el.offset));
  const b = add(a, scale(seg.dir, el.width ?? 0));
  return { a, b };
}

/** Problems with how architectural elements sit on their walls. */
export function elementIssues(room: Room, shape: RoomShapeResult = computeRoomShape(room)): GeometryIssue[] {
  const t = tr().geometry;
  const issues: GeometryIssue[] = [];
  const label = (el: ArchElement, fallback = t.anElement) => (el.label ? elementName(el) : fallback);
  const byWall = new Map<ID, ArchElement[]>();
  for (const el of room.elements) {
    if (el.placement !== 'wall') continue;
    if (!el.wallId) {
      issues.push({ level: 'warning', code: 'no-wall', message: t.noWall(label(el)) });
      continue;
    }
    const seg = findSegment(shape, el.wallId);
    if (!seg) {
      issues.push({
        level: 'warning',
        code: 'missing-wall',
        message: t.missingWall(label(el)),
      });
      continue;
    }
    if (isKnown(seg.length) && el.offset !== null && el.offset + (el.width ?? 0) > seg.length.mm + 1) {
      issues.push({
        level: 'warning',
        code: 'beyond-wall',
        message: t.beyondWall(label(el), wallTitle(seg), formatLength(seg.length.mm, 'm')),
        wallIds: [seg.id],
      });
    }
    const h = effectiveWallHeight(seg.wall, room.ceilingHeight);
    if (isKnown(h) && el.height !== null && (el.elevation ?? 0) + el.height > h.mm + 1 && el.type !== 'beam') {
      issues.push({
        level: 'warning',
        code: 'above-ceiling',
        message: t.aboveCeiling(label(el), wallTitle(seg), formatLength(h.mm, 'm')),
        wallIds: [seg.id],
      });
    }
    const list = byWall.get(seg.id) ?? [];
    list.push(el);
    byWall.set(seg.id, list);
  }
  // Overlapping openings on the same wall.
  for (const [wallId, list] of byWall) {
    const openings = list.filter((e) => (e.type === 'door' || e.type === 'window') && e.offset !== null && e.width !== null);
    for (let i = 0; i < openings.length; i++) {
      for (let j = i + 1; j < openings.length; j++) {
        const a = openings[i];
        const b = openings[j];
        const a0 = a.offset as number;
        const a1 = a0 + (a.width as number);
        const b0 = b.offset as number;
        const b1 = b0 + (b.width as number);
        const verticalOverlap =
          a.elevation === null || b.elevation === null || a.height === null || b.height === null
            ? true
            : a.elevation < b.elevation + b.height && b.elevation < a.elevation + a.height;
        if (a0 < b1 - 1 && b0 < a1 - 1 && verticalOverlap) {
          issues.push({
            level: 'warning',
            code: 'openings-overlap',
            message: t.openingsOverlap(label(a, t.anOpening), label(b, t.anotherOpening)),
            wallIds: [wallId],
          });
        }
      }
    }
  }
  return issues;
}

/** Convert the current geometry to an explicit list of custom walls. */
export function toCustomGeometry(room: Room): { geometry: RoomGeometry; walls: Wall[] } {
  if (room.geometry.shape === 'custom') return { geometry: room.geometry, walls: room.walls };
  const layout = parametricLayout(room.geometry);
  const synced = syncWalls(room.geometry, room.walls);
  const walls = layout.walls.map((p, i) => ({
    ...synced[i],
    length: p.length,
    heading: p.heading,
  }));
  const origin = layout.vertices?.[0] ?? { x: 0, y: 0 };
  return {
    geometry: { ...room.geometry, shape: 'custom', customOrigin: origin },
    walls,
  };
}

/**
 * Best-effort rectangle from the current geometry. Returns the derived
 * length/width plus whether information is lost in the conversion.
 */
export function toRectangleGeometry(room: Room): { geometry: RoomGeometry; walls: Wall[]; lossy: boolean } {
  const g = room.geometry;
  if (g.shape === 'rectangle') return { geometry: g, walls: room.walls, lossy: false };
  if (g.shape === 'l-shape') {
    const geometry: RoomGeometry = { ...g, shape: 'rectangle' };
    return { geometry, walls: syncWalls(geometry, room.walls), lossy: true };
  }
  const w = room.walls;
  const orth = w.length === 4 && w.every((x, i) => normalizeAngle(x.heading) === normalizeAngle(w[0].heading + i * 90));
  if (orth && w[0].heading === 0) {
    const geometry: RoomGeometry = { ...g, shape: 'rectangle', length: w[0].length, width: w[1].length };
    const sameOpp =
      isKnown(w[0].length) && isKnown(w[2].length) && isKnown(w[1].length) && isKnown(w[3].length)
        ? Math.abs(w[0].length.mm - w[2].length.mm) < 1 && Math.abs(w[1].length.mm - w[3].length.mm) < 1
        : false;
    const ids = ['N', 'E', 'S', 'W'];
    const walls = w.map((x, i) => ({ ...x, id: ids[i] }));
    return { geometry, walls: syncWalls(geometry, walls), lossy: !sameOpp };
  }
  const shape = computeRoomShape(room);
  const geometry: RoomGeometry = {
    ...g,
    shape: 'rectangle',
    length: shape.drawable ? { mm: Math.round(shape.bounds.width), certainty: 'estimated' } : { ...UNKNOWN },
    width: shape.drawable ? { mm: Math.round(shape.bounds.height), certainty: 'estimated' } : { ...UNKNOWN },
  };
  return { geometry, walls: syncWalls(geometry, room.walls), lossy: true };
}

export function shapeLabel(g: RoomGeometry): string {
  const t = tr().geometry;
  if (g.shape === 'rectangle') return t.rectangular;
  if (g.shape === 'l-shape') return t.lShaped;
  return t.customShape;
}

/** One-line dimension summary for cards and headers. */
export function dimensionSummary(room: Room, unit: LengthUnit = room.displayUnit): string {
  const t = tr().geometry;
  const g = room.geometry;
  if (g.shape === 'custom') {
    const shape = computeRoomShape(room);
    if (!shape.drawable) return room.walls.length ? t.customSummary(room.walls.length) : t.dimsUnknown;
    return t.customOverall(formatLength(shape.bounds.width, unit), formatLength(shape.bounds.height, unit));
  }
  if (!isKnown(g.length) && !isKnown(g.width)) return t.dimsUnknown;
  const l = formatLength(g.length.mm, unit, { unknown: '?' });
  const w = formatLength(g.width.mm, unit, { unknown: '?' });
  const approx = g.length.certainty === 'estimated' || g.width.certainty === 'estimated' ? t.approx : '';
  return `${approx}${l} × ${w}${g.shape === 'l-shape' ? t.lOverall : ''}`;
}

export function areaSummary(shape: RoomShapeResult): string {
  const t = tr().geometry;
  if (shape.area.mm2 === null) return t.areaUnknown;
  return `${shape.area.certainty === 'estimated' ? t.approx : ''}${formatArea(shape.area.mm2)}`;
}

export function cornerLabel(c: Corner): string {
  return tr().enums.corner[c];
}

/** Plain-language name of the end a wall's offsets are measured from, e.g. "west end". */
export function wallStartLabel(seg: Pick<WallSegment, 'heading'>): string {
  const b = normalizeAngle(seg.heading + 180);
  const codes = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const g = tr().geo;
  return g.endOf(g.compass[codes[Math.round(b / 45) % 8]]);
}
