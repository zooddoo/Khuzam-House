/**
 * Arabic text helpers: search normalisation, script detection and digits.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // tashkeel, Quranic marks, tatweel
const ALEF_VARIANTS = /[آأإٱٲٳ]/g; // آ أ إ ٱ …
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** Convert Arabic-Indic and Persian digits (and the Arabic decimal/thousands signs) to ASCII. */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/٫/g, '.') // ٫ decimal separator
    .replace(/٬/g, ','); // ٬ thousands separator
}

/**
 * Normalise text for searching so that أ إ آ ا, ة ه, ى ي, diacritics and
 * tatweel all match, and case is ignored.
 */
export function normalizeForSearch(s: string): string {
  return toAsciiDigits(s)
    .normalize('NFC')
    .replace(DIACRITICS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if every word of the query appears in the text (after normalisation). */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const t = normalizeForSearch(text);
  return q.split(' ').every((w) => t.includes(w));
}

const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(s: string | null | undefined): boolean {
  return !!s && ARABIC_LETTER.test(s);
}

/** Direction to use for a piece of user text that may be in either language. */
export function textDir(s: string | null | undefined): 'rtl' | 'ltr' {
  if (!s) return 'ltr';
  const m = /[A-Za-z؀-ۿ]/.exec(s);
  return m && ARABIC_LETTER.test(m[0]) ? 'rtl' : 'ltr';
}

/** Small, stable hash for keys (translation memory etc.). */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
