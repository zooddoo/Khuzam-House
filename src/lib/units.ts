import type { Certainty, LengthUnit, Measure } from './types';
import { msgs, tr } from '../i18n/messages';
import { num } from '../i18n/format';
import { toAsciiDigits } from '../i18n/arabic';
import { getPrefs, type Lang } from '../i18n/prefs';

/** English unit symbols (prompts, exports). Use unitLabel() in the interface. */
export const UNIT_LABEL: Record<LengthUnit, string> = { mm: 'mm', cm: 'cm', m: 'm' };

/** Unit symbol in the interface language (m / م …). */
export function unitLabel(unit: LengthUnit, lang: Lang = getPrefs().lang): string {
  return msgs(lang).units[unit];
}
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

/** Value formatted for an input field (no unit, trimmed trailing zeros, ASCII digits). */
export function formatInputValue(mm: number | null, unit: LengthUnit): string {
  if (mm === null || !Number.isFinite(mm)) return '';
  const v = toUnit(mm, unit);
  return trimZeros(v.toFixed(DECIMALS[unit]));
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

export interface FormatOpts {
  unknown?: string;
  decimals?: number;
  /** Language of the text; defaults to the interface language. AI prompts pass 'en'. */
  lang?: Lang;
}

/** "6.2 m", "620 cm", "6,200 mm" — or "٦٫٢ م" in Arabic with Arabic digits. */
export function formatLength(mm: number | null, unit: LengthUnit, opts: FormatOpts = {}): string {
  const lang = opts.lang ?? getPrefs().lang;
  if (mm === null || !Number.isFinite(mm)) return opts.unknown ?? msgs(lang).units.unknown;
  const v = toUnit(mm, unit);
  const decimals = opts.decimals ?? (unit === 'm' ? 2 : 0);
  return `${num(v, { lang, max: decimals, grouping: unit === 'mm' })} ${msgs(lang).units[unit]}`;
}

/** Compact "300 × 100 cm" style used for furniture footprints. */
export function formatSize(widthMm: number | null, depthMm: number | null, unit: LengthUnit, lang: Lang = getPrefs().lang): string {
  const f = (mm: number | null) => {
    if (mm === null) return '?';
    const v = toUnit(mm, unit);
    return num(v, { lang, max: unit === 'm' ? 2 : unit === 'cm' ? 1 : 0, grouping: false });
  };
  return `${f(widthMm)} × ${f(depthMm)} ${msgs(lang).units[unit]}`;
}

export function formatArea(mm2: number | null, opts: { unknown?: string; lang?: Lang } = {}): string {
  const lang = opts.lang ?? getPrefs().lang;
  if (mm2 === null || !Number.isFinite(mm2)) return opts.unknown ?? msgs(lang).units.unknown;
  return `${num(mm2 / 1_000_000, { lang, min: 2, max: 2 })} ${msgs(lang).units.m2}`;
}

export function formatVolume(mm3: number | null, lang: Lang = getPrefs().lang): string {
  if (mm3 === null || !Number.isFinite(mm3)) return msgs(lang).units.unknown;
  return `${num(mm3 / 1_000_000_000, { lang, min: 2, max: 2 })} ${msgs(lang).units.m3}`;
}

export type ParseResult = { ok: true; mm: number | null } | { ok: false; error: string };

/**
 * Parse a user-entered length. Accepts plain numbers in the given unit, or an
 * explicit unit suffix ("620cm", "6.2 m", "6200mm"). Empty input = unknown.
 */
const UNIT_WORDS: Record<string, LengthUnit> = { mm: 'mm', cm: 'cm', m: 'm', 'مم': 'mm', 'ملم': 'mm', 'سم': 'cm', 'م': 'm', 'متر': 'm' };

export function parseLength(input: string, unit: LengthUnit, opts: { allowZero?: boolean; max?: number } = {}): ParseResult {
  const t = tr().measure;
  const raw = toAsciiDigits(input).trim().replace(/,/g, '.').replace(/\s+/g, ' ');
  if (raw === '') return { ok: true, mm: null };
  const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|مم|ملم|سم|م|متر)?$/i);
  if (!m) return { ok: false, error: t.enterNumber };
  const value = Number(m[1]);
  const u = (m[2] ? UNIT_WORDS[m[2].toLowerCase()] : undefined) ?? unit;
  if (!Number.isFinite(value)) return { ok: false, error: t.notNumber };
  const mm = fromUnit(value, u);
  if (mm < 0) return { ok: false, error: t.mustBePositive };
  if (mm === 0 && !opts.allowZero) return { ok: false, error: t.mustBeAboveZero };
  const max = opts.max ?? MAX_LENGTH_MM;
  if (mm > max) return { ok: false, error: t.tooLarge(formatLength(max, 'm')) };
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
