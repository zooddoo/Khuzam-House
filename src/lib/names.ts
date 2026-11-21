import type { Lang } from '../i18n/prefs';
import { getPrefs } from '../i18n/prefs';
import type { DirectionPreset, Floor, Project, Room } from './types';

/**
 * Bilingual names. English names are what AI prompts use; Arabic names are
 * shown first in the Arabic interface. Either may be missing.
 */
export function roomDisplayName(room: Pick<Room, 'name' | 'nameAr'> | null | undefined, lang: Lang = getPrefs().lang): string {
  if (!room) return '';
  return (lang === 'ar' ? room.nameAr?.trim() || room.name : room.name?.trim() || room.nameAr) ?? '';
}

/** The other-language name, when it exists and differs (e.g. "Majlis" under "المجلس"). */
export function roomSecondaryName(room: Pick<Room, 'name' | 'nameAr'> | null | undefined, lang: Lang = getPrefs().lang): string {
  if (!room) return '';
  const other = lang === 'ar' ? room.name : room.nameAr;
  const primary = roomDisplayName(room, lang);
  return other && other.trim() && other.trim() !== primary ? other.trim() : '';
}

export function floorDisplayName(floor: Pick<Floor, 'name' | 'nameAr'> | null | undefined, lang: Lang = getPrefs().lang): string {
  if (!floor) return '';
  return (lang === 'ar' ? floor.nameAr?.trim() || floor.name : floor.name?.trim() || floor.nameAr) ?? '';
}

export function projectDisplayName(project: Pick<Project, 'name' | 'nameAr'> | null | undefined, lang: Lang = getPrefs().lang): string {
  if (!project) return lang === 'ar' ? 'بيت خزام' : 'Bait Khuzam';
  return (lang === 'ar' ? project.nameAr?.trim() || project.name : project.name?.trim() || project.nameAr) ?? '';
}

export function projectLocation(project: Pick<Project, 'location' | 'locationAr'> | null | undefined, lang: Lang = getPrefs().lang): string {
  if (!project) return '';
  return (lang === 'ar' ? project.locationAr?.trim() || project.location : project.location?.trim() || project.locationAr) ?? '';
}

export function presetDisplayName(p: Pick<DirectionPreset, 'name' | 'nameAr'>, lang: Lang = getPrefs().lang): string {
  return (lang === 'ar' ? p.nameAr?.trim() || p.name : p.name?.trim() || p.nameAr) ?? '';
}

export function presetSummary(p: Pick<DirectionPreset, 'summary' | 'summaryAr'>, lang: Lang = getPrefs().lang): string {
  return (lang === 'ar' ? p.summaryAr?.trim() || p.summary : p.summary?.trim() || p.summaryAr) ?? '';
}
