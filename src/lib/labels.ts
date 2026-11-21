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

export type Tone = 'neutral' | 'info' | 'accent' | 'ok' | 'warn' | 'danger' | 'muted';

export const ROOM_TYPES: { value: RoomType; label: string; kind: SpaceKind }[] = [
  { value: 'living-dining', label: 'Living & dining', kind: 'interior' },
  { value: 'living', label: 'Living room', kind: 'interior' },
  { value: 'dining', label: 'Dining room', kind: 'interior' },
  { value: 'kitchen', label: 'Kitchen', kind: 'interior' },
  { value: 'majlis', label: 'Majlis', kind: 'interior' },
  { value: 'family-lounge', label: 'Family lounge', kind: 'interior' },
  { value: 'master-bedroom', label: 'Master bedroom', kind: 'interior' },
  { value: 'bedroom', label: 'Bedroom', kind: 'interior' },
  { value: 'children-bedroom', label: "Children's bedroom", kind: 'interior' },
  { value: 'guest-bedroom', label: 'Guest bedroom', kind: 'interior' },
  { value: 'library', label: 'Library', kind: 'interior' },
  { value: 'office', label: 'Office / study', kind: 'interior' },
  { value: 'bathroom', label: 'Bathroom', kind: 'interior' },
  { value: 'laundry', label: 'Laundry', kind: 'interior' },
  { value: 'entrance', label: 'Entrance / foyer', kind: 'interior' },
  { value: 'corridor', label: 'Corridor', kind: 'interior' },
  { value: 'stairs', label: 'Staircase', kind: 'interior' },
  { value: 'garage', label: 'Garage', kind: 'interior' },
  { value: 'backyard', label: 'Backyard', kind: 'outdoor' },
  { value: 'roof-terrace', label: 'Roof terrace', kind: 'outdoor' },
  { value: 'front-facade', label: 'Front facade', kind: 'facade' },
  { value: 'other', label: 'Other', kind: 'interior' },
];

export function roomTypeLabel(t: RoomType): string {
  return ROOM_TYPES.find((r) => r.value === t)?.label ?? 'Room';
}

export function spaceKind(t: RoomType): SpaceKind {
  return ROOM_TYPES.find((r) => r.value === t)?.kind ?? 'interior';
}

export const ROOM_STATUSES: { value: RoomStatus; label: string; tone: Tone; hint: string }[] = [
  { value: 'not-started', label: 'Not started', tone: 'muted', hint: 'Nothing recorded yet' },
  { value: 'requirements-added', label: 'Requirements added', tone: 'info', hint: 'Brief in progress' },
  { value: 'ready', label: 'Ready to design', tone: 'accent', hint: 'Enough information to generate' },
  { value: 'designing', label: 'Designing', tone: 'accent', hint: 'Concepts being generated' },
  { value: 'review', label: 'Review', tone: 'warn', hint: 'Concepts awaiting a decision' },
  { value: 'approved', label: 'Approved', tone: 'ok', hint: 'A design has been approved' },
  { value: 'needs-revision', label: 'Needs revision', tone: 'danger', hint: 'Changes requested' },
];

export function roomStatusMeta(s: RoomStatus) {
  return ROOM_STATUSES.find((x) => x.value === s) ?? ROOM_STATUSES[0];
}

export const REQUIREMENT_CATEGORIES: { value: RequirementCategory; label: string }[] = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'layout', label: 'Layout' },
  { value: 'storage', label: 'Storage' },
  { value: 'colors', label: 'Colors' },
  { value: 'materials', label: 'Materials' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'architectural', label: 'Architectural constraints' },
  { value: 'functional', label: 'Functional' },
  { value: 'style', label: 'Style' },
  { value: 'other', label: 'Other' },
];

export function categoryLabel(c: RequirementCategory): string {
  return REQUIREMENT_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';
}

export const PRIORITIES: { value: Priority; label: string; tone: Tone; short: string }[] = [
  { value: 'must', label: 'Must have', tone: 'danger', short: 'Must' },
  { value: 'preferred', label: 'Preferred', tone: 'accent', short: 'Preferred' },
  { value: 'optional', label: 'Optional', tone: 'muted', short: 'Optional' },
];

export function priorityMeta(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];
}

export const REQUIREMENT_STATUSES: { value: RequirementStatus; label: string; tone: Tone }[] = [
  { value: 'pending', label: 'Pending', tone: 'muted' },
  { value: 'included', label: 'Included in design', tone: 'ok' },
  { value: 'needs-review', label: 'Needs review', tone: 'warn' },
  { value: 'rejected', label: 'Rejected', tone: 'danger' },
];

export function requirementStatusMeta(s: RequirementStatus) {
  return REQUIREMENT_STATUSES.find((x) => x.value === s) ?? REQUIREMENT_STATUSES[0];
}

export const CERTAINTIES: { value: Certainty; label: string; tone: Tone; hint: string }[] = [
  { value: 'confirmed', label: 'Confirmed', tone: 'ok', hint: 'Measured or verified' },
  { value: 'estimated', label: 'Estimated', tone: 'warn', hint: 'Approximate — not verified' },
  { value: 'unknown', label: 'Unknown', tone: 'muted', hint: 'Not known yet' },
];

export function certaintyMeta(c: Certainty) {
  return CERTAINTIES.find((x) => x.value === c) ?? CERTAINTIES[2];
}

export const REFERENCE_KINDS: { value: ReferenceKind; label: string }[] = [
  { value: 'site-photo', label: 'Site photo' },
  { value: 'plan', label: 'Architectural plan' },
  { value: 'inspiration', label: 'Inspiration' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'material', label: 'Material' },
  { value: 'generated', label: 'Generated design' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'other', label: 'Other' },
];

export function referenceKindLabel(k: ReferenceKind): string {
  return REFERENCE_KINDS.find((x) => x.value === k)?.label ?? 'Image';
}

export const IMAGE_INTENTS: { value: ImageIntent; label: string; hint: string }[] = [
  { value: 'want', label: 'I want this', hint: 'Example of something to include' },
  { value: 'avoid', label: 'Avoid this', hint: 'Example of something NOT wanted' },
  { value: 'neutral', label: 'Context', hint: 'For information only' },
];

export const IMAGE_ASPECTS: { value: ImageAspect; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'layout', label: 'Layout' },
  { value: 'style', label: 'Style' },
  { value: 'material', label: 'Material' },
  { value: 'color', label: 'Color' },
  { value: 'detail', label: 'Specific detail' },
];

export const ELEMENT_TYPES: { value: ElementType; label: string; subtypes: string[]; wallMounted: boolean }[] = [
  { value: 'door', label: 'Door', subtypes: ['Single door', 'Double door', 'Sliding door', 'Pocket door', 'Opening (no door)'], wallMounted: true },
  { value: 'window', label: 'Window', subtypes: ['Window', 'Floor-to-ceiling window', 'Sliding window', 'High window', 'Fixed glazing'], wallMounted: true },
  { value: 'ac', label: 'AC unit', subtypes: ['Wall split unit', 'Ducted grille', 'Floor-standing unit', 'Cassette (ceiling)'], wallMounted: true },
  { value: 'column', label: 'Column', subtypes: ['Column', 'Pilaster'], wallMounted: false },
  { value: 'beam', label: 'Structural beam', subtypes: ['Beam', 'Bulkhead'], wallMounted: false },
  { value: 'recess', label: 'Wall recess', subtypes: ['Niche', 'Recess', 'Alcove'], wallMounted: true },
  { value: 'projection', label: 'Wall projection', subtypes: ['Projection', 'Duct box', 'Chimney breast'], wallMounted: true },
  {
    value: 'electrical',
    label: 'Electrical point',
    subtypes: ['Socket', 'Switch', 'TV / data point', 'Light point', 'Thermostat', 'Panel'],
    wallMounted: true,
  },
  { value: 'other', label: 'Other fixed element', subtypes: ['Fixed element'], wallMounted: true },
];

export function elementTypeMeta(t: ElementType) {
  return ELEMENT_TYPES.find((x) => x.value === t) ?? ELEMENT_TYPES[ELEMENT_TYPES.length - 1];
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

export const FURNITURE_CATEGORIES: { value: FurnitureCategory; label: string }[] = [
  { value: 'sofa', label: 'Sofa' },
  { value: 'armchair', label: 'Armchair' },
  { value: 'bed', label: 'Bed' },
  { value: 'table', label: 'Table' },
  { value: 'dining-table', label: 'Dining table' },
  { value: 'chair', label: 'Chair' },
  { value: 'desk', label: 'Desk' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'storage', label: 'Storage' },
  { value: 'tv-unit', label: 'TV unit' },
  { value: 'island', label: 'Island' },
  { value: 'rug', label: 'Rug' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'plant', label: 'Plant' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

export const VERSION_STATUSES: { value: VersionStatus; label: string; tone: Tone }[] = [
  { value: 'draft', label: 'Draft', tone: 'muted' },
  { value: 'under-review', label: 'Under review', tone: 'warn' },
  { value: 'approved', label: 'Approved', tone: 'ok' },
  { value: 'rejected', label: 'Rejected', tone: 'danger' },
  { value: 'archived', label: 'Archived', tone: 'neutral' },
];

export function versionStatusMeta(s: VersionStatus) {
  return VERSION_STATUSES.find((x) => x.value === s) ?? VERSION_STATUSES[0];
}

export const CAMERA_ANGLES: { value: CameraAngle; label: string; prompt: string }[] = [
  { value: 'match-photo', label: 'Match the photo', prompt: 'Keep exactly the same camera position, height, angle and framing as the base photo.' },
  { value: 'eye-level', label: 'Standing eye level', prompt: 'Standing eye-level view (camera about 1.6 m above the floor).' },
  { value: 'seated', label: 'Seated eye level', prompt: 'Seated eye-level view (camera about 1.1 m above the floor).' },
  { value: 'elevated-corner', label: 'Elevated corner', prompt: 'Slightly elevated view from a corner of the room, showing as much of the space as possible.' },
  { value: 'top-down', label: 'Top-down / axonometric', prompt: 'Top-down cutaway axonometric view of the room showing the furniture layout.' },
  { value: 'detail', label: 'Detail close-up', prompt: 'Close-up detail view focusing on materials and craftsmanship.' },
];

export const TIMES_OF_DAY: { value: TimeOfDay; label: string; prompt: string }[] = [
  { value: 'morning', label: 'Morning', prompt: 'soft morning daylight' },
  { value: 'midday', label: 'Daylight', prompt: 'bright natural daylight' },
  { value: 'golden-hour', label: 'Golden hour', prompt: 'warm late-afternoon golden-hour sunlight' },
  { value: 'evening', label: 'Evening', prompt: 'evening ambience with warm artificial lighting switched on' },
  { value: 'night', label: 'Night', prompt: 'night-time with interior lighting only' },
];

export const LENSES: { value: LensType; label: string; prompt: string }[] = [
  { value: 'standard', label: 'Standard', prompt: 'standard perspective (about 35 mm equivalent), straight vertical lines, no fisheye distortion' },
  { value: 'wide', label: 'Wide angle', prompt: 'wide-angle perspective (about 20 mm equivalent) with corrected vertical lines and minimal distortion' },
];

export const REALISM: { value: Realism; label: string; prompt: string }[] = [
  { value: 'photoreal', label: 'Photorealistic', prompt: 'photorealistic, like professional interior photography' },
  { value: 'archviz', label: 'Architectural render', prompt: 'high-end architectural visualization render' },
  { value: 'soft-render', label: 'Soft render', prompt: 'soft, painterly design render' },
  { value: 'sketch', label: 'Concept sketch', prompt: 'hand-drawn interior concept sketch with light watercolor' },
];

export const ASPECTS: { value: AspectOption; label: string; ratio: string }[] = [
  { value: 'landscape', label: 'Landscape 3:2', ratio: '3:2' },
  { value: 'wide', label: 'Wide 16:9', ratio: '16:9' },
  { value: 'square', label: 'Square 1:1', ratio: '1:1' },
  { value: 'portrait', label: 'Portrait 2:3', ratio: '2:3' },
];

export const QUALITIES: { value: QualityOption; label: string }[] = [
  { value: 'low', label: 'Draft' },
  { value: 'medium', label: 'Standard' },
  { value: 'high', label: 'High' },
];

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

export const IMAGE_ROLE_LABEL: Record<ImageRole, string> = {
  'base-photo': 'Photo to redesign',
  'previous-version': 'Previous concept',
  'site-photo': 'Site photo',
  'wall-photo': 'Wall photo',
  'element-photo': 'Element photo',
  requirement: 'Requirement image',
  direction: 'Direction reference',
  inspiration: 'Inspiration',
  'library-item': 'Library item',
  plan: 'Architectural plan',
  'layout-plan': '2D layout plan',
};

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
