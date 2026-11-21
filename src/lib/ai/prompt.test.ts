import { describe, expect, it } from 'vitest';
import type { ArchElement, Reference, Requirement, Room } from '../types';
import { createElementRecord, createReferenceRecord, createRequirementRecord, createRoomRecord, defaultGenerationSettings } from '../db/factories';
import { buildGenerationPackage, defaultImageSelection, type PackageContext } from './prompt';
import type { ProviderCapabilities } from './providers/types';

const caps = (over: Partial<ProviderCapabilities> = {}): ProviderCapabilities => ({
  textToImage: true,
  imageInput: true,
  maxImages: 16,
  maxPromptChars: 32000,
  variationsMax: 4,
  quality: true,
  aspects: ['landscape', 'square', 'portrait'],
  requiresBaseImage: false,
  preservation: 'moderate',
  notes: [],
  ...over,
});

function measuredRoom(): Room {
  const room = createRoomRecord({ name: 'Living & Dining', type: 'living-dining', preliminaryConcept: 'Warm minimalist, beige neutrals' });
  room.geometry.length = { mm: 6200, certainty: 'confirmed' };
  room.geometry.width = { mm: 4800, certainty: 'confirmed' };
  room.ceilingHeight = { mm: 3100, certainty: 'estimated' };
  return room;
}

function ctx(room: Room, extra: Partial<PackageContext> = {}): PackageContext {
  return {
    projectName: 'Bait Khuzam',
    location: 'Riyadh, Saudi Arabia',
    room,
    floorName: null,
    requirements: [],
    references: [],
    libraryItems: [],
    baseVersion: null,
    settings: defaultGenerationSettings(),
    capabilities: caps(),
    houseGuidelines: '',
    ...extra,
  };
}

const el = (partial: Partial<ArchElement>) => createElementRecord(partial.type ?? 'window', partial);

describe('generation package — facts', () => {
  it('declares unknown dimensions instead of inventing them', () => {
    const room = createRoomRecord({ name: 'Library', type: 'library' });
    const pkg = buildGenerationPackage(ctx(room));
    expect(pkg.prompt).toContain('Footprint dimensions: unknown');
    expect(pkg.prompt).toContain('UNKNOWN (do not invent)');
    expect(pkg.prompt).toContain('Ceiling height — follow the photographs');
    expect(pkg.prompt).not.toMatch(/\d+\.\d{2} m \(east–west\)/);
  });

  it('marks confirmed and estimated values distinctly', () => {
    const pkg = buildGenerationPackage(ctx(measuredRoom()));
    expect(pkg.prompt).toContain('6.20 m (east–west) [confirmed]');
    expect(pkg.prompt).toContain('Ceiling height: 3.10 m [estimated — not verified]');
  });

  it('never uses the unadopted preliminary concept', () => {
    const pkg = buildGenerationPackage(ctx(measuredRoom()));
    expect(pkg.prompt).not.toContain('beige neutrals');
    expect(pkg.prompt).toContain('No specific style has been set');
  });
});

describe('generation package — DO NOT CHANGE', () => {
  it('locks confirmed elements, describes estimated ones as approximate and unknown ones as unknown', () => {
    const room = measuredRoom();
    room.elements = [
      el({ type: 'window', label: 'Window', wallId: 'N', offset: 1200, width: 1800, height: 1500, elevation: 900, status: 'confirmed' }),
      el({ type: 'ac', label: 'AC unit', subtype: 'Wall split unit', wallId: 'E', offset: 1500, width: 900, elevation: 2200, status: 'estimated' }),
      el({ type: 'column', label: 'Column', placement: 'free', status: 'unknown' }),
    ];
    const pkg = buildGenerationPackage(ctx(room));
    const dnc = pkg.prompt.split('DO NOT CHANGE')[1].split('\n\n')[0];
    expect(dnc).toContain('Window on the North wall — 1.80 m wide, 1.50 m high, sill 0.90 m above the floor, starting 1.20 m from the west end');
    expect(dnc).not.toContain('Wall split unit');
    expect(pkg.prompt).toContain('APPROXIMATE FEATURES');
    expect(pkg.prompt).toMatch(/APPROXIMATE FEATURES[\s\S]*Wall split unit on the East wall/);
    expect(pkg.prompt).toMatch(/UNKNOWN \(do not invent\)[\s\S]*Column[\s\S]*not confirmed/);
  });

  it('moves an unticked constraint to the explicitly-allowed list', () => {
    const room = measuredRoom();
    const win = el({ type: 'window', label: 'Window', wallId: 'N', offset: 1000, width: 1500, status: 'confirmed' });
    room.elements = [win];
    const settings = { ...defaultGenerationSettings(), disabledConstraintKeys: [`el:${win.id}`] };
    const pkg = buildGenerationPackage(ctx(room, { settings }));
    expect(pkg.constraints.find((c) => c.key === `el:${win.id}`)?.enabled).toBe(false);
    expect(pkg.prompt).toContain('CHANGES THE HOMEOWNER EXPLICITLY ALLOWS IN THIS VERSION');
  });

  it('includes user fixed constraints and must-have architectural requirements', () => {
    const room = measuredRoom();
    room.fixedConstraints = ['Keep the existing marble floor'];
    const req = createRequirementRecord(room.id, { title: 'Keep the staircase', category: 'architectural', priority: 'must' });
    const pkg = buildGenerationPackage(ctx(room, { requirements: [req] }));
    const texts = pkg.constraints.filter((c) => c.enabled).map((c) => c.text);
    expect(texts).toContain('Keep the existing marble floor');
    expect(texts.some((t) => t.startsWith('Keep the staircase'))).toBe(true);
  });
});

describe('generation package — requirements and images', () => {
  function setup() {
    const room = measuredRoom();
    const photo = createReferenceRecord('img-photo', { kind: 'site-photo', roomIds: [room.id], title: 'North view' });
    const must: Requirement = createRequirementRecord(room.id, { title: 'Reading corner by the window', category: 'layout', priority: 'must' }, 0);
    const avoid: Requirement = createRequirementRecord(room.id, { title: 'No glossy cabinets', kind: 'avoid', priority: 'preferred' }, 1);
    const rejected: Requirement = createRequirementRecord(room.id, { title: 'Bright red sofa', status: 'rejected' }, 2);
    const chairRef: Reference = createReferenceRecord('img-chair', {
      roomIds: [room.id],
      requirementIds: [must.id],
      title: 'Two lounge chairs',
      intent: 'want',
    });
    const glossRef: Reference = createReferenceRecord('img-gloss', {
      roomIds: [room.id],
      requirementIds: [avoid.id],
      title: 'Glossy kitchen',
      intent: 'avoid',
    });
    const mood: Reference = createReferenceRecord('img-mood', { roomIds: [room.id], directionRoomIds: [room.id], title: 'Mood' });
    const refs = [photo, chairRef, glossRef, mood];
    const reqs = [must, avoid, rejected];
    const sel = defaultImageSelection(room, reqs, refs);
    const settings = { ...defaultGenerationSettings(), ...sel };
    return { room, refs, reqs, settings, must, avoid, rejected, photo, chairRef };
  }

  it('selects the site photo as base and keeps images tied to their requirement', () => {
    const { room, refs, reqs, settings } = setup();
    expect(settings.baseReferenceId).toBe(refs[0].id);
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, references: refs, settings }));
    expect(pkg.prompt).toContain('Image 1 — PHOTO OF THE ACTUAL ROOM TO REDESIGN');
    expect(pkg.prompt).toMatch(/Reading corner by the window \(see Image 2\)/);
    expect(pkg.prompt).toMatch(/Image 2 — Reference for the requirement “Reading corner by the window”/);
    expect(pkg.prompt).toMatch(/Image 3 — Example of what to AVOID for the requirement “No glossy cabinets”/);
    expect(pkg.prompt).toMatch(/DO NOT INCLUDE[\s\S]*No glossy cabinets \(example of what to avoid: Image 3\)/);
  });

  it('leaves rejected requirements out', () => {
    const { room, refs, reqs, settings } = setup();
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, references: refs, settings }));
    expect(pkg.prompt).not.toContain('Bright red sofa');
    expect(pkg.activeRequirements.map((r) => r.title)).not.toContain('Bright red sofa');
  });

  it('respects the model image limit and says which images are only described', () => {
    const { room, refs, reqs, settings } = setup();
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, references: refs, settings, capabilities: caps({ maxImages: 2 }) }));
    expect(pkg.images.filter((i) => i.sent)).toHaveLength(2);
    expect(pkg.warnings.some((w) => w.message.includes("exceed the model's limit of 2"))).toBe(true);
    expect(pkg.prompt).toContain('REFERENCE IMAGES DESCRIBED IN TEXT (not attached)');
  });

  it('sends no images to a text-only model and warns about it', () => {
    const { room, refs, reqs, settings } = setup();
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, references: refs, settings, capabilities: caps({ imageInput: false, maxImages: 0 }) }));
    expect(pkg.images.every((i) => !i.sent)).toBe(true);
    expect(pkg.warnings.some((w) => w.message.includes("can't take images"))).toBe(true);
  });

  it('numbers images for manual use when no provider is configured', () => {
    const { room, refs, reqs, settings } = setup();
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, references: refs, settings, capabilities: null }));
    expect(pkg.images.every((i) => !i.sent)).toBe(true);
    expect(pkg.prompt).toContain('INPUT IMAGES (attach them in this order)');
  });

  it('blocks structure-only models without a base photo', () => {
    const room = measuredRoom();
    const pkg = buildGenerationPackage(ctx(room, { capabilities: caps({ requiresBaseImage: true, textToImage: false }) }));
    expect(pkg.warnings.some((w) => w.level === 'blocker')).toBe(true);
  });
});

describe('generation package — room independence and options', () => {
  it('only includes house-wide guidelines when the room opts in', () => {
    const room = measuredRoom();
    const off = buildGenerationPackage(ctx(room, { houseGuidelines: 'Same oak doors everywhere' }));
    expect(off.prompt).not.toContain('Same oak doors everywhere');
    const on = buildGenerationPackage(ctx({ ...room, useHouseGuidelines: true }, { houseGuidelines: 'Same oak doors everywhere' }));
    expect(on.prompt).toContain('HOUSE-WIDE GUIDELINES');
  });

  it('labels the direction as specific to this room', () => {
    const room = measuredRoom();
    room.direction.style = 'Japandi';
    const pkg = buildGenerationPackage(ctx(room));
    expect(pkg.prompt).toContain('DESIGN DIRECTION — for this room only');
    expect(pkg.prompt).toContain('Style: Japandi');
  });

  it('shortens the prompt to fit a small limit', () => {
    const room = measuredRoom();
    const reqs = Array.from({ length: 30 }, (_, i) =>
      createRequirementRecord(room.id, { title: `Requirement ${i}`, description: 'x'.repeat(200), priority: 'optional' }, i),
    );
    const pkg = buildGenerationPackage(ctx(room, { requirements: reqs, capabilities: caps({ maxPromptChars: 4000 }) }));
    expect(pkg.prompt.length).toBeLessThanOrEqual(4000);
    expect(pkg.truncated).toBe(true);
  });

  it('uses a manually edited prompt when provided', () => {
    const room = measuredRoom();
    const pkg = buildGenerationPackage(ctx(room, { settings: { ...defaultGenerationSettings(), promptOverride: 'My own prompt' } }));
    expect(pkg.prompt).toBe('My own prompt');
  });
});

describe('generation package — English only', () => {
  const arabicReq = () =>
    createRequirementRecord('room', { title: 'جلسة أرضية منخفضة', description: 'مع وسائد بلون البيج', status: 'included', priority: 'must' });

  it('never puts Arabic into the prompt and blocks until every Arabic text has English', () => {
    const room = measuredRoom();
    room.nameAr = 'المعيشة والطعام';
    const req = { ...arabicReq(), roomId: room.id };
    const pkg = buildGenerationPackage(ctx(room, { requirements: [req] }));
    expect(pkg.untranslated.map((u) => u.source).sort()).toEqual(['جلسة أرضية منخفضة', 'مع وسائد بلون البيج'].sort());
    expect(pkg.warnings[0].level).toBe('blocker');
  });

  it('uses the English from the translation memory and records what was used', async () => {
    const { translationId } = await import('../translate/core');
    const room = measuredRoom();
    const req = { ...arabicReq(), roomId: room.id };
    const t = (source: string, en: string) => [translationId(source), { id: translationId(source), source, en, method: 'manual' as const, updatedAt: '' }] as const;
    const translations = new Map([t('جلسة أرضية منخفضة', 'Low floor seating'), t('مع وسائد بلون البيج', 'with beige cushions')]);
    const pkg = buildGenerationPackage(ctx(room, { requirements: [req], translations }));
    expect(pkg.untranslated).toEqual([]);
    expect(pkg.prompt).toContain('Low floor seating');
    expect(pkg.prompt).not.toMatch(/[؀-ۿ]/);
    expect(pkg.translationsUsed).toHaveLength(2);
  });

  it('writes labels and measurements in English even when the interface is Arabic', async () => {
    const { setPrefs } = await import('../../i18n/prefs');
    setPrefs({ lang: 'ar', digits: 'arab' });
    try {
      const pkg = buildGenerationPackage(ctx(measuredRoom()));
      expect(pkg.prompt).not.toMatch(/[؀-ۿ٠-٩]/);
      expect(pkg.prompt).toContain('6.20 m');
      expect(pkg.warnings.every((w) => /[؀-ۿ]/.test(w.message))).toBe(true);
    } finally {
      setPrefs({ lang: 'en', digits: 'latn' });
    }
  });
});
