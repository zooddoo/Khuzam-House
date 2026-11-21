import type { Lang } from '@/i18n/prefs';
import { getPrefs } from '@/i18n/prefs';
import { formatLength } from '@/lib/units';
import type { RoomShapeResult } from '@/lib/geometry/room';
import type { Point } from '@/lib/geometry/polygon';

export interface PlanView {
  /** pixels per millimetre */
  scale: number;
  tx: number;
  ty: number;
}

export const WALL_T = 140; // visual wall thickness (mm)

export const PLAN_COLORS = {
  paper: '#fbf9f5',
  floor: '#ffffff',
  grid: '#ece6dc',
  gridMajor: '#ddd4c6',
  wall: '#2f2a24',
  dim: '#7d7366',
  dimText: '#4c453d',
  label: '#9a8f81',
  furniture: '#f2e6da',
  furnitureStroke: '#8e5b3c',
  furnitureText: '#4f3422',
  selected: '#26221d',
  warn: '#9e3f33',
  window: '#566676',
  windowFill: '#e2e7eb',
  door: '#3a342d',
  ac: '#566676',
  acFill: '#e2e7eb',
  column: '#5a5249',
  electrical: '#9a6f22',
  rug: '#c9b8a3',
};

export function fitView(bounds: { minX: number; minY: number; width: number; height: number }, w: number, h: number, padPx = 56): PlanView {
  const bw = Math.max(bounds.width, 500);
  const bh = Math.max(bounds.height, 500);
  const scale = Math.max(0.005, Math.min((w - padPx * 2) / bw, (h - padPx * 2) / bh));
  const tx = (w - bw * scale) / 2 - bounds.minX * scale + ((bw - bounds.width) * scale) / 2;
  const ty = (h - bh * scale) / 2 - bounds.minY * scale + ((bh - bounds.height) * scale) / 2;
  return { scale, tx, ty };
}

export function toScreen(v: PlanView, p: Point): Point {
  return { x: v.tx + p.x * v.scale, y: v.ty + p.y * v.scale };
}

export function toWorld(v: PlanView, p: Point): Point {
  return { x: (p.x - v.tx) / v.scale, y: (p.y - v.ty) / v.scale };
}

export function pathFrom(pts: Point[], close = true): string {
  if (!pts.length) return '';
  return `M ${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}${close ? ' Z' : ''}`;
}

/** Bounds of the room plus a margin for dimension labels. */
export function planBounds(shape: RoomShapeResult) {
  const b = shape.bounds;
  return { minX: b.minX - 900, minY: b.minY - 900, width: b.width + 1800, height: b.height + 1800 };
}

/** Text rotation that keeps labels upright. */
export function uprightAngle(headingDeg: number): number {
  let a = headingDeg % 360;
  if (a < 0) a += 360;
  if (a > 90 && a < 270) a -= 180;
  return a;
}

export function niceScaleBar(scale: number, lang: Lang = getPrefs().lang): { mm: number; px: number; label: string } {
  const targetPx = 110;
  const candidates = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c * scale - targetPx) < Math.abs(best * scale - targetPx)) best = c;
  return { mm: best, px: best * scale, label: best >= 1000 ? formatLength(best, 'm', { lang }) : formatLength(best, 'cm', { lang }) };
}
