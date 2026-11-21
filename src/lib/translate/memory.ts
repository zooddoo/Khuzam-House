import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { nowIso } from '../ids';
import { englishFor, needsEnglish, normalizeSource, translationId } from './core';

export { englishFor, needsEnglish, normalizeSource, translationId };
import type { Translation } from '../types';

/**
 * Translation memory: the English wording for a piece of Arabic text.
 *
 * Design prompts are always written in English. Any Arabic text that goes
 * into a prompt (requirement titles, captions, notes, room names…) is looked
 * up here by its exact text; when the text changes, it needs English again.
 * Translations sync to the cloud like everything else.
 */




export async function setTranslation(source: string, en: string, method: Translation['method'] = 'manual'): Promise<void> {
  const clean = normalizeSource(source);
  if (!clean) return;
  const english = en.trim();
  const id = translationId(clean);
  if (!english) {
    await db.translations.delete(id);
    return;
  }
  await db.translations.put({ id, source: clean, en: english, method, updatedAt: nowIso() });
}

export async function getTranslations(): Promise<Map<string, Translation>> {
  const all = await db.translations.toArray();
  return new Map(all.map((t) => [t.id, t]));
}


export function useTranslationOf(text: string | null | undefined): Translation | null | undefined {
  return useLiveQuery(async () => (text && needsEnglish(text) ? ((await db.translations.get(translationId(text))) ?? null) : null), [text]);
}
