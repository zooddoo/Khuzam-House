import { msgs, tr } from '../i18n/messages';
import type { Lang } from '../i18n/prefs';
import type {
  AspectOption,
  CameraAngle,
  Certainty,
  ElementType,
  FurnitureCategory,
  ImageAspect,
  ImageIntent,
  ImageRole,
  LensType,
  Priority,
  QualityOption,
  Realism,
  ReferenceKind,
  RequirementCategory,
  RequirementStatus,
  RoomStatus,
  RoomType,
  SpaceKind,
  TimeOfDay,
  VersionStatus,
} from './types';

/**
 * Option lists for the interface. `label`/`hint` are getters that read the
 * current interface language, so the lists can be used directly in selects.
 * Values (and anything sent to an AI model) stay in English.
 */
function dict(lang?: Lang) {
  return lang ? msgs(lang) : tr();
}

export type Tone = 'neutral' | 'info' | 'accent' | 'ok' | 'warn' | 'danger' | 'muted';

const ROOM_TYPE_KINDS: [RoomType, SpaceKind][] = [['living-dining', 'interior'], ['living', 'interior'], ['dining', 'interior'], ['kitchen', 'interior'], ['majlis', 'interior'], ['family-lounge', 'interior'], ['master-bedroom', 'interior'], ['bedroom', 'interior'], ['children-bedroom', 'interior'], ['guest-bedroom', 'interior'], ['library', 'interior'], ['office', 'interior'], ['bathroom', 'interior'], ['laundry', 'interior'], ['entrance', 'interior'], ['corridor', 'interior'], ['stairs', 'interior'], ['garage', 'interior'], ['backyard', 'outdoor'], ['roof-terrace', 'outdoor'], ['front-facade', 'facade'], ['other', 'interior']];

export const ROOM_TYPES: { value: RoomType; readonly label: string; kind: SpaceKind }[] = ROOM_TYPE_KINDS.map(([value, kind]) => ({
  value,
  kind,
  get label() {
    return tr().enums.roomType[value];
  },
}));

export function roomTypeLabel(t: RoomType, lang?: Lang): string {
  return dict(lang).enums.roomType[t] ?? dict(lang).enums.roomType.other;
}

export function spaceKind(t: RoomType): SpaceKind {
  return ROOM_TYPES.find((r) => r.value === t)?.kind ?? 'interior';
}

const ROOM_STATUS_TONES: [RoomStatus, Tone][] = [['not-started', 'muted'], ['requirements-added', 'info'], ['ready', 'accent'], ['designing', 'accent'], ['review', 'warn'], ['approved', 'ok'], ['needs-revision', 'danger']];

export const ROOM_STATUSES: { value: RoomStatus; readonly label: string; tone: Tone; readonly hint: string }[] = ROOM_STATUS_TONES.map(([value, tone]) => ({
  value,
  tone,
  get label() {
    return tr().enums.roomStatus[value];
  },
  get hint() {
    return tr().enums.roomStatusHint[value];
  },
}));

export function roomStatusLabel(st: RoomStatus, lang?: Lang): string {
  return dict(lang).enums.roomStatus[st] ?? st;
}

export function roomStatusMeta(s: RoomStatus) {
  return ROOM_STATUSES.find((x) => x.value === s) ?? ROOM_STATUSES[0];
}

export const REQUIREMENT_CATEGORIES: { value: RequirementCategory; readonly label: string }[] = (
  ['furniture', 'layout', 'storage', 'colors', 'materials', 'lighting', 'architectural', 'functional', 'style', 'other'] as RequirementCategory[]
).map((value) => ({
  value,
  get label() {
    return tr().enums.category[value];
  },
}));

export function categoryLabel(c: RequirementCategory, lang?: Lang): string {
  return dict(lang).enums.category[c] ?? dict(lang).enums.category.other;
}

const PRIORITY_TONES: [Priority, Tone][] = [['must', 'danger'], ['preferred', 'accent'], ['optional', 'muted']];

export const PRIORITIES: { value: Priority; readonly label: string; tone: Tone; readonly short: string }[] = PRIORITY_TONES.map(([value, tone]) => ({
  value,
  tone,
  get label() {
    return tr().enums.priority[value];
  },
  get short() {
    return tr().enums.priorityShort[value];
  },
}));

export function priorityLabel(p: Priority, lang?: Lang): string {
  return dict(lang).enums.priority[p] ?? p;
}

export function priorityMeta(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];
}

const REQ_STATUS_TONES: [RequirementStatus, Tone][] = [['pending', 'muted'], ['included', 'ok'], ['needs-review', 'warn'], ['rejected', 'danger']];

export const REQUIREMENT_STATUSES: { value: RequirementStatus; readonly label: string; tone: Tone }[] = REQ_STATUS_TONES.map(([value, tone]) => ({
  value,
  tone,
  get label() {
    return tr().enums.reqStatus[value];
  },
}));

export function requirementStatusMeta(s: RequirementStatus) {
  return REQUIREMENT_STATUSES.find((x) => x.value === s) ?? REQUIREMENT_STATUSES[0];
}

const CERTAINTY_TONES: [Certainty, Tone][] = [['confirmed', 'ok'], ['estimated', 'warn'], ['unknown', 'muted']];

export const CERTAINTIES: { value: Certainty; readonly label: string; tone: Tone; readonly hint: string }[] = CERTAINTY_TONES.map(([value, tone]) => ({
  value,
  tone,
  get label() {
    return tr().enums.certainty[value];
  },
  get hint() {
    return tr().enums.certaintyHint[value];
  },
}));

export function certaintyLabel(c: Certainty, lang?: Lang): string {
  return dict(lang).enums.certainty[c] ?? c;
}

export function certaintyMeta(c: Certainty) {
  return CERTAINTIES.find((x) => x.value === c) ?? CERTAINTIES[2];
}

export const REFERENCE_KINDS: { value: ReferenceKind; readonly label: string }[] = (
  ['site-photo', 'plan', 'inspiration', 'furniture', 'material', 'generated', 'screenshot', 'document', 'other'] as ReferenceKind[]
).map((value) => ({
  value,
  get label() {
    return tr().enums.refKind[value];
  },
}));

export function referenceKindLabel(k: ReferenceKind, lang?: Lang): string {
  return dict(lang).enums.refKind[k] ?? dict(lang).enums.refKind.other;
}

export const IMAGE_INTENTS: { value: ImageIntent; readonly label: string; readonly hint: string }[] = (['want', 'avoid', 'neutral'] as ImageIntent[]).map((value) => ({
  value,
  get label() {
    return tr().enums.intent[value];
  },
  get hint() {
    return tr().enums.intentHint[value];
  },
}));

export const IMAGE_ASPECTS: { value: ImageAspect; readonly label: string }[] = (
  ['general', 'furniture', 'layout', 'style', 'material', 'color', 'detail'] as ImageAspect[]
).map((value) => ({
  value,
  get label() {
    return tr().enums.imageAspect[value];
  },
}));

const ELEMENT_TYPE_DEFS: { value: ElementType; subtypes: string[]; wallMounted: boolean }[] = [
  { value: 'door', subtypes: ['Single door', 'Double door', 'Sliding door', 'Pocket door', 'Opening (no door)'], wallMounted: true },
  { value: 'window', subtypes: ['Window', 'Floor-to-ceiling window', 'Sliding window', 'High window', 'Fixed glazing'], wallMounted: true },
  { value: 'ac', subtypes: ['Wall split unit', 'Ducted grille', 'Floor-standing unit', 'Cassette (ceiling)'], wallMounted: true },
  { value: 'column', subtypes: ['Column', 'Pilaster'], wallMounted: false },
  { value: 'beam', subtypes: ['Beam', 'Bulkhead'], wallMounted: false },
  { value: 'recess', subtypes: ['Niche', 'Recess', 'Alcove'], wallMounted: true },
  { value: 'projection', subtypes: ['Projection', 'Duct box', 'Chimney breast'], wallMounted: true },
  {
    value: 'electrical',
    subtypes: ['Socket', 'Switch', 'TV / data point', 'Light point', 'Thermostat', 'Panel'],
    wallMounted: true,
  },
  { value: 'other', subtypes: ['Fixed element'], wallMounted: true },
];

export const ELEMENT_TYPES: { value: ElementType; readonly label: string; subtypes: string[]; wallMounted: boolean }[] = ELEMENT_TYPE_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.elementType[d.value];
  },
}));

export function elementTypeMeta(t: ElementType) {
  return ELEMENT_TYPES.find((x) => x.value === t) ?? ELEMENT_TYPES[ELEMENT_TYPES.length - 1];
}

export function elementTypeLabel(t: ElementType, lang?: Lang): string {
  return dict(lang).enums.elementType[t] ?? dict(lang).enums.elementType.other;
}

/** Subtypes are stored in English; show the translation when one exists. */
export function subtypeLabel(subtype: string, lang?: Lang): string {
  return dict(lang).enums.elementSubtype[subtype] ?? subtype;
}

/** Furniture created from a preset keeps the English preset name; show it translated. */
export function furnitureNameLabel(name: string, lang?: Lang): string {
  return dict(lang).enums.furniturePreset[name] ?? name;
}

export interface FurniturePreset {
  label: string;
  category: FurnitureCategory;
  width: number;
  depth: number;
  height: number | null;
  shape?: 'rect' | 'round';
  layer?: 'floor' | 'standard';
}

/**
 * Typical sizes offered as a starting point only. Items created from these
 * are marked "estimated" until real dimensions are entered.
 */
export const FURNITURE_PRESETS: FurniturePreset[] = [
  { label: 'Sofa (3-seat)', category: 'sofa', width: 2200, depth: 950, height: 800 },
  { label: 'Sofa (large)', category: 'sofa', width: 3000, depth: 1000, height: 800 },
  { label: 'Armchair', category: 'armchair', width: 850, depth: 850, height: 800 },
  { label: 'Coffee table', category: 'table', width: 1200, depth: 600, height: 400 },
  { label: 'Side table', category: 'table', width: 500, depth: 500, height: 550, shape: 'round' },
  { label: 'Dining table', category: 'dining-table', width: 2000, depth: 1000, height: 750 },
  { label: 'Round dining table', category: 'dining-table', width: 1200, depth: 1200, height: 750, shape: 'round' },
  { label: 'Dining chair', category: 'chair', width: 500, depth: 550, height: 850 },
  { label: 'Bed (king)', category: 'bed', width: 2000, depth: 2100, height: 1100 },
  { label: 'Bed (queen)', category: 'bed', width: 1600, depth: 2100, height: 1100 },
  { label: 'Bed (single)', category: 'bed', width: 1000, depth: 2000, height: 900 },
  { label: 'Nightstand', category: 'storage', width: 500, depth: 400, height: 550 },
  { label: 'Wardrobe', category: 'cabinet', width: 2000, depth: 600, height: 2400 },
  { label: 'Desk', category: 'desk', width: 1400, depth: 700, height: 750 },
  { label: 'Desk chair', category: 'chair', width: 600, depth: 600, height: 1000 },
  { label: 'TV unit', category: 'tv-unit', width: 2000, depth: 450, height: 500 },
  { label: 'Bookshelf', category: 'storage', width: 1000, depth: 350, height: 2000 },
  { label: 'Sideboard', category: 'cabinet', width: 1800, depth: 450, height: 800 },
  { label: 'Kitchen island', category: 'island', width: 2200, depth: 900, height: 900 },
  { label: 'Rug', category: 'rug', width: 3000, depth: 2000, height: null, layer: 'floor' },
  { label: 'Floor lamp', category: 'lighting', width: 400, depth: 400, height: 1600, shape: 'round' },
  { label: 'Plant', category: 'plant', width: 500, depth: 500, height: 1200, shape: 'round' },
  { label: 'Outdoor lounge set', category: 'outdoor', width: 2400, depth: 1800, height: 750 },
];

export const FURNITURE_CATEGORIES: { value: FurnitureCategory; readonly label: string }[] = (
  ['sofa', 'armchair', 'bed', 'table', 'dining-table', 'chair', 'desk', 'cabinet', 'storage', 'tv-unit', 'island', 'rug', 'lighting', 'plant', 'outdoor', 'other'] as FurnitureCategory[]
).map((value) => ({
  value,
  get label() {
    return tr().enums.furnitureCategory[value];
  },
}));

const VERSION_STATUS_TONES: [VersionStatus, Tone][] = [['draft', 'muted'], ['under-review', 'warn'], ['approved', 'ok'], ['rejected', 'danger'], ['archived', 'neutral']];

export const VERSION_STATUSES: { value: VersionStatus; readonly label: string; tone: Tone }[] = VERSION_STATUS_TONES.map(([value, tone]) => ({
  value,
  tone,
  get label() {
    return tr().enums.versionStatus[value];
  },
}));

export function versionStatusMeta(s: VersionStatus) {
  return VERSION_STATUSES.find((x) => x.value === s) ?? VERSION_STATUSES[0];
}

const CAMERA_ANGLES_DEFS: { value: CameraAngle; prompt: string }[] = [
  { value: 'match-photo', prompt: 'Keep exactly the same camera position, height, angle and framing as the base photo.' },
  { value: 'eye-level', prompt: 'Standing eye-level view (camera about 1.6 m above the floor).' },
  { value: 'seated', prompt: 'Seated eye-level view (camera about 1.1 m above the floor).' },
  { value: 'elevated-corner', prompt: 'Slightly elevated view from a corner of the room, showing as much of the space as possible.' },
  { value: 'top-down', prompt: 'Top-down cutaway axonometric view of the room showing the furniture layout.' },
  { value: 'detail', prompt: 'Close-up detail view focusing on materials and craftsmanship.' },
];

export const CAMERA_ANGLES: { value: CameraAngle; readonly label: string; prompt: string }[] = CAMERA_ANGLES_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.cameraAngle[d.value];
  },
}));

const TIMES_OF_DAY_DEFS: { value: TimeOfDay; prompt: string }[] = [
  { value: 'morning', prompt: 'soft morning daylight' },
  { value: 'midday', prompt: 'bright natural daylight' },
  { value: 'golden-hour', prompt: 'warm late-afternoon golden-hour sunlight' },
  { value: 'evening', prompt: 'evening ambience with warm artificial lighting switched on' },
  { value: 'night', prompt: 'night-time with interior lighting only' },
];

export const TIMES_OF_DAY: { value: TimeOfDay; readonly label: string; prompt: string }[] = TIMES_OF_DAY_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.timeOfDay[d.value];
  },
}));

const LENSES_DEFS: { value: LensType; prompt: string }[] = [
  { value: 'standard', prompt: 'standard perspective (about 35 mm equivalent), straight vertical lines, no fisheye distortion' },
  { value: 'wide', prompt: 'wide-angle perspective (about 20 mm equivalent) with corrected vertical lines and minimal distortion' },
];

export const LENSES: { value: LensType; readonly label: string; prompt: string }[] = LENSES_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.lens[d.value];
  },
}));

const REALISM_DEFS: { value: Realism; prompt: string }[] = [
  { value: 'photoreal', prompt: 'photorealistic, like professional interior photography' },
  { value: 'archviz', prompt: 'high-end architectural visualization render' },
  { value: 'soft-render', prompt: 'soft, painterly design render' },
  { value: 'sketch', prompt: 'hand-drawn interior concept sketch with light watercolor' },
];

export const REALISM: { value: Realism; readonly label: string; prompt: string }[] = REALISM_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.realism[d.value];
  },
}));

const ASPECTS_DEFS: { value: AspectOption; ratio: string }[] = [
  { value: 'landscape', ratio: '3:2' },
  { value: 'wide', ratio: '16:9' },
  { value: 'square', ratio: '1:1' },
  { value: 'portrait', ratio: '2:3' },
];

export const ASPECTS: { value: AspectOption; readonly label: string; ratio: string }[] = ASPECTS_DEFS.map((d) => ({
  ...d,
  get label() {
    return tr().enums.aspectRatio[d.value];
  },
}));

export const QUALITIES: { value: QualityOption; readonly label: string }[] = (['low', 'medium', 'high'] as QualityOption[]).map((value) => ({
  value,
  get label() {
    return tr().enums.quality[value];
  },
}));

export const PRIORITIZE_OPTIONS: string[] = [
  'Architectural accuracy',
  'Requirement fidelity',
  'Material realism',
  'Lighting mood',
  'Furniture layout',
  'Color palette',
  'Sense of space',
];

export const AVOID_SUGGESTIONS: string[] = ['clutter', 'people', 'text or watermarks', 'distorted proportions', 'extra windows or doors', 'over-styled decor'];

/** Prioritise options and avoid suggestions are stored in English; show them translated. */
export function prioritizeLabel(value: string, lang?: Lang): string {
  return dict(lang).enums.prioritize[value] ?? value;
}

export function avoidSuggestionLabel(value: string, lang?: Lang): string {
  return dict(lang).enums.avoidSuggestion[value] ?? value;
}

/** Role labels in English (used in prompts and image labels sent to providers). */
export const IMAGE_ROLE_LABEL: Record<ImageRole, string> = msgs('en').enums.imageRole;

export function imageRoleLabel(role: ImageRole, lang?: Lang): string {
  return dict(lang).enums.imageRole[role] ?? role;
}

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  muted: 'bg-ink-4',
  info: 'bg-info',
  accent: 'bg-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-2',
  muted: 'text-ink-3',
  info: 'text-info',
  accent: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
};

export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-mist text-ink-2',
  muted: 'bg-mist text-ink-3',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
};

/** Hex values for tones, for SVG drawings where utility classes can't be used. */
export const TONE_HEX: Record<Tone, string> = {
  neutral: '#877d70',
  muted: '#b4aa9b',
  info: '#566676',
  accent: '#8e5b3c',
  ok: '#5e7250',
  warn: '#9a6f22',
  danger: '#9e3f33',
};
