import { hasArabic, stableHash } from '../../i18n/arabic';
import type { Translation } from '../types';

export function normalizeSource(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function translationId(text: string): string {
  return `tr_${stableHash(normalizeSource(text))}`;
}

/** True when the text must be put into English before it can go into a prompt. */
export function needsEnglish(text: string | null | undefined): boolean {
  return !!text && hasArabic(text);
}

/** English for a text: the text itself if it has no Arabic, its saved translation, or null. */
export function englishFor(text: string, memory: Map<string, Translation>): string | null {
  if (!needsEnglish(text)) return text;
  return memory.get(translationId(text))?.en ?? null;
}
