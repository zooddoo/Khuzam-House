import type { Certainty, LengthUnit, Measure } from './types';

export const UNIT_LABEL: Record<LengthUnit, string> = { mm: 'mm', cm: 'cm', m: 'm' };
const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };
const DECIMALS: Record<LengthUnit, number> = { mm: 0, cm: 1, m: 3 };

/** Largest plausible single dimension for a house space (200 m). */
export const MAX_LENGTH_MM = 200_000;

export function toUnit(mm: number, unit: LengthUnit): number {
  return mm / MM_PER[unit];
}

export function fromUnit(value: number, unit: LengthUnit): number {
  return Math.round(value * MM_PER[unit] * 1000) / 1000;
}

/** Value formatted for an input field (no unit, trimmed trailing zeros). */
export function formatInputValue(mm: number | null, unit: LengthUnit): string {
  if (mm === null || !Number.isFinite(mm)) return '';
  const v = toUnit(mm, unit);
  return trimZeros(v.toFixed(DECIMALS[unit]));
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/** "6.2 m", "620 cm", "6,200 mm". */
export function formatLength(mm: number | null, unit: LengthUnit, opts: { unknown?: string; decimals?: number } = {}): string {
  if (mm === null || !Number.isFinite(mm)) return opts.unknown ?? 'Unknown';
  const v = toUnit(mm, unit);
  const decimals = opts.decimals ?? (unit === 'm' ? 2 : unit === 'cm' ? 0 : 0);
  const text = unit === 'mm' ? Math.round(v).toLocaleString('en-US') : trimZeros(v.toFixed(decimals));
  return `${text} ${UNIT_LABEL[unit]}`;
}

/** Compact "300 × 100 cm" style used for furniture footprints. */
export function formatSize(widthMm: number | null, depthMm: number | null, unit: LengthUnit): string {
  const u = unit === 'mm' ? 'mm' : unit === 'm' ? 'm' : 'cm';
  const f = (mm: number | null) => {
    if (mm === null) return '?';
    const v = toUnit(mm, u);
    return u === 'm' ? trimZeros(v.toFixed(2)) : trimZeros(v.toFixed(u === 'cm' ? 1 : 0));
  };
  return `${f(widthMm)} × ${f(depthMm)} ${u}`;
}

export function formatArea(mm2: number | null, opts: { unknown?: string } = {}): string {
  if (mm2 === null || !Number.isFinite(mm2)) return opts.unknown ?? 'Unknown';
  const m2 = mm2 / 1_000_000;
  return `${m2.toFixed(2)} m²`;
}

export function formatVolume(mm3: number | null): string {
  if (mm3 === null || !Number.isFinite(mm3)) return 'Unknown';
  return `${(mm3 / 1_000_000_000).toFixed(2)} m³`;
}

export type ParseResult = { ok: true; mm: number | null } | { ok: false; error: string };

/**
 * Parse a user-entered length. Accepts plain numbers in the given unit, or an
 * explicit unit suffix ("620cm", "6.2 m", "6200mm"). Empty input = unknown.
 */
export function parseLength(input: string, unit: LengthUnit, opts: { allowZero?: boolean; max?: number } = {}): ParseResult {
  const raw = input
    .trim()
    .replace(/,/g, '.')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (raw === '') return { ok: true, mm: null };
  const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i);
  if (!m) return { ok: false, error: 'Enter a number, e.g. 4.2' };
  const value = Number(m[1]);
  const u = (m[2]?.toLowerCase() as LengthUnit | undefined) ?? unit;
  if (!Number.isFinite(value)) return { ok: false, error: 'Not a valid number' };
  const mm = fromUnit(value, u);
  if (mm < 0) return { ok: false, error: 'Must be positive' };
  if (mm === 0 && !opts.allowZero) return { ok: false, error: 'Must be greater than zero' };
  const max = opts.max ?? MAX_LENGTH_MM;
  if (mm > max) return { ok: false, error: `Too large (max ${formatLength(max, 'm')})` };
  return { ok: true, mm };
}

export function measure(mm: number | null, certainty: Certainty = mm === null ? 'unknown' : 'confirmed'): Measure {
  return { mm, certainty: mm === null ? 'unknown' : certainty === 'unknown' ? 'estimated' : certainty };
}

export const UNKNOWN: Measure = { mm: null, certainty: 'unknown' };

export function isKnown(m: Measure | null | undefined): m is Measure & { mm: number } {
  return !!m && m.mm !== null && Number.isFinite(m.mm);
}

const RANK: Record<Certainty, number> = { unknown: 0, estimated: 1, confirmed: 2 };

/** Certainty of a value derived from several inputs = the weakest input. */
export function combineCertainty(...cs: Certainty[]): Certainty {
  if (cs.length === 0) return 'unknown';
  return cs.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
}
