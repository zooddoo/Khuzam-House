/** Planar geometry helpers. Coordinates are plan millimetres, screen-oriented (x → east, y → south). */

export interface Point {
  x: number;
  y: number;
}

export const EPS = 1e-6;

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}
export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}
export function len(a: Point): number {
  return Math.hypot(a.x, a.y);
}
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function normalize(a: Point): Point {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function headingVector(headingDeg: number): Point {
  const r = degToRad(headingDeg);
  // Round to avoid -0 / 6.1e-17 noise on orthogonal headings.
  const x = Math.round(Math.cos(r) * 1e9) / 1e9;
  const y = Math.round(Math.sin(r) * 1e9) / 1e9;
  return { x, y };
}

export function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Signed area (shoelace). Positive for clockwise polygons in screen coordinates. */
export function signedArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonArea(pts: Point[]): number {
  return Math.abs(signedArea(pts));
}

export function perimeter(pts: Point[]): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += dist(pts[i], pts[(i + 1) % pts.length]);
  return p;
}

export function bbox(pts: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Ray-casting point-in-polygon. Points on the boundary count as inside (within tolerance). */
export function pointInPolygon(p: Point, poly: Point[], tolerance = 0.5): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]) <= tolerance) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

function orient(a: Point, b: Point, c: Point): number {
  const v = cross(sub(b, a), sub(c, a));
  if (Math.abs(v) < 1e-9) return 0;
  return v > 0 ? 1 : -1;
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;
}

/** True if segments ab and cd intersect (including touching). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Proper crossing: segments cross at an interior point (touching at ends does not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Separating axis test for two convex polygons. Touching edges do not count as overlap. */
export function convexOverlap(p: Point[], q: Point[], tolerance = 1): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const axis = normalize({ x: -(b.y - a.y), y: b.x - a.x });
      if (len(axis) < EPS) continue;
      let minP = Infinity;
      let maxP = -Infinity;
      for (const v of p) {
        const s = dot(v, axis);
        minP = Math.min(minP, s);
        maxP = Math.max(maxP, s);
      }
      let minQ = Infinity;
      let maxQ = -Infinity;
      for (const v of q) {
        const s = dot(v, axis);
        minQ = Math.min(minQ, s);
        maxQ = Math.max(maxQ, s);
      }
      if (maxP <= minQ + tolerance || maxQ <= minP + tolerance) return false;
    }
  }
  return true;
}

export function polygonDistance(p: Point[], q: Point[]): number {
  if (convexOverlap(p, q, 0)) return 0;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    for (let j = 0; j < q.length; j++) {
      best = Math.min(best, segmentDistance(a, b, q[j], q[(j + 1) % q.length]));
      if (best === 0) return 0;
    }
  }
  return best;
}

/** Corners of a rotated rectangle centred at (cx, cy). Rotation is clockwise in degrees. */
export function rectCorners(cx: number, cy: number, w: number, h: number, rotationDeg: number): Point[] {
  const r = degToRad(rotationDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
}

export function ellipsePolygon(cx: number, cy: number, w: number, h: number, rotationDeg: number, steps = 24): Point[] {
  const r = degToRad(rotationDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pts: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const px = (Math.cos(t) * w) / 2;
    const py = (Math.sin(t) * h) / 2;
    pts.push({ x: cx + px * c - py * s, y: cy + px * s + py * c });
  }
  return pts;
}

/**
 * Offset a simple polygon outward by `d` (positive) or inward (negative).
 * Works for convex and concave orthogonal shapes; assumes no self-intersection.
 */
export function offsetPolygon(pts: Point[], d: number): Point[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const orientation = signedArea(pts) >= 0 ? 1 : -1;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dir = normalize(sub(b, a));
    // Outward normal for a clockwise (screen) polygon.
    const nrm = scale({ x: dir.y, y: -dir.x }, orientation);
    return { p: add(a, scale(nrm, d)), dir };
  });
  return pts.map((orig, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const denom = cross(l1.dir, l2.dir);
    if (Math.abs(denom) < 1e-9) {
      return l2.p;
    }
    const t = cross(sub(l2.p, l1.p), l2.dir) / denom;
    const p = add(l1.p, scale(l1.dir, t));
    // Guard against spikes for very sharp angles.
    if (dist(p, orig) > Math.abs(d) * 6) return add(orig, scale(normalize(sub(p, orig)), Math.abs(d) * 6));
    return p;
  });
}

/** Detect self-intersection among non-adjacent edges of a polygon. */
export function selfIntersections(pts: Point[]): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) out.push([i, j]);
    }
  }
  return out;
}

export function centroid(pts: Point[]): Point {
  const a = signedArea(pts);
  if (Math.abs(a) < EPS) {
    const b = bbox(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
