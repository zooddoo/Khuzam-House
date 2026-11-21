/**
 * Language and formatting preferences for this device.
 *
 * Kept outside React so that formatting helpers and library code can read
 * the current language synchronously. The I18nProvider keeps it in sync.
 */

export type Lang = 'ar' | 'en';
export type DigitsPref = 'latn' | 'arab';
export type CalendarPref = 'gregory' | 'islamic-umalqura';

export interface LocalePrefs {
  lang: Lang;
  /** Digits used in the Arabic interface (the English interface always uses 0-9). */
  digits: DigitsPref;
  calendar: CalendarPref;
}

export const DEFAULT_PREFS: LocalePrefs = { lang: 'ar', digits: 'latn', calendar: 'gregory' };
const STORAGE_KEY = 'bk.locale';

function read(): LocalePrefs {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<LocalePrefs>;
    return {
      lang: p.lang === 'en' ? 'en' : 'ar',
      digits: p.digits === 'arab' ? 'arab' : 'latn',
      calendar: p.calendar === 'islamic-umalqura' ? 'islamic-umalqura' : 'gregory',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let current: LocalePrefs = read();
const listeners = new Set<() => void>();

export function getPrefs(): LocalePrefs {
  return current;
}

export function setPrefs(next: Partial<LocalePrefs>): void {
  current = { ...current, ...next };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode: preference lasts for this visit only */
  }
  for (const fn of listeners) fn();
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For tests and non-UI code that must produce a given language. */
export function withLang<T>(lang: Lang, fn: () => T): T {
  const prev = current;
  current = { ...current, lang };
  try {
    return fn();
  } finally {
    current = prev;
  }
}

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** BCP-47 locale for Intl formatters, including digits and calendar. */
export function intlLocale(p: LocalePrefs = current, calendar: CalendarPref = 'gregory'): string {
  if (p.lang === 'ar') return `ar-SA-u-ca-${calendar}-nu-${p.digits}`;
  return `en-GB-u-ca-${calendar}`;
}
