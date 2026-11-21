import { newId, nowIso } from '../ids';
import { syncWalls } from '../geometry/room';
import type {
  AppSettings,
  ArchElement,
  DesignDirection,
  DesignDirectionFields,
  ElementType,
  FurnitureItem,
  GenerationSettings,
  ID,
  LayoutChecks,
  Reference,
  Requirement,
  Room,
  RoomGeometry,
  RoomLayout,
  RoomType,
} from '../types';
import { UNKNOWN } from '../units';
import { elementTypeMeta } from '../labels';

export function emptyDirectionFields(): DesignDirectionFields {
  return {
    style: '',
    atmosphere: '',
    palette: [],
    paletteNotes: '',
    materials: '',
    woodType: '',
    flooring: '',
    wallFinishes: '',
    furnitureStyle: '',
    lighting: '',
    curtains: '',
    description: '',
    avoid: '',
  };
}

export function emptyDirection(): DesignDirection {
  return { ...emptyDirectionFields(), presetId: null, presetName: '', updatedAt: null };
}

export function directionIsEmpty(d: DesignDirectionFields): boolean {
  return (
    !d.style.trim() &&
    !d.atmosphere.trim() &&
    d.palette.length === 0 &&
    !d.paletteNotes.trim() &&
    !d.materials.trim() &&
    !d.woodType.trim() &&
    !d.flooring.trim() &&
    !d.wallFinishes.trim() &&
    !d.furnitureStyle.trim() &&
    !d.lighting.trim() &&
    !d.curtains.trim() &&
    !d.description.trim() &&
    !d.avoid.trim()
  );
}

export function defaultChecks(): LayoutChecks {
  return { overlap: true, bounds: true, doors: true, windows: true, ac: true, clearance: true, architecture: true };
}

export function defaultLayout(clearanceMm = 600): RoomLayout {
  return { items: [], clearanceMm, checks: defaultChecks(), gridMm: 100, snap: true };
}

export function unknownGeometry(): RoomGeometry {
  return {
    shape: 'rectangle',
    length: { ...UNKNOWN },
    width: { ...UNKNOWN },
    lCutout: { length: { ...UNKNOWN }, width: { ...UNKNOWN }, corner: 'ne' },
    customOrigin: { x: 0, y: 0 },
    source: '',
  };
}

export function createRoomRecord(partial: Partial<Room> & { name: string; type: RoomType }, order = 0): Room {
  const now = nowIso();
  const geometry = partial.geometry ?? unknownGeometry();
  return {
    id: newId('room'),
    floorId: null,
    status: 'not-started',
    coverReferenceId: null,
    description: '',
    displayUnit: 'm',
    geometry,
    ceilingHeight: { ...UNKNOWN },
    walls: syncWalls(geometry, partial.walls ?? []),
    elements: [],
    layout: defaultLayout(),
    direction: emptyDirection(),
    preliminaryConcept: '',
    fixedConstraints: [],
    useHouseGuidelines: false,
    approvedVersionId: null,
    planPlacement: null,
    lastGeneration: null,
    order,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createElementRecord(type: ElementType, partial: Partial<ArchElement> = {}): ArchElement {
  const meta = elementTypeMeta(type);
  return {
    id: newId('el'),
    type,
    subtype: meta.subtypes[0] ?? '',
    label: meta.label,
    placement: meta.wallMounted ? 'wall' : 'free',
    wallId: null,
    offset: null,
    x: null,
    y: null,
    rotation: 0,
    width: null,
    height: null,
    depth: null,
    elevation: null,
    door: type === 'door' ? { hinge: 'left', swing: 'in' } : null,
    status: 'confirmed',
    preserve: true,
    notes: '',
    ...partial,
  };
}

export function createFurnitureRecord(partial: Partial<FurnitureItem> & { name: string }): FurnitureItem {
  return {
    id: newId('f'),
    category: 'other',
    shape: 'rect',
    x: 0,
    y: 0,
    width: 1000,
    depth: 600,
    height: null,
    rotation: 0,
    dimsStatus: 'estimated',
    layer: 'standard',
    color: '',
    notes: '',
    libraryItemId: null,
    locked: false,
    ignoreClearance: false,
    ...partial,
  };
}

export function createRequirementRecord(roomId: ID, partial: Partial<Requirement> = {}, order = 0): Requirement {
  const now = nowIso();
  return {
    id: newId('req'),
    roomId,
    title: '',
    description: '',
    category: 'other',
    priority: 'preferred',
    status: 'pending',
    kind: 'want',
    group: '',
    notes: '',
    source: '',
    primaryReferenceId: null,
    order,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createReferenceRecord(imageId: ID, partial: Partial<Reference> = {}): Reference {
  const now = nowIso();
  return {
    id: newId('ref'),
    imageId,
    kind: 'inspiration',
    title: '',
    explanation: '',
    intent: 'neutral',
    aspect: 'general',
    tags: [],
    notes: '',
    source: '',
    origin: 'upload',
    roomIds: [],
    requirementIds: [],
    versionIds: [],
    wallKeys: [],
    elementIds: [],
    directionRoomIds: [],
    libraryItemIds: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function defaultGenerationSettings(): GenerationSettings {
  return {
    baseReferenceId: null,
    baseVersionId: null,
    includedReferenceIds: [],
    includedRequirementIds: [],
    includeLayoutPlan: false,
    cameraAngle: 'match-photo',
    cameraFrom: '',
    cameraFacing: '',
    cameraNotes: '',
    timeOfDay: 'midday',
    lens: 'standard',
    realism: 'photoreal',
    aspect: 'landscape',
    quality: 'high',
    variations: 1,
    prioritize: ['Architectural accuracy', 'Requirement fidelity'],
    avoid: 'clutter, people, text or watermarks, distorted proportions',
    instructions: '',
    directionOverride: '',
    disabledConstraintKeys: [],
    extraConstraints: '',
    promptOverride: null,
  };
}

export function defaultSettings(): AppSettings {
  return {
    id: 'app',
    defaultUnit: 'm',
    defaultCertainty: 'confirmed',
    defaultClearanceMm: 600,
    houseGuidelines: '',
    lastStudioRoomId: null,
    welcomeDismissed: false,
    imageProvider: {
      provider: 'none',
      keys: {},
      models: {},
      baseUrl: '',
      route: 'auto',
      options: {
        inputFidelityHigh: true,
        outputFormat: 'png',
        controlStrength: 0.7,
        imageStrength: 0.65,
        geminiImageSize: '',
        maxUploadEdge: 2048,
      },
      overrides: { acceptsImages: null, maxImages: null },
    },
    textProvider: {
      provider: 'none',
      keys: {},
      models: {},
      baseUrl: '',
      route: 'auto',
    },
    lastBackupAt: null,
  };
}

/** Deep-merge stored settings over defaults so new fields always exist. */
export function withSettingsDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  const d = defaultSettings();
  if (!stored) return d;
  return {
    ...d,
    ...stored,
    id: 'app',
    imageProvider: {
      ...d.imageProvider,
      ...(stored.imageProvider ?? {}),
      keys: { ...(stored.imageProvider?.keys ?? {}) },
      models: { ...(stored.imageProvider?.models ?? {}) },
      options: { ...d.imageProvider.options, ...(stored.imageProvider?.options ?? {}) },
      overrides: { ...d.imageProvider.overrides, ...(stored.imageProvider?.overrides ?? {}) },
    },
    textProvider: {
      ...d.textProvider,
      ...(stored.textProvider ?? {}),
      keys: { ...(stored.textProvider?.keys ?? {}) },
      models: { ...(stored.textProvider?.models ?? {}) },
    },
  };
}
