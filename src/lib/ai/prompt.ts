import type { ArchElement, DesignVersion, GenerationSettings, ID, ImageIntent, ImageRole, LibraryItem, Reference, Requirement, Room } from '../types';
import { computeRoomShape, effectiveWallHeight, findSegment, type RoomShapeResult } from '../geometry/room';
import { normalizeAngle, segmentDistance } from '../geometry/polygon';
import { furniturePolygon } from '../layout/validate';
import { CAMERA_ANGLES, categoryLabel, elementTypeMeta, IMAGE_ROLE_LABEL, LENSES, REALISM, roomTypeLabel, spaceKind, TIMES_OF_DAY } from '../labels';
import { isKnown } from '../units';
import { directionIsEmpty } from '../db/factories';
import type { ProviderCapabilities } from './providers/types';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface ConstraintItem {
  key: string;
  text: string;
  source: 'dimensions' | 'element' | 'requirement' | 'fixed' | 'rule' | 'one-off';
  enabled: boolean;
}

export interface PlannedImage {
  key: string;
  referenceId: ID | null;
  imageId: ID | null;
  versionId: ID | null;
  role: ImageRole;
  label: string;
  caption: string;
  explanation: string;
  intent: ImageIntent;
  requirementId: ID | null;
  requirementTitle: string;
  wallName: string;
  /** 1-based position among the images actually sent. 0 when not sent. */
  index: number;
  sent: boolean;
  reason: string | null;
}

export interface PackageWarning {
  level: 'info' | 'warning' | 'blocker';
  message: string;
}

export interface GenerationPackage {
  prompt: string;
  images: PlannedImage[];
  constraints: ConstraintItem[];
  warnings: PackageWarning[];
  activeRequirements: Requirement[];
  truncated: boolean;
  negativePrompt: string;
}

export interface PackageContext {
  projectName: string;
  location: string;
  room: Room;
  floorName: string | null;
  requirements: Requirement[];
  references: Reference[];
  libraryItems: LibraryItem[];
  baseVersion: DesignVersion | null;
  settings: GenerationSettings;
  /** Null when no image provider is configured (prompt-only). */
  capabilities: ProviderCapabilities | null;
  houseGuidelines: string;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                   */
/* ------------------------------------------------------------------ */

const m = (mm: number | null | undefined) => (mm === null || mm === undefined ? 'unknown' : `${(mm / 1000).toFixed(2)} m`);

function certTag(c: 'confirmed' | 'estimated' | 'unknown'): string {
  return c === 'confirmed' ? '[confirmed]' : c === 'estimated' ? '[estimated — not verified]' : '[unknown]';
}

/** Compass end a wall starts at, e.g. "west end" for a wall walked eastwards. */
function startEndName(heading: number): string {
  const b = normalizeAngle(heading + 180);
  const names: Record<number, string> = {
    0: 'east',
    45: 'south-east',
    90: 'south',
    135: 'south-west',
    180: 'west',
    225: 'north-west',
    270: 'north',
    315: 'north-east',
  };
  return `${names[Math.round(b / 45) * 45 === 360 ? 0 : Math.round(b / 45) * 45] ?? 'left'} end`;
}

function quote(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? `“${t}”` : '';
}

function joinNonEmpty(parts: (string | null | undefined | false)[], sep = ' '): string {
  return parts.filter((p): p is string => !!p && !!p.trim()).join(sep);
}

/* ------------------------------------------------------------------ */
/* Element descriptions                                                 */
/* ------------------------------------------------------------------ */

export function describeElement(el: ArchElement, shape: RoomShapeResult): string {
  const typeLabel = elementTypeMeta(el.type).label;
  const what = el.subtype || typeLabel;
  const named = el.label && el.label !== typeLabel && el.label !== el.subtype ? ` (“${el.label}”)` : '';
  const bits: string[] = [];
  const seg = findSegment(shape, el.wallId);
  if (el.placement === 'wall') {
    bits.push(`${what}${named} on the ${seg?.name ?? 'unassigned'} wall`);
  } else {
    bits.push(`${what}${named}${el.type === 'beam' ? ' (overhead)' : ''}`);
  }
  const size: string[] = [];
  if (el.width !== null) size.push(`${m(el.width)} wide`);
  if (el.height !== null) size.push(`${m(el.height)} ${el.type === 'beam' ? 'deep' : 'high'}`);
  if (el.depth !== null && (el.type === 'ac' || el.type === 'projection' || el.type === 'recess' || el.type === 'column' || el.type === 'beam'))
    size.push(`${m(el.depth)} ${el.type === 'recess' ? 'deep into the wall' : el.type === 'column' ? 'deep' : 'projecting'}`);
  if (size.length) bits.push(`— ${size.join(', ')}`);
  if (el.elevation !== null) {
    if (el.type === 'window') bits.push(`sill ${m(el.elevation)} above the floor`);
    else if (el.type === 'beam') bits.push(`underside ${m(el.elevation)} above the floor`);
    else if (el.type !== 'door') bits.push(`${m(el.elevation)} above the floor`);
  }
  if (el.placement === 'wall' && el.offset !== null && seg) bits.push(`starting ${m(el.offset)} from the ${startEndName(seg.heading)} of that wall`);
  if (el.placement === 'free' && el.x !== null && el.y !== null && shape.drawable) {
    bits.push(`centred ${m(el.x - shape.bounds.minX)} from the west side and ${m(el.y - shape.bounds.minY)} from the north side of the room`);
  }
  if (el.type === 'door' && el.door) {
    const swing =
      el.door.swing === 'in'
        ? 'opens into the room'
        : el.door.swing === 'out'
          ? 'opens outward'
          : el.door.swing === 'sliding'
            ? 'sliding'
            : 'open doorway without a door leaf';
    bits.push(`${swing}${el.door.swing === 'in' || el.door.swing === 'out' ? `, hinged on the ${el.door.hinge}` : ''}`);
  }
  const unknown: string[] = [];
  if (el.width === null) unknown.push('width');
  if (el.placement === 'wall' && el.offset === null) unknown.push('exact position');
  if (el.placement === 'free' && (el.x === null || el.y === null)) unknown.push('exact position');
  if (unknown.length) bits.push(`(${unknown.join(' and ')} unknown)`);
  if (el.notes.trim()) bits.push(`— note: ${el.notes.trim().replace(/\s+/g, ' ')}`);
  return bits.join(', ').replace(/, —/g, ' —').replace(/, \(/g, ' (');
}

/* ------------------------------------------------------------------ */
/* Default image selection                                              */
/* ------------------------------------------------------------------ */

const PRIORITY_RANK = { must: 0, preferred: 1, optional: 2 } as const;

export function activeRequirementsFor(
  requirements: Requirement[],
  settings: Pick<GenerationSettings, 'includedRequirementIds'>,
  excludedIds: ID[] = [],
): Requirement[] {
  const base = settings.includedRequirementIds.length
    ? requirements.filter((r) => settings.includedRequirementIds.includes(r.id))
    : requirements.filter((r) => r.status !== 'rejected');
  return base.filter((r) => !excludedIds.includes(r.id)).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order);
}

/** Sensible default: base photo, then requirement images, direction images, other site photos. */
export function defaultImageSelection(
  room: Room,
  requirements: Requirement[],
  references: Reference[],
): { baseReferenceId: ID | null; includedReferenceIds: ID[] } {
  const sitePhotos = references.filter((r) => r.kind === 'site-photo' && r.roomIds.includes(room.id));
  const cover = sitePhotos.find((r) => r.id === room.coverReferenceId);
  const base = cover ?? sitePhotos[0] ?? null;
  const ids: ID[] = [];
  const push = (id: ID) => {
    if (id !== base?.id && !ids.includes(id)) ids.push(id);
  };
  const active = requirements.filter((r) => r.status !== 'rejected').sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order);
  for (const req of active) {
    const imgs = references.filter((r) => r.requirementIds.includes(req.id));
    imgs.sort((a, b) => (a.id === req.primaryReferenceId ? -1 : b.id === req.primaryReferenceId ? 1 : 0));
    imgs.forEach((r) => push(r.id));
  }
  references.filter((r) => r.directionRoomIds.includes(room.id)).forEach((r) => push(r.id));
  sitePhotos.forEach((r) => push(r.id));
  return { baseReferenceId: base?.id ?? null, includedReferenceIds: ids };
}

function roleFor(ref: Reference, room: Room, activeIds: Set<ID>): { role: ImageRole; requirementId: ID | null; wallKey: string | null } {
  const reqId = ref.requirementIds.find((x) => activeIds.has(x)) ?? null;
  if (reqId) return { role: 'requirement', requirementId: reqId, wallKey: null };
  const wallKey = ref.wallKeys.find((k) => k.startsWith(`${room.id}:`)) ?? null;
  if (ref.kind === 'site-photo') {
    if (wallKey) return { role: 'wall-photo', requirementId: null, wallKey };
    if (ref.elementIds.some((e) => room.elements.some((x) => x.id === e))) return { role: 'element-photo', requirementId: null, wallKey: null };
    return { role: 'site-photo', requirementId: null, wallKey: null };
  }
  if (ref.kind === 'plan') return { role: 'plan', requirementId: null, wallKey: null };
  if (ref.directionRoomIds.includes(room.id)) return { role: 'direction', requirementId: null, wallKey: null };
  if (ref.libraryItemIds.length) return { role: 'library-item', requirementId: null, wallKey: null };
  return { role: 'inspiration', requirementId: null, wallKey };
}

/* ------------------------------------------------------------------ */
/* Package builder                                                      */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  priority: 0 | 1 | 2 | 3;
  text: string;
}

export function buildGenerationPackage(ctx: PackageContext): GenerationPackage {
  const { room, settings, capabilities: caps } = ctx;
  const kind = spaceKind(room.type);
  const shape = computeRoomShape(room);
  const warnings: PackageWarning[] = [];
  const active = activeRequirementsFor(ctx.requirements, settings);
  const activeIds = new Set(active.map((r) => r.id));
  const refById = new Map(ctx.references.map((r) => [r.id, r]));

  /* ---------- images ---------- */
  const planned: PlannedImage[] = [];
  const iterating = !!ctx.baseVersion?.imageId && settings.baseVersionId === ctx.baseVersion.id;
  if (iterating && ctx.baseVersion) {
    planned.push({
      key: `version:${ctx.baseVersion.id}`,
      referenceId: ctx.baseVersion.referenceId,
      imageId: ctx.baseVersion.imageId,
      versionId: ctx.baseVersion.id,
      role: 'previous-version',
      label: '',
      caption: `Design concept v${ctx.baseVersion.number}`,
      explanation: '',
      intent: 'neutral',
      requirementId: null,
      requirementTitle: '',
      wallName: '',
      index: 0,
      sent: false,
      reason: null,
    });
  }
  const baseRef = settings.baseReferenceId ? refById.get(settings.baseReferenceId) : undefined;
  if (baseRef) {
    planned.push({
      key: baseRef.id,
      referenceId: baseRef.id,
      imageId: baseRef.imageId,
      versionId: null,
      role: iterating ? 'site-photo' : 'base-photo',
      label: '',
      caption: baseRef.title,
      explanation: baseRef.explanation,
      intent: 'neutral',
      requirementId: null,
      requirementTitle: '',
      wallName: wallNameFor(baseRef, room, shape),
      index: 0,
      sent: false,
      reason: null,
    });
  }
  for (const id of settings.includedReferenceIds) {
    if (id === baseRef?.id) continue;
    const ref = refById.get(id);
    if (!ref) continue;
    const { role, requirementId } = roleFor(ref, room, activeIds);
    const req = requirementId ? active.find((r) => r.id === requirementId) : undefined;
    planned.push({
      key: ref.id,
      referenceId: ref.id,
      imageId: ref.imageId,
      versionId: null,
      role,
      label: '',
      caption: ref.title,
      explanation: ref.explanation,
      intent: req?.kind === 'avoid' && ref.intent === 'neutral' ? 'avoid' : ref.intent,
      requirementId: requirementId,
      requirementTitle: req?.title ?? '',
      wallName: wallNameFor(ref, room, shape),
      index: 0,
      sent: false,
      reason: null,
    });
  }
  if (settings.includeLayoutPlan && shape.drawable) {
    planned.push({
      key: 'layout-plan',
      referenceId: null,
      imageId: null,
      versionId: null,
      role: 'layout-plan',
      label: '',
      caption: 'Top-down 2D layout plan',
      explanation: '',
      intent: 'neutral',
      requirementId: null,
      requirementTitle: '',
      wallName: '',
      index: 0,
      sent: false,
      reason: null,
    });
  }

  // Apply provider limits. Without a provider nothing is sent, but images are
  // still numbered so a copied prompt can be used with the images attached by hand.
  let idx = 0;
  for (const p of planned) {
    if (!caps) {
      p.reason = 'No image provider configured';
      p.index = ++idx;
    } else if (!caps.imageInput) {
      p.reason = 'This model cannot accept images';
    } else if (idx >= caps.maxImages) {
      p.reason = `Over the model's limit of ${caps.maxImages} image${caps.maxImages === 1 ? '' : 's'}`;
    } else {
      p.sent = true;
      p.index = ++idx;
    }
    p.label = imageLabel(p);
  }
  const numbered = planned.filter((p) => p.index > 0);
  const notSent = planned.filter((p) => !p.sent);
  const described = planned.filter((p) => p.index === 0);

  if (caps && !caps.imageInput && planned.length) {
    warnings.push({
      level: 'warning',
      message: `The selected model can't take images. ${planned.length} image(s) will only be described in text, so the result won't match your actual room.`,
    });
  } else if (caps && notSent.length) {
    warnings.push({
      level: 'warning',
      message: `${notSent.length} image(s) exceed the model's limit of ${caps.maxImages} and will be described in text instead. Reorder images to choose which are sent.`,
    });
  }
  const hasBase = (iterating && planned[0]?.sent) || planned.some((p) => p.role === 'base-photo' && p.sent);
  if (!baseRef && !iterating) {
    warnings.push({
      level: 'warning',
      message: 'No photo of the actual room is selected. The model will imagine the room, so architecture and proportions will not match your house.',
    });
  }
  if (caps?.requiresBaseImage && !hasBase) {
    warnings.push({ level: 'blocker', message: 'This model needs a room photo to redesign. Choose a “Photo to redesign”.' });
  }
  if (caps && !caps.textToImage && !hasBase) {
    warnings.push({ level: 'blocker', message: 'This model only edits existing images. Select a site photo or a previous concept.' });
  }

  /* ---------- constraints (DO NOT CHANGE) ---------- */
  const constraints = buildConstraints(ctx, shape);
  const enabled = constraints.filter((c) => c.enabled);
  const allowed = constraints.filter((c) => !c.enabled && c.source !== 'one-off');

  /* ---------- sections ---------- */
  const sections: Section[] = [];
  const intro =
    kind === 'facade'
      ? `Redesign the exterior front facade of an existing private house — ${ctx.projectName}, ${ctx.location}. This is a real building: keep its massing, number of floors, openings and architectural character exactly as existing, and update only the finishes, materials, colors, lighting and landscaping described below.`
      : kind === 'outdoor'
        ? `Redesign an existing outdoor space of a private house — ${ctx.projectName}, ${ctx.location}. This is a real site: keep its boundaries, levels, walls, doors and fixed structures as existing.`
        : `Redesign the interior of an existing room in a private house — ${ctx.projectName}, ${ctx.location}. This is a real room, not a new building: keep its architecture exactly as described below and as shown in the site photographs.`;
  const iterLine =
    iterating && ctx.baseVersion
      ? `This is a revision of design concept v${ctx.baseVersion.number} (Image 1). Keep everything from that concept except the changes requested below.`
      : '';
  sections.push({
    id: 'intro',
    priority: 0,
    text: joinNonEmpty(
      [
        intro,
        iterLine,
        `Produce one finished image of the redesigned ${kind === 'facade' ? 'facade' : 'space'} — ${REALISM.find((r) => r.value === settings.realism)?.prompt ?? 'photorealistic'}.`,
        'Information marked unknown is genuinely unknown — do not invent it. Estimated values are approximate.',
      ],
      '\n',
    ),
  });

  sections.push({ id: 'room', priority: 0, text: roomSection(ctx, shape, kind) });

  if (enabled.length) {
    sections.push({
      id: 'dnc',
      priority: 0,
      text: `DO NOT CHANGE\n${enabled.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`,
    });
  }
  if (allowed.length) {
    sections.push({
      id: 'allowed',
      priority: 0,
      text: `CHANGES THE HOMEOWNER EXPLICITLY ALLOWS IN THIS VERSION\n${allowed.map((c) => `- ${c.text.replace(/ — keep[^.]*\.?$/i, '')} may be changed.`).join('\n')}`,
    });
  }

  const uncertain = room.elements.filter((e) => e.status === 'estimated');
  const unknownEls = room.elements.filter((e) => e.status === 'unknown');
  const unknownFacts: string[] = [];
  if (!shape.drawable) unknownFacts.push(`Room dimensions (${shape.missing.join(', ') || 'incomplete'}) — follow the proportions visible in the photographs.`);
  if (kind === 'interior' && !isKnown(room.ceilingHeight)) unknownFacts.push('Ceiling height — follow the photographs.');
  unknownEls.forEach((e) =>
    unknownFacts.push(`${describeElement(e, shape)} — existence or position not confirmed; follow the photographs and do not add it if it is not visible.`),
  );
  if (uncertain.length || unknownFacts.length) {
    sections.push({
      id: 'uncertain',
      priority: 0,
      text: joinNonEmpty(
        [
          uncertain.length
            ? `APPROXIMATE FEATURES (estimated, not verified — keep consistent with the photographs; do not move, add or emphasise)\n${uncertain.map((e) => `- ${describeElement(e, shape)}`).join('\n')}`
            : '',
          unknownFacts.length ? `UNKNOWN (do not invent)\n${unknownFacts.map((t) => `- ${t}`).join('\n')}` : '',
        ],
        '\n\n',
      ),
    });
  }

  sections.push({ id: 'direction', priority: 1, text: directionSection(ctx) });

  const imagesByReq = new Map<ID, PlannedImage[]>();
  for (const p of planned) if (p.requirementId) imagesByReq.set(p.requirementId, [...(imagesByReq.get(p.requirementId) ?? []), p]);

  const reqLine = (r: Requirement, i: number, compact = false) => {
    const imgs = imagesByReq.get(r.id) ?? [];
    const refsTxt = imgs.length
      ? ` (${imgs.map((p) => (p.index > 0 ? `see Image ${p.index}${p.intent === 'avoid' ? ' — example to avoid' : ''}` : `reference not attached: ${quote(p.caption || p.explanation) || 'image'}`)).join('; ')})`
      : '';
    const desc = !compact && r.description.trim() && r.description.trim() !== r.title.trim() ? ` — ${r.description.trim().replace(/\s+/g, ' ')}` : '';
    return `${i}. [${categoryLabel(r.category)}] ${r.title.trim() || r.description.trim().slice(0, 120)}${desc}${refsTxt}`;
  };

  const wants = active.filter((r) => r.kind === 'want');
  const avoids = active.filter((r) => r.kind === 'avoid');
  const byPriority = (p: Requirement['priority']) => wants.filter((r) => r.priority === p);
  const reqText = (compact: boolean) => {
    const blocks: string[] = [];
    const must = byPriority('must');
    const pref = byPriority('preferred');
    const opt = byPriority('optional');
    if (must.length) blocks.push(`Must have:\n${must.map((r, i) => reqLine(r, i + 1, compact)).join('\n')}`);
    if (pref.length) blocks.push(`Preferred:\n${pref.map((r, i) => reqLine(r, i + 1, compact)).join('\n')}`);
    if (opt.length) blocks.push(`Optional (include only if they fit naturally):\n${opt.map((r, i) => reqLine(r, i + 1, compact)).join('\n')}`);
    return blocks.length ? `DESIGN REQUIREMENTS (from the homeowner — Must have items are essential)\n${blocks.join('\n\n')}` : '';
  };
  const reqSection: Section = { id: 'requirements', priority: 0, text: reqText(false) };
  if (reqSection.text) sections.push(reqSection);
  else warnings.push({ level: 'info', message: 'No requirements are included. The design will follow the direction and images only.' });

  const avoidImages = planned.filter((p) => p.intent === 'avoid' && !p.requirementId);
  if (avoids.length || avoidImages.length) {
    sections.push({
      id: 'avoid',
      priority: 0,
      text: `DO NOT INCLUDE\n${[
        ...avoids.map((r) => {
          const imgs = imagesByReq.get(r.id) ?? [];
          const refsTxt = imgs.filter((p) => p.index > 0).map((p) => `Image ${p.index}`);
          return `- ${r.title.trim()}${r.description.trim() && r.description.trim() !== r.title.trim() ? ` — ${r.description.trim().replace(/\s+/g, ' ')}` : ''}${refsTxt.length ? ` (example of what to avoid: ${refsTxt.join(', ')})` : ''}`;
        }),
        ...avoidImages.map(
          (p) =>
            `- ${p.index > 0 ? `The look shown in Image ${p.index}` : quote(p.caption) || 'A reference image'}${p.explanation ? ` — ${p.explanation}` : ''}`,
        ),
      ].join('\n')}`,
    });
  }

  const wallText = wallSection(shape);
  if (wallText) sections.push({ id: 'walls', priority: 2, text: wallText });

  const layoutText = layoutSection(room, shape);
  if (layoutText) sections.push({ id: 'layout', priority: 3, text: layoutText });

  const lib = ctx.libraryItems.filter((l) => l.roomIds.includes(room.id));
  if (lib.length) {
    sections.push({
      id: 'library',
      priority: 3,
      text: `SELECTED PRODUCTS AND MATERIALS FOR THIS ROOM\n${lib
        .map((l) => {
          const dims = [l.width, l.depth, l.height].some((v) => v !== null)
            ? `${[l.width, l.depth, l.height].map((v) => (v === null ? '?' : `${Math.round(v / 10)}`)).join(' × ')} cm`
            : '';
          return `- ${joinNonEmpty([l.name, l.brand && `by ${l.brand}`, dims && `(${dims})`, l.material && `material: ${l.material}`, l.color && `color: ${l.color}`, l.notes && `— ${l.notes}`], ' ')}`;
        })
        .join('\n')}`,
    });
  }

  if (room.useHouseGuidelines && ctx.houseGuidelines.trim()) {
    sections.push({
      id: 'house',
      priority: 2,
      text: `HOUSE-WIDE GUIDELINES (the homeowner chose to apply these to this room)\n${ctx.houseGuidelines.trim()}`,
    });
  }

  if (planned.length) {
    const lines = numbered.sort((a, b) => a.index - b.index).map((p) => `Image ${p.index} — ${manifestLine(p)}`);
    const describedLines = described.map(
      (p) =>
        `- ${IMAGE_ROLE_LABEL[p.role]}${p.requirementTitle ? ` for “${p.requirementTitle}”` : ''}: ${joinNonEmpty([quote(p.caption), p.explanation]) || 'no caption'}${p.intent === 'avoid' ? ' (example of what to avoid)' : ''}`,
    );
    sections.push({
      id: 'images',
      priority: 0,
      text: joinNonEmpty(
        [
          lines.length ? `INPUT IMAGES (${caps ? 'attached in this order' : 'attach them in this order'})\n${lines.join('\n')}` : '',
          describedLines.length ? `REFERENCE IMAGES DESCRIBED IN TEXT (not attached)\n${describedLines.join('\n')}` : '',
        ],
        '\n\n',
      ),
    });
  }

  sections.push({ id: 'render', priority: 0, text: renderSection(ctx, shape, hasBase, iterating, warnings) });

  if (settings.instructions.trim()) {
    sections.push({ id: 'instructions', priority: 0, text: `ADDITIONAL INSTRUCTIONS FOR THIS VERSION\n${settings.instructions.trim()}` });
  }
  sections.push({
    id: 'closing',
    priority: 0,
    text: 'Where a requirement conflicts with the existing architecture, keep the architecture and adapt the design. Do not add text, labels, watermarks or split views to the image.',
  });

  /* ---------- assemble with length limit ---------- */
  const limit = caps?.maxPromptChars ?? 32000;
  let truncated = false;
  const join = (list: Section[]) =>
    list
      .map((s) => s.text)
      .filter(Boolean)
      .join('\n\n');
  let list = sections;
  let prompt = join(list);
  for (const level of [3, 2, 1] as const) {
    if (prompt.length <= limit) break;
    list = list.filter((s) => s.priority < level);
    truncated = true;
    prompt = join(list);
  }
  if (prompt.length > limit && reqSection.text) {
    reqSection.text = reqText(true);
    prompt = join(list);
  }
  if (prompt.length > limit) {
    prompt = `${prompt.slice(0, limit - 1)}…`;
    truncated = true;
  }
  if (truncated)
    warnings.push({
      level: 'warning',
      message: `The prompt was shortened to fit this model's limit of ${limit.toLocaleString()} characters. Lower-priority details were left out.`,
    });

  if (settings.promptOverride !== null && settings.promptOverride.trim()) {
    prompt = settings.promptOverride.slice(0, limit);
    warnings.push({ level: 'info', message: 'You are using a manually edited prompt for this generation.' });
  }

  const negativePrompt = joinNonEmpty(
    [settings.avoid, ...avoids.map((r) => r.title), 'extra windows, extra doors, distorted perspective, text, watermark'],
    ', ',
  );

  return {
    prompt,
    images: planned,
    constraints,
    warnings,
    activeRequirements: active,
    truncated,
    negativePrompt,
  };
}

function wallNameFor(ref: Reference, room: Room, shape: RoomShapeResult): string {
  const key = ref.wallKeys.find((k) => k.startsWith(`${room.id}:`));
  if (!key) return '';
  const wallId = key.slice(room.id.length + 1);
  return shape.segments.find((s) => s.id === wallId)?.name ?? '';
}

function imageLabel(p: PlannedImage): string {
  const role = IMAGE_ROLE_LABEL[p.role];
  const bits = [role];
  if (p.requirementTitle) bits.push(`for “${p.requirementTitle}”`);
  if (p.wallName) bits.push(`(${p.wallName} wall)`);
  if (p.intent === 'avoid') bits.push('— AVOID');
  if (p.caption) bits.push(`: ${p.caption}`);
  return bits.join(' ');
}

function manifestLine(p: PlannedImage): string {
  const cap = joinNonEmpty([quote(p.caption), p.explanation.trim() ? `— ${p.explanation.trim().replace(/\s+/g, ' ')}` : '']);
  switch (p.role) {
    case 'base-photo':
      return `PHOTO OF THE ACTUAL ROOM TO REDESIGN${p.wallName ? ` (view of the ${p.wallName} wall)` : ''}. Keep its exact viewpoint, perspective, room geometry, windows, doors and fixed features. Change only finishes, furniture, decor and lighting.${cap ? ` ${cap}` : ''}`;
    case 'previous-version':
      return `PREVIOUS DESIGN CONCEPT to revise (${p.caption}). Keep its viewpoint and everything not mentioned in the changes.`;
    case 'site-photo':
      return `Photo of the actual room for architectural context (do not copy its current furniture or finishes).${cap ? ` ${cap}` : ''}`;
    case 'wall-photo':
      return `Photo of the actual ${p.wallName} wall for architectural context — keep this wall's windows, doors and features.${cap ? ` ${cap}` : ''}`;
    case 'element-photo':
      return `Photo of an existing fixed element of this room (keep it).${cap ? ` ${cap}` : ''}`;
    case 'requirement':
      return p.intent === 'avoid'
        ? `Example of what to AVOID for the requirement “${p.requirementTitle}”.${cap ? ` ${cap}` : ''}`
        : `Reference for the requirement “${p.requirementTitle}” — use what it illustrates.${cap ? ` ${cap}` : ''}`;
    case 'direction':
      return `${p.intent === 'avoid' ? 'Style to AVOID' : 'Style and mood reference for this room'} (design direction).${cap ? ` ${cap}` : ''}`;
    case 'library-item':
      return `Selected product or material for this room.${cap ? ` ${cap}` : ''}`;
    case 'plan':
      return `Architectural plan of the house (for understanding the layout only; not a style reference).${cap ? ` ${cap}` : ''}`;
    case 'layout-plan':
      return 'Top-down 2D plan of this room drawn to scale (north at the top) showing the intended furniture arrangement. Use it for placement only — it is not a style reference.';
    default:
      return `${p.intent === 'avoid' ? 'Example of what to AVOID' : 'Inspiration image'}.${cap ? ` ${cap}` : ''}`;
  }
}

function roomSection(ctx: PackageContext, shape: RoomShapeResult, kind: 'interior' | 'outdoor' | 'facade'): string {
  const { room } = ctx;
  const g = room.geometry;
  const lines: string[] = [];
  const typeLabel = roomTypeLabel(room.type).toLowerCase();
  const showType = !room.name.toLowerCase().includes(typeLabel) && !typeLabel.includes(room.name.toLowerCase());
  lines.push(`- Space: ${room.name}${showType ? ` (${typeLabel})` : ''}${ctx.floorName ? `, ${ctx.floorName}` : ''}.`);
  if (room.description.trim()) lines.push(`- About this space: ${room.description.trim().replace(/\s+/g, ' ')}`);
  if (g.shape === 'custom') {
    if (shape.drawable) {
      lines.push(
        `- Shape: irregular outline with ${shape.segments.length} walls, overall ${m(shape.bounds.width)} (east–west) × ${m(shape.bounds.height)} (north–south) ${certTag(shape.area.certainty)}.`,
      );
    } else lines.push(`- Shape: irregular outline with ${room.walls.length} walls; some wall lengths are unknown.`);
  } else if (isKnown(g.length) || isKnown(g.width)) {
    const lTxt = `${m(g.length.mm)} (east–west) ${certTag(g.length.certainty)}`;
    const wTxt = `${m(g.width.mm)} (north–south) ${certTag(g.width.certainty)}`;
    if (g.shape === 'l-shape') {
      lines.push(
        `- Shape: L-shaped. Overall ${lTxt} × ${wTxt}, with a ${m(g.lCutout.length.mm)} × ${m(g.lCutout.width.mm)} rectangle missing at the ${{ nw: 'north-west', ne: 'north-east', se: 'south-east', sw: 'south-west' }[g.lCutout.corner]} corner.`,
      );
    } else {
      lines.push(`- Shape: rectangular, ${lTxt} × ${wTxt}.`);
    }
  } else {
    lines.push('- Footprint dimensions: unknown.');
  }
  if (shape.area.mm2 !== null)
    lines.push(`- Floor area: ${shape.area.certainty === 'estimated' ? 'approximately ' : ''}${(shape.area.mm2 / 1e6).toFixed(1)} m².`);
  if (kind === 'interior')
    lines.push(`- Ceiling height: ${m(room.ceilingHeight.mm)} ${certTag(room.ceilingHeight.mm === null ? 'unknown' : room.ceilingHeight.certainty)}.`);
  const walls = shape.segments
    .map((s) => {
      const h = effectiveWallHeight(s.wall, room.ceilingHeight);
      const extra = s.wall?.heightOverride && isKnown(h) ? `, ${m(h.mm)} high` : '';
      return `${s.name} ${isKnown(s.length) ? m(s.length.mm) : 'length unknown'}${extra}`;
    })
    .join('; ');
  if (walls)
    lines.push(`- ${kind === 'facade' ? 'Facade parts' : 'Walls'} (clockwise from the north-west corner, as seen from above with north at the top): ${walls}.`);
  const confirmedEls = room.elements.filter((e) => e.status === 'confirmed');
  if (confirmedEls.length) lines.push(`- Existing confirmed features:\n${confirmedEls.map((e) => `  • ${describeElement(e, shape)}`).join('\n')}`);
  return `${kind === 'facade' ? 'FACADE' : kind === 'outdoor' ? 'SPACE' : 'ROOM'}\n${lines.join('\n')}`;
}

export function buildConstraints(ctx: PackageContext, shape: RoomShapeResult = computeRoomShape(ctx.room)): ConstraintItem[] {
  const { room, settings } = ctx;
  const kind = spaceKind(room.type);
  const disabled = new Set(settings.disabledConstraintKeys);
  const out: ConstraintItem[] = [];
  const add = (key: string, text: string, source: ConstraintItem['source']) => out.push({ key, text, source, enabled: !disabled.has(key) });

  const g = room.geometry;
  const dimsConfirmed =
    g.shape === 'custom' ? shape.drawable && shape.area.certainty === 'confirmed' : g.length.certainty === 'confirmed' && g.width.certainty === 'confirmed';
  const dimsText = dimsConfirmed
    ? g.shape === 'custom'
      ? ` (${m(shape.bounds.width)} × ${m(shape.bounds.height)} overall)`
      : ` (${m(g.length.mm)} × ${m(g.width.mm)})`
    : '';
  const ceilText =
    kind !== 'interior'
      ? ''
      : room.ceilingHeight.certainty === 'confirmed' && room.ceilingHeight.mm !== null
        ? ` and its ceiling height (${m(room.ceilingHeight.mm)})`
        : ' and its ceiling height';
  add(
    'dims',
    kind === 'facade'
      ? 'The building’s overall shape, height, number of floors and proportions — keep exactly as existing.'
      : `The ${kind === 'outdoor' ? 'space' : 'room'}’s footprint and proportions${dimsText}${ceilText} — keep exactly as existing.`,
    'dimensions',
  );
  for (const el of room.elements) {
    if (el.status !== 'confirmed' || !el.preserve) continue;
    add(`el:${el.id}`, `${describeElement(el, shape)} — keep exactly in place, same size and shape.`, 'element');
  }
  room.fixedConstraints.forEach((t, i) => {
    if (t.trim()) add(`fixed:${i}`, t.trim(), 'fixed');
  });
  for (const r of ctx.requirements) {
    if (r.status === 'rejected' || r.category !== 'architectural' || r.priority !== 'must' || r.kind !== 'want') continue;
    add(
      `req:${r.id}`,
      `${r.title.trim()}${r.description.trim() && r.description.trim() !== r.title.trim() ? ` — ${r.description.trim().replace(/\s+/g, ' ')}` : ''}`,
      'requirement',
    );
  }
  add(
    'rule:openings',
    kind === 'facade'
      ? 'Do not add, remove, move or resize windows, doors, balconies or other openings.'
      : 'Do not add, remove, move or resize any window, door, column, beam or AC unit, and do not add new openings or structural features.',
    'rule',
  );
  settings.extraConstraints
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .forEach((t, i) => out.push({ key: `extra:${i}`, text: t, source: 'one-off', enabled: true }));
  return out;
}

function directionSection(ctx: PackageContext): string {
  const d = ctx.room.direction;
  const override = ctx.settings.directionOverride.trim();
  const lines: string[] = [];
  if (!directionIsEmpty(d)) {
    if (d.style) lines.push(`- Style: ${d.style}`);
    if (d.atmosphere) lines.push(`- Atmosphere: ${d.atmosphere}`);
    if (d.palette.length)
      lines.push(`- Color palette: ${d.palette.map((c) => `${c.name || 'color'} ${c.hex}${c.role ? ` (${c.role.toLowerCase()})` : ''}`).join('; ')}`);
    if (d.paletteNotes) lines.push(`- Palette notes: ${d.paletteNotes}`);
    if (d.materials) lines.push(`- Materials: ${d.materials}`);
    if (d.woodType) lines.push(`- Wood: ${d.woodType}`);
    if (d.flooring) lines.push(`- Flooring: ${d.flooring}`);
    if (d.wallFinishes) lines.push(`- Wall finishes: ${d.wallFinishes}`);
    if (d.furnitureStyle) lines.push(`- Furniture style: ${d.furnitureStyle}`);
    if (d.lighting) lines.push(`- Lighting: ${d.lighting}`);
    if (d.curtains) lines.push(`- Curtains: ${d.curtains}`);
    if (d.description) lines.push(`- Overall: ${d.description.replace(/\s+/g, ' ')}`);
    if (d.avoid) lines.push(`- Avoid in this room's style: ${d.avoid}`);
  }
  if (override) lines.push(`- For this version specifically: ${override.replace(/\s+/g, ' ')}`);
  const head = 'DESIGN DIRECTION — for this room only (other rooms in the house have their own independent styles; do not mix them in)';
  if (!lines.length)
    return `${head}\n- No specific style has been set. Derive the style from the requirements and reference images, keeping it coherent and restrained.`;
  return `${head}\n${lines.join('\n')}`;
}

function wallSection(shape: RoomShapeResult): string {
  const lines: string[] = [];
  for (const s of shape.segments) {
    const d = s.wall?.design;
    if (!d) continue;
    const parts = [
      d.cladding && `cladding/finish: ${d.cladding}`,
      d.tv && `TV: ${d.tv}`,
      d.artwork && `artwork: ${d.artwork}`,
      d.lighting && `lighting: ${d.lighting}`,
      d.furniture && `furniture: ${d.furniture}`,
      d.other && d.other,
    ].filter(Boolean);
    if (parts.length) lines.push(`- ${s.name} wall: ${parts.join('; ')}`);
  }
  return lines.length ? `WALL-SPECIFIC INTENTIONS\n${lines.join('\n')}` : '';
}

function layoutSection(room: Room, shape: RoomShapeResult): string {
  if (!shape.drawable || !room.layout.items.length) return '';
  const lines = room.layout.items.map((it) => {
    const poly = furniturePolygon(it);
    let best: { name: string; d: number } | null = null;
    for (const s of shape.segments) {
      if (!s.start || !s.end) continue;
      let d = Infinity;
      for (let k = 0; k < poly.length; k++) d = Math.min(d, segmentDistance(poly[k], poly[(k + 1) % poly.length], s.start, s.end));
      if (!best || d < best.d) best = { name: s.name, d };
    }
    const size = `${Math.round(it.width / 10)} × ${Math.round(it.depth / 10)} cm${it.height ? `, ${Math.round(it.height / 10)} cm tall` : ''}${it.dimsStatus === 'estimated' ? ', approximate size' : ''}`;
    const pos = `centre about ${m(it.x - shape.bounds.minX)} from the west side and ${m(it.y - shape.bounds.minY)} from the north side`;
    const wall = best ? (best.d < 150 ? `, against the ${best.name} wall` : `, ${m(best.d)} from the ${best.name} wall`) : '';
    const rot = it.rotation % 180 !== 0 ? `, rotated ${Math.round(it.rotation)}°` : '';
    return `- ${it.name} (${size}): ${pos}${wall}${rot}`;
  });
  return `FURNITURE LAYOUT (planned by the homeowner on a 2D plan — follow this arrangement; positions approximate)\n${lines.join('\n')}`;
}

function renderSection(ctx: PackageContext, shape: RoomShapeResult, hasBase: boolean, iterating: boolean, warnings: PackageWarning[]): string {
  const s = ctx.settings;
  let angle = s.cameraAngle;
  if (angle === 'match-photo' && !hasBase) {
    angle = 'eye-level';
    warnings.push({ level: 'info', message: '“Match the photo” needs a base photo; a standing eye-level view will be used instead.' });
  }
  const angleText =
    angle === 'match-photo' && iterating
      ? 'Keep exactly the same camera position, angle and framing as Image 1.'
      : CAMERA_ANGLES.find((a) => a.value === angle)?.prompt;
  const nameOf = (id: string) => shape.segments.find((x) => x.id === id)?.name ?? id;
  const position =
    angle !== 'match-photo' && (s.cameraFrom || s.cameraFacing)
      ? `Camera placed ${s.cameraFrom ? `near the ${nameOf(s.cameraFrom)} wall` : 'inside the room'}${s.cameraFacing ? `, looking towards the ${nameOf(s.cameraFacing)} wall` : ''}.`
      : '';
  const kind = spaceKind(ctx.room.type);
  const light = TIMES_OF_DAY.find((t) => t.value === s.timeOfDay)?.prompt ?? 'natural daylight';
  const lines = [
    `- Viewpoint: ${joinNonEmpty([angleText, position, s.cameraNotes.trim()])}`,
    `- Lens: ${LENSES.find((l) => l.value === s.lens)?.prompt}.`,
    `- Light: ${light}${kind === 'interior' ? ' (daylight only through the existing windows)' : ''}.`,
    `- Image style: ${REALISM.find((r) => r.value === s.realism)?.prompt}.`,
  ];
  if (s.prioritize.length) lines.push(`- Prioritise: ${s.prioritize.join(', ')}.`);
  if (s.avoid.trim()) lines.push(`- Avoid in the image: ${s.avoid.trim()}.`);
  return `RENDER\n${lines.join('\n')}`;
}
