/**
 * Bait Khuzam Studio — typed data model.
 *
 * Conventions
 * - All lengths are stored in millimetres. Display units are a view concern.
 * - `null` means "unknown". Unknown values are never replaced by guesses.
 * - Every measured fact carries a certainty so confirmed facts can be
 *   distinguished from estimates.
 */

export type ID = string;
/** ISO-8601 timestamp */
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

export type LengthUnit = 'mm' | 'cm' | 'm';
export type Certainty = 'confirmed' | 'estimated' | 'unknown';

export interface Measure {
  /** Value in millimetres. `null` = unknown. */
  mm: number | null;
  /** Always 'unknown' when `mm` is null. */
  certainty: Certainty;
}

/* ------------------------------------------------------------------ */
/* Project & floors                                                     */
/* ------------------------------------------------------------------ */

export interface Project {
  id: 'project';
  /** English name (used in AI prompts). */
  name: string;
  /** Arabic name, shown in the Arabic interface. */
  nameAr?: string;
  location: string;
  locationAr?: string;
  description: string;
  coverReferenceId: ID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface FloorPlanCalibration {
  /** Image pixels per millimetre, derived from two user-picked points. */
  pxPerMm: number;
  /** Position of the image's top-left corner in plan millimetres. */
  offsetX: number;
  offsetY: number;
}

export interface Floor {
  id: ID;
  name: string;
  nameAr?: string;
  order: number;
  /** Uploaded architectural plan used as the basis, if any. */
  planReferenceId: ID | null;
  planCalibration: FloorPlanCalibration | null;
  planOpacity: number;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Rooms                                                                */
/* ------------------------------------------------------------------ */

export type RoomType =
  | 'living-dining'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'majlis'
  | 'family-lounge'
  | 'master-bedroom'
  | 'bedroom'
  | 'children-bedroom'
  | 'guest-bedroom'
  | 'library'
  | 'office'
  | 'bathroom'
  | 'laundry'
  | 'entrance'
  | 'corridor'
  | 'stairs'
  | 'garage'
  | 'backyard'
  | 'roof-terrace'
  | 'front-facade'
  | 'other';

export type SpaceKind = 'interior' | 'outdoor' | 'facade';

export type RoomStatus = 'not-started' | 'requirements-added' | 'ready' | 'designing' | 'review' | 'approved' | 'needs-revision';

export type RoomShape = 'rectangle' | 'l-shape' | 'custom';
export type Corner = 'nw' | 'ne' | 'se' | 'sw';

export interface RoomGeometry {
  shape: RoomShape;
  /** East–west extent (rectangle / L-shape bounding box). */
  length: Measure;
  /** North–south extent (rectangle / L-shape bounding box). */
  width: Measure;
  /** L-shape: the rectangular part removed from one corner of the bounding box. */
  lCutout: { length: Measure; width: Measure; corner: Corner };
  /**
   * Custom shapes: plan position where the first wall starts. Kept fixed so
   * editing a wall never silently shifts furniture relative to the room.
   */
  customOrigin: { x: number; y: number };
  /** Free-text: how the dimensions were obtained. */
  source: string;
}

export interface WallDesign {
  cladding: string;
  artwork: string;
  tv: string;
  lighting: string;
  furniture: string;
  other: string;
}

export interface Wall {
  /** Stable id. Rectangles use N/E/S/W; L-shapes add N2/E2/S2/W2 for step walls. */
  id: ID;
  name: string;
  /** True while the name still follows the generated default. */
  autoName: boolean;
  /** Custom shapes only: the user-entered wall length. Derived for other shapes. */
  length: Measure;
  /** Custom shapes only: direction of travel when walking the walls clockwise (0 = east, 90 = south). */
  heading: number;
  /** When false, the wall uses the room's ceiling height. */
  heightOverride: boolean;
  height: Measure;
  notes: string;
  design: WallDesign;
}

export type ElementType = 'door' | 'window' | 'ac' | 'column' | 'beam' | 'recess' | 'projection' | 'electrical' | 'other';

export type DoorSwing = 'in' | 'out' | 'sliding' | 'opening';

export interface ArchElement {
  id: ID;
  type: ElementType;
  /** e.g. "Double door", "Split AC", "Socket", "Floor-to-ceiling window" */
  subtype: string;
  label: string;
  placement: 'wall' | 'free';
  wallId: ID | null;
  /** Distance from the wall's left end, as seen from inside the room (mm). */
  offset: number | null;
  /** Free placement: centre position in plan millimetres. */
  x: number | null;
  y: number | null;
  rotation: number;
  width: number | null;
  height: number | null;
  /** Projection into the room (AC units, projections) or depth (recesses, beams). */
  depth: number | null;
  /** Bottom of the element above finished floor (window sill, AC mounting height…). */
  elevation: number | null;
  door: { hinge: 'left' | 'right'; swing: DoorSwing } | null;
  status: Certainty;
  /** Instruct the AI to keep this element exactly as is. */
  preserve: boolean;
  notes: string;
}

export type FurnitureCategory =
  | 'sofa'
  | 'armchair'
  | 'bed'
  | 'table'
  | 'dining-table'
  | 'chair'
  | 'desk'
  | 'cabinet'
  | 'storage'
  | 'tv-unit'
  | 'island'
  | 'rug'
  | 'lighting'
  | 'plant'
  | 'outdoor'
  | 'other';

export interface FurnitureItem {
  id: ID;
  name: string;
  category: FurnitureCategory;
  shape: 'rect' | 'round';
  /** Centre, plan millimetres (origin = north-west corner of the room's bounding box). */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number | null;
  rotation: number;
  /** 'confirmed' = real product/measured dimensions; 'estimated' = typical or approximate. */
  dimsStatus: 'confirmed' | 'estimated';
  /** Rugs sit under furniture and are excluded from overlap checks. */
  layer: 'floor' | 'standard';
  color: string;
  notes: string;
  libraryItemId: ID | null;
  locked: boolean;
  ignoreClearance: boolean;
}

export interface LayoutChecks {
  overlap: boolean;
  bounds: boolean;
  doors: boolean;
  windows: boolean;
  ac: boolean;
  clearance: boolean;
  architecture: boolean;
}

export interface RoomLayout {
  items: FurnitureItem[];
  /** Minimum walking clearance (mm). User defined. */
  clearanceMm: number;
  checks: LayoutChecks;
  gridMm: number;
  snap: boolean;
}

export interface PaletteColor {
  id: ID;
  hex: string;
  name: string;
  role: string;
}

export interface DesignDirectionFields {
  style: string;
  atmosphere: string;
  palette: PaletteColor[];
  paletteNotes: string;
  materials: string;
  woodType: string;
  flooring: string;
  wallFinishes: string;
  furnitureStyle: string;
  lighting: string;
  curtains: string;
  description: string;
  avoid: string;
}

export interface DesignDirection extends DesignDirectionFields {
  /** The preset this direction was started from (informational only). */
  presetId: ID | null;
  presetName: string;
  updatedAt: ISODate | null;
}

export interface Room {
  id: ID;
  /** English name — used in AI prompts. */
  name: string;
  /** Arabic name — shown first in the Arabic interface. */
  nameAr?: string;
  type: RoomType;
  floorId: ID | null;
  status: RoomStatus;
  coverReferenceId: ID | null;
  description: string;
  displayUnit: LengthUnit;
  geometry: RoomGeometry;
  ceilingHeight: Measure;
  walls: Wall[];
  elements: ArchElement[];
  layout: RoomLayout;
  direction: DesignDirection;
  /** Earlier conceptual idea carried over from the brief. Never applied automatically. */
  preliminaryConcept: string;
  preliminaryConceptAr?: string;
  /** User-listed things that must not change in any design. */
  fixedConstraints: string[];
  /** Opt-in: include house-wide guidelines in this room's generations. */
  useHouseGuidelines: boolean;
  approvedVersionId: ID | null;
  /** Position on the floor plan schematic (plan millimetres). */
  planPlacement: { x: number; y: number; rotation: number } | null;
  /** Last generation settings, remembered per room. */
  lastGeneration: GenerationSettings | null;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Requirements                                                         */
/* ------------------------------------------------------------------ */

export type RequirementCategory = 'furniture' | 'layout' | 'storage' | 'colors' | 'materials' | 'lighting' | 'architectural' | 'functional' | 'style' | 'other';

export type Priority = 'must' | 'preferred' | 'optional';
export type RequirementStatus = 'pending' | 'included' | 'needs-review' | 'rejected';

export interface Requirement {
  id: ID;
  roomId: ID;
  title: string;
  description: string;
  category: RequirementCategory;
  priority: Priority;
  status: RequirementStatus;
  /** 'avoid' = an exclusion: something the user does NOT want. */
  kind: 'want' | 'avoid';
  /** Optional custom group label, e.g. "Reading corner". */
  group: string;
  notes: string;
  source: string;
  primaryReferenceId: ID | null;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Images & references                                                  */
/* ------------------------------------------------------------------ */

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'document' | 'spreadsheet' | 'presentation' | 'drawing' | 'archive' | 'text' | 'other';

/**
 * A stored file of any type (photo, PDF, Word, Excel, video, DWG…).
 * This metadata is synced to the cloud; the bytes live in Supabase Storage
 * (original quality) and are cached on the device in `blobs`.
 */
export interface StoredFile {
  id: ID;
  name: string;
  /** MIME type ('' when the browser does not know it). */
  type: string;
  size: number;
  kind: FileKind;
  /** Lower-case extension without the dot ('' if none). */
  ext: string;
  /** Pixel size for images (0 when not an image). */
  width: number;
  height: number;
  /** A browser-displayable copy exists (e.g. JPEG for a HEIC photo). */
  hasDisplay: boolean;
  /** A small preview exists (images, first page of PDFs, video poster). */
  hasThumb: boolean;
  sha256: string | null;
  createdAt: ISODate;
}

/** @deprecated kept for older code paths: every image is a StoredFile. */
export type StoredImage = StoredFile;

export type FileVariant = 'original' | 'display' | 'thumb';

/** Bytes of a file variant cached on this device (never synced as a record). */
export interface FileBlob {
  /** `${fileId}:${variant}` */
  key: string;
  fileId: ID;
  variant: FileVariant;
  blob: Blob;
  /** 1 while the bytes still have to be uploaded to cloud storage. */
  pending: 0 | 1;
  cachedAt: ISODate;
}

export type ReferenceKind = 'site-photo' | 'plan' | 'inspiration' | 'furniture' | 'material' | 'generated' | 'screenshot' | 'document' | 'other';

export type ImageIntent = 'want' | 'avoid' | 'neutral';
export type ImageAspect = 'general' | 'furniture' | 'layout' | 'style' | 'material' | 'color' | 'detail';

/**
 * An item in the References Library: an image or any other attached file
 * with its caption, notes, tags and links to the things it belongs to.
 */
export interface Reference {
  id: ID;
  /** The StoredFile id (any file type — the name is historical). */
  imageId: ID;
  kind: ReferenceKind;
  /** Caption */
  title: string;
  /** What this image illustrates and what to take from it. */
  explanation: string;
  intent: ImageIntent;
  aspect: ImageAspect;
  tags: string[];
  notes: string;
  source: string;
  /** Where the reference came from inside the app (used for clean-up on delete). */
  origin: 'upload' | 'requirement' | 'generated' | 'imported';
  roomIds: ID[];
  requirementIds: ID[];
  versionIds: ID[];
  /** `${roomId}:${wallId}` */
  wallKeys: string[];
  elementIds: ID[];
  /** Rooms whose design direction uses this image. */
  directionRoomIds: ID[];
  libraryItemIds: ID[];
  /** Other references this file is attached to (e.g. a spec sheet attached to an inspiration photo). */
  referenceIds: ID[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Generation & versions                                                */
/* ------------------------------------------------------------------ */

export type CameraAngle = 'match-photo' | 'eye-level' | 'seated' | 'elevated-corner' | 'top-down' | 'detail';
export type TimeOfDay = 'morning' | 'midday' | 'golden-hour' | 'evening' | 'night';
export type LensType = 'wide' | 'standard';
export type Realism = 'photoreal' | 'archviz' | 'soft-render' | 'sketch';
export type AspectOption = 'landscape' | 'portrait' | 'square' | 'wide';
export type QualityOption = 'low' | 'medium' | 'high';

export interface GenerationSettings {
  /** Photo (or previous version image) being redesigned. */
  baseReferenceId: ID | null;
  baseVersionId: ID | null;
  /** Additional images to send, in order. */
  includedReferenceIds: ID[];
  includedRequirementIds: ID[];
  includeLayoutPlan: boolean;
  cameraAngle: CameraAngle;
  cameraFrom: string;
  cameraFacing: string;
  cameraNotes: string;
  timeOfDay: TimeOfDay;
  lens: LensType;
  realism: Realism;
  aspect: AspectOption;
  quality: QualityOption;
  variations: number;
  prioritize: string[];
  avoid: string;
  instructions: string;
  directionOverride: string;
  disabledConstraintKeys: string[];
  extraConstraints: string;
  /** Manual prompt edit for this generation, if any. */
  promptOverride: string | null;
}

export type VersionStatus = 'draft' | 'under-review' | 'approved' | 'rejected' | 'archived';

export type ImageRole =
  | 'base-photo'
  | 'previous-version'
  | 'site-photo'
  | 'wall-photo'
  | 'element-photo'
  | 'requirement'
  | 'direction'
  | 'inspiration'
  | 'library-item'
  | 'plan'
  | 'layout-plan';

export interface VersionInputImage {
  referenceId: ID | null;
  imageId: ID | null;
  role: ImageRole;
  label: string;
  caption: string;
  explanation: string;
  intent: ImageIntent;
  requirementId: ID | null;
  requirementTitle: string;
  /** Whether the image itself was sent to the provider (vs. described in text only). */
  sent: boolean;
}

export interface RequirementSnapshot {
  id: ID;
  title: string;
  description: string;
  category: RequirementCategory;
  priority: Priority;
  status: RequirementStatus;
  kind: 'want' | 'avoid';
  group: string;
  imageCaptions: string[];
}

export interface RoomSnapshot {
  name: string;
  type: RoomType;
  geometry: RoomGeometry;
  ceilingHeight: Measure;
  walls: Wall[];
  elements: ArchElement[];
  layoutItems: FurnitureItem[];
  direction: DesignDirection;
  fixedConstraints: string[];
}

export interface ProviderRun {
  providerId: string;
  providerLabel: string;
  model: string;
  endpoint: string;
  params: Record<string, unknown>;
  revisedPrompt: string | null;
  textResponse: string | null;
  durationMs: number | null;
}

export interface DesignVersion {
  id: ID;
  roomId: ID;
  number: number;
  title: string;
  status: VersionStatus;
  origin: 'generated' | 'imported' | 'prompt-only' | 'duplicate';
  /** Output image. Null for prompt-only versions. */
  imageId: ID | null;
  referenceId: ID | null;
  prompt: string;
  settings: GenerationSettings | null;
  provider: ProviderRun | null;
  inputImages: VersionInputImage[];
  requirementsSnapshot: RequirementSnapshot[];
  roomSnapshot: RoomSnapshot;
  doNotChange: string[];
  basedOnVersionId: ID | null;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Library, presets, comparisons, tasks                                 */
/* ------------------------------------------------------------------ */

export type LibraryKind = 'material' | 'furniture';

export interface LibraryItem {
  id: ID;
  kind: LibraryKind;
  category: string;
  name: string;
  width: number | null;
  depth: number | null;
  height: number | null;
  material: string;
  color: string;
  brand: string;
  productUrl: string;
  notes: string;
  price: number | null;
  currency: string;
  roomIds: ID[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface DirectionPreset {
  id: ID;
  name: string;
  nameAr?: string;
  summary: string;
  summaryAr?: string;
  builtIn: boolean;
  fields: DesignDirectionFields;
  order: number;
  updatedAt: ISODate;
}

export type CompareItemRef = { type: 'reference'; id: ID } | { type: 'version'; id: ID };

export interface Comparison {
  id: ID;
  title: string;
  roomId: ID | null;
  items: CompareItemRef[];
  mode: 'side' | 'slider';
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface DesignTask {
  id: ID;
  title: string;
  roomId: ID | null;
  done: boolean;
  createdAt: ISODate;
  doneAt: ISODate | null;
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

export type ImageProviderId = 'none' | 'openai' | 'gemini' | 'stability' | 'openai-compatible';
export type TextProviderId = 'none' | 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';
export type ConnectionRoute = 'auto' | 'proxy' | 'direct';

export interface ImageProviderOptions {
  /** OpenAI gpt-image: preserve input image detail more closely. */
  inputFidelityHigh: boolean;
  outputFormat: 'png' | 'jpeg' | 'webp';
  /** Stability structure control strength 0–1. */
  controlStrength: number;
  /** Stability image-to-image strength 0–1. */
  imageStrength: number;
  /** Gemini output resolution (only for models that support it). */
  geminiImageSize: '' | '1K' | '2K' | '4K';
  /** Max longest edge of images sent to the provider (originals stay untouched). */
  maxUploadEdge: number;
}

export interface CapabilityOverrides {
  acceptsImages: boolean | null;
  maxImages: number | null;
}

export interface ImageProviderSettings {
  provider: ImageProviderId;
  keys: Partial<Record<ImageProviderId, string>>;
  models: Partial<Record<ImageProviderId, string>>;
  baseUrl: string;
  route: ConnectionRoute;
  options: ImageProviderOptions;
  overrides: CapabilityOverrides;
}

export interface TextProviderSettings {
  provider: TextProviderId;
  keys: Partial<Record<TextProviderId, string>>;
  models: Partial<Record<TextProviderId, string>>;
  baseUrl: string;
  route: ConnectionRoute;
}

export interface AppSettings {
  id: 'app';
  defaultUnit: LengthUnit;
  defaultCertainty: 'confirmed' | 'estimated';
  defaultClearanceMm: number;
  houseGuidelines: string;
  lastStudioRoomId: ID | null;
  welcomeDismissed: boolean;
  imageProvider: ImageProviderSettings;
  textProvider: TextProviderSettings;
  lastBackupAt: ISODate | null;
  /** Largest file accepted for upload (MB). Supabase's free plan allows 50 MB. */
  maxUploadMb: number;
}

/* ------------------------------------------------------------------ */
/* Translations, recently deleted, sync bookkeeping                     */
/* ------------------------------------------------------------------ */

/** English wording for a piece of Arabic text, reused wherever that text appears in a prompt. */
export interface Translation {
  /** Hash of the normalised source text. */
  id: string;
  source: string;
  en: string;
  method: 'manual' | 'auto';
  updatedAt: ISODate;
}

export type TrashKind = 'room' | 'requirement' | 'reference' | 'version' | 'library' | 'comparison' | 'preset' | 'floor' | 'task';

/** A deleted item (with everything deleted together with it), restorable from Recently Deleted. */
export interface TrashEntry {
  id: ID;
  kind: TrashKind;
  label: string;
  labelAr?: string;
  roomId: ID | null;
  deletedAt: ISODate;
  /** Whole records removed by the deletion, restored as they were. */
  records: { table: string; record: Record<string, unknown> }[];
  /** Links removed from records that were kept (re-added on restore). */
  unlinks: { table: string; id: ID; field: string; values: string[] }[];
  /** Single-value fields changed on records that were kept (set back on restore if unchanged since). */
  cleared: { table: string; id: ID; field: string; value: unknown; setTo?: unknown }[];
  /** Files only used by this entry (deleted for good when it is purged). */
  fileIds: ID[];
}

export interface OutboxEntry {
  /** `${table}|${key}` */
  id: string;
  table: string;
  key: string;
  at: number;
  /** Changes every time the record changes, so a finished upload never hides a newer edit. */
  rev: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface RestorePoint {
  id: ID;
  createdAt: ISODate;
  reason: string;
  size: number;
  /** 'data' = JSON snapshot of all records (files stay in cloud storage); 'zip' = older full backup. */
  format?: 'data' | 'zip';
  blob: Blob;
  summary: BackupSummary;
}

export interface BackupSummary {
  createdAt: ISODate;
  projectName: string;
  rooms: number;
  requirements: number;
  references: number;
  images: number;
  versions: number;
  libraryItems: number;
}
