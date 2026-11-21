import { en, type Messages } from './locales/en';
import { ar } from './locales/ar';
import { getPrefs, type Lang } from './prefs';

export type { Messages };

const DICTS: Record<Lang, Messages> = { en, ar };

/** Messages for a specific language (e.g. English for AI prompts). */
export function msgs(lang: Lang): Messages {
  return DICTS[lang];
}

/** Messages in the current interface language — for code outside React components. */
export function tr(): Messages {
  return DICTS[getPrefs().lang];
}
