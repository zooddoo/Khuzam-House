import { msgs } from '../../i18n/messages';
import { num } from '../../i18n/format';
import { getPrefs, type Lang } from '../../i18n/prefs';

const COMPASS_WORD: Record<string, string> = {
  North: 'N',
  'North-east': 'NE',
  East: 'E',
  'South-east': 'SE',
  South: 'S',
  'South-west': 'SW',
  West: 'W',
  'North-west': 'NW',
};

/**
 * Display name of a wall in the interface language. Walls keep English
 * names in the data (used in AI prompts); automatic names ("North",
 * "North (step)", "East 2") are translated, names typed by the owner are
 * shown as typed.
 */
export function wallTitle(w: { name: string; autoName?: boolean; wall?: { autoName?: boolean } | null }, lang: Lang = getPrefs().lang): string {
  const g = msgs(lang).geo;
  const auto = w.autoName ?? w.wall?.autoName ?? true;
  if (!auto) return w.name;
  const m = /^(North-east|North-west|South-east|South-west|North|South|East|West)( \(step\))?(?: (\d+))?$/.exec(w.name.trim());
  if (!m) return w.name;
  return g.wall(g.compass[COMPASS_WORD[m[1]]], !!m[2], m[3] ? num(Number(m[3]), { lang }) : '');
}

/** Compass point name ("North" / "الشمالي"). */
export function compassName(code: string, lang: Lang = getPrefs().lang): string {
  return msgs(lang).geo.compass[code] ?? code;
}
