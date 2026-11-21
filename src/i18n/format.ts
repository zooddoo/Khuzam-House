import { getPrefs, intlLocale, type Lang } from './prefs';

/**
 * Locale-aware formatting for numbers, dates, sizes and plurals.
 * Every number shown in the interface goes through `num()` so the digit
 * preference (123 / ١٢٣) applies everywhere.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const p = getPrefs();
  const locale = lang === 'ar' ? `ar-SA-u-nu-${p.digits}` : 'en-GB';
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numberFormats.set(key, f);
  }
  return f;
}

export interface NumOpts {
  /** Maximum fraction digits (default 2). */
  max?: number;
  /** Minimum fraction digits (default 0). */
  min?: number;
  /** Thousands separators (default true). */
  grouping?: boolean;
  lang?: Lang;
}

export function num(n: number, opts: NumOpts = {}): string {
  if (!Number.isFinite(n)) return '—';
  const lang = opts.lang ?? getPrefs().lang;
  return numberFormat(lang, {
    maximumFractionDigits: opts.max ?? 2,
    minimumFractionDigits: opts.min ?? 0,
    useGrouping: opts.grouping ?? true,
  }).format(n);
}

/** Format digits inside an already-built string (e.g. "v12" → "v١٢"). */
export function digits(s: string, lang: Lang = getPrefs().lang): string {
  if (lang !== 'ar' || getPrefs().digits !== 'arab') return s;
  return s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]).replace(/(\d)\.(\d)/g, '$1٫$2');
}

export interface PluralForms {
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

/** Pick the plural form for `n` in `lang`; `{n}` in the form is replaced by the formatted number. */
export function pluralIn(lang: Lang, n: number, forms: PluralForms): string {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  const cat = (n === 0 && forms.zero !== undefined ? 'zero' : rules.select(n)) as keyof PluralForms;
  const form = forms[cat] ?? forms.other;
  return form.replace('{n}', num(n, { lang }));
}

export function makePlural(lang: Lang) {
  return (n: number, forms: PluralForms) => pluralIn(lang, n, forms);
}

/* Dates ------------------------------------------------------------- */

const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const p = getPrefs();
  const locale = intlLocale(p, p.calendar);
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dateFormats.set(key, f);
  }
  return f;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—';
}

export function fmtDateLong(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? dateFormat({ day: 'numeric', month: 'long', year: 'numeric' }).format(d) : '—';
}

export function fmtDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? dateFormat({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : '—';
}

export function fmtTime(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const d = typeof iso === 'number' ? new Date(iso) : parse(iso);
  return d ? dateFormat({ hour: '2-digit', minute: '2-digit' }).format(d) : '—';
}

const relFormats = new Map<string, Intl.RelativeTimeFormat>();

export function timeAgo(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const p = getPrefs();
  const locale = p.lang === 'ar' ? `ar-u-nu-${p.digits}` : 'en-GB';
  let rtf = relFormats.get(locale);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relFormats.set(locale, rtf);
  }
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  return fmtDate(iso);
}

/* Sizes, durations, money -------------------------------------------- */

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const lang = getPrefs().lang;
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return numberFormat(lang, {
    style: 'unit',
    unit: units[i],
    unitDisplay: lang === 'ar' ? 'long' : 'short',
    maximumFractionDigits: i === 0 ? 0 : v < 10 ? 1 : 0,
  }).format(v);
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const lang = getPrefs().lang;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (lang === 'ar') return m ? `${num(m)} د ${num(rest)} ث` : `${num(s)} ث`;
  return m ? `${m}m ${String(rest).padStart(2, '0')}s` : `${s}s`;
}

export function fmtPercent(fraction: number): string {
  const lang = getPrefs().lang;
  return numberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(Math.max(0, Math.min(1, fraction)));
}

export function fmtPrice(price: number | null, currency: string): string {
  if (price === null || !Number.isFinite(price)) return '';
  const lang = getPrefs().lang;
  const cur = currency || 'SAR';
  const label = lang === 'ar' && cur.toUpperCase() === 'SAR' ? 'ر.س' : cur;
  return `${num(price, { max: 2 })} ${label}`;
}
