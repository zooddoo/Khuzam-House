import { describe, expect, it } from 'vitest';
import type { ArchElement, Room, RoomGeometry, Wall } from '../types';
import { combineCertainty, formatInputValue, formatLength, parseLength } from '../units';
import { computeRoomShape, createWall, elementIssues, syncWalls, toCustomGeometry, toRectangleGeometry, wallAreas } from './room';
import { offsetPolygon, polygonArea, signedArea } from './polygon';

function geometry(partial: Partial<RoomGeometry> = {}): RoomGeometry {
  return {
    shape: 'rectangle',
    length: { mm: null, certainty: 'unknown' },
    width: { mm: null, certainty: 'unknown' },
    lCutout: { length: { mm: null, certainty: 'unknown' }, width: { mm: null, certainty: 'unknown' }, corner: 'ne' },
    customOrigin: { x: 0, y: 0 },
    source: '',
    ...partial,
  };
}

function roomWith(g: RoomGeometry, walls: Wall[] = syncWalls(g, []), elements: ArchElement[] = []): Room {
  return {
    id: 'r1',
    name: 'Test',
    type: 'living',
    floorId: null,
    status: 'not-started',
    coverReferenceId: null,
    description: '',
    displayUnit: 'm',
    geometry: g,
    ceilingHeight: { mm: 3000, certainty: 'confirmed' },
    walls,
    elements,
    layout: {
      items: [],
      clearanceMm: 600,
      checks: { overlap: true, bounds: true, doors: true, windows: true, ac: true, clearance: true, architecture: true },
      gridMm: 100,
      snap: true,
    },
    direction: {} as Room['direction'],
    preliminaryConcept: '',
    fixedConstraints: [],
    useHouseGuidelines: false,
    approvedVersionId: null,
    planPlacement: null,
    lastGeneration: null,
    order: 0,
    createdAt: '',
    updatedAt: '',
  };
}

const m = (mm: number, certainty: 'confirmed' | 'estimated' = 'confirmed') => ({ mm, certainty });

describe('units', () => {
  it('parses numbers in the display unit and explicit suffixes', () => {
    expect(parseLength('6.2', 'm')).toEqual({ ok: true, mm: 6200 });
    expect(parseLength('620', 'cm')).toEqual({ ok: true, mm: 6200 });
    expect(parseLength('6200mm', 'm')).toEqual({ ok: true, mm: 6200 });
    expect(parseLength('4,8', 'm')).toEqual({ ok: true, mm: 4800 });
    expect(parseLength('٤٫٥', 'm').ok).toBe(false); // Arabic decimal separator is not supported, reported as invalid
    expect(parseLength('٤', 'm')).toEqual({ ok: true, mm: 4000 });
  });

  it('treats empty input as unknown and rejects invalid values', () => {
    expect(parseLength('', 'm')).toEqual({ ok: true, mm: null });
    expect(parseLength('abc', 'm').ok).toBe(false);
    expect(parseLength('0', 'm').ok).toBe(false);
    expect(parseLength('-2', 'm').ok).toBe(false);
    expect(parseLength('500', 'm').ok).toBe(false);
  });

  it('formats values without inventing precision', () => {
    expect(formatLength(6200, 'm')).toBe('6.2 m');
    expect(formatLength(null, 'm')).toBe('Unknown');
    expect(formatInputValue(6250, 'm')).toBe('6.25');
    expect(formatInputValue(6250, 'cm')).toBe('625');
  });

  it('derived certainty is the weakest input', () => {
    expect(combineCertainty('confirmed', 'estimated')).toBe('estimated');
    expect(combineCertainty('confirmed', 'unknown')).toBe('unknown');
    expect(combineCertainty('confirmed', 'confirmed')).toBe('confirmed');
  });
});

describe('rectangular rooms', () => {
  it('computes area and perimeter, and updates when dimensions change', () => {
    const g = geometry({ length: m(6200), width: m(4800) });
    const shape = computeRoomShape(roomWith(g));
    expect(shape.drawable).toBe(true);
    expect(shape.area.mm2).toBeCloseTo(6200 * 4800);
    expect(shape.area.certainty).toBe('confirmed');
    expect(shape.perimeter.mm).toBe(2 * (6200 + 4800));

    const g2 = { ...g, length: m(7000, 'estimated') };
    const shape2 = computeRoomShape(roomWith(g2));
    expect(shape2.area.mm2).toBeCloseTo(7000 * 4800);
    expect(shape2.area.certainty).toBe('estimated');
  });

  it('reports unknown area and missing inputs when a dimension is unknown', () => {
    const shape = computeRoomShape(roomWith(geometry({ length: m(5000) })));
    expect(shape.drawable).toBe(false);
    expect(shape.area.mm2).toBeNull();
    expect(shape.missing).toEqual(['Width']);
  });

  it('derives four named walls N/E/S/W with matching lengths', () => {
    const g = geometry({ length: m(6000), width: m(4000) });
    const walls = syncWalls(g, []);
    expect(walls.map((w) => w.id)).toEqual(['N', 'E', 'S', 'W']);
    expect(walls.map((w) => w.name)).toEqual(['North', 'East', 'South', 'West']);
    const shape = computeRoomShape(roomWith(g, walls));
    expect(shape.segments.map((s) => s.length.mm)).toEqual([6000, 4000, 6000, 4000]);
    expect(shape.segments.map((s) => s.compass)).toEqual(['N', 'E', 'S', 'W']);
  });

  it('keeps renamed walls and wall metadata when dimensions change', () => {
    const g = geometry({ length: m(6000), width: m(4000) });
    const walls = syncWalls(g, []).map((w) => (w.id === 'N' ? { ...w, name: 'TV wall', autoName: false, notes: 'keep' } : w));
    const resized = syncWalls({ ...g, length: m(6500) }, walls);
    expect(resized[0].name).toBe('TV wall');
    expect(resized[0].notes).toBe('keep');
    expect(resized[0].length.mm).toBe(6500);
  });

  it('computes gross and net wall areas', () => {
    const g = geometry({ length: m(5000), width: m(4000) });
    const el: ArchElement = {
      id: 'w1',
      type: 'window',
      subtype: 'Window',
      label: 'Window',
      placement: 'wall',
      wallId: 'N',
      offset: 1000,
      x: null,
      y: null,
      rotation: 0,
      width: 2000,
      height: 1500,
      depth: null,
      elevation: 900,
      door: null,
      status: 'confirmed',
      preserve: true,
      notes: '',
    };
    const room = roomWith(g, syncWalls(g, []), [el]);
    const rows = wallAreas(room);
    const north = rows.find((r) => r.wallId === 'N')!;
    expect(north.grossMm2).toBe(5000 * 3000);
    expect(north.netMm2).toBe(5000 * 3000 - 2000 * 1500);
  });
});

describe('L-shaped rooms', () => {
  it('subtracts the cut-out from the area and produces six walls', () => {
    const g = geometry({
      shape: 'l-shape',
      length: m(8000),
      width: m(6000),
      lCutout: { length: m(3000), width: m(2000), corner: 'ne' },
    });
    const shape = computeRoomShape(roomWith(g));
    expect(shape.drawable).toBe(true);
    expect(shape.area.mm2).toBeCloseTo(8000 * 6000 - 3000 * 2000);
    expect(shape.segments).toHaveLength(6);
    expect(shape.perimeter.mm).toBe(2 * (8000 + 6000));
    expect(signedArea(shape.vertices)).toBeGreaterThan(0);
  });

  it.each(['nw', 'ne', 'se', 'sw'] as const)('builds a closed, clockwise outline for a %s cut-out', (corner) => {
    const g = geometry({ shape: 'l-shape', length: m(8000), width: m(6000), lCutout: { length: m(3000), width: m(2000), corner } });
    const shape = computeRoomShape(roomWith(g));
    const last = shape.segments[shape.segments.length - 1];
    expect(last.end!.x).toBeCloseTo(shape.segments[0].start!.x);
    expect(last.end!.y).toBeCloseTo(shape.segments[0].start!.y);
    expect(polygonArea(shape.vertices)).toBeCloseTo(8000 * 6000 - 3000 * 2000);
  });

  it('rejects a cut-out larger than the room', () => {
    const g = geometry({ shape: 'l-shape', length: m(4000), width: m(4000), lCutout: { length: m(5000), width: m(1000), corner: 'se' } });
    const shape = computeRoomShape(roomWith(g));
    expect(shape.drawable).toBe(false);
    expect(shape.issues.some((i) => i.level === 'error')).toBe(true);
  });
});

describe('custom wall segments', () => {
  const wall = (id: string, len: number, heading: number) => createWall(id, id, { length: m(len), heading });

  it('closes a valid custom polygon and computes its area', () => {
    const walls = [wall('a', 5000, 0), wall('b', 3000, 90), wall('c', 2000, 180), wall('d', 1000, 90), wall('e', 3000, 180), wall('f', 4000, 270)];
    const room = roomWith(geometry({ shape: 'custom' }), walls);
    const shape = computeRoomShape(room);
    expect(shape.drawable).toBe(true);
    expect(shape.closureGapMm).toBeCloseTo(0);
    expect(shape.area.mm2).toBeCloseTo(5000 * 3000 + 3000 * 1000);
    expect(shape.issues.filter((i) => i.level !== 'info')).toHaveLength(0);
  });

  it('warns when wall lengths cannot form a closed room', () => {
    const walls = [wall('a', 5000, 0), wall('b', 3000, 90), wall('c', 4500, 180), wall('d', 3000, 270)];
    const shape = computeRoomShape(roomWith(geometry({ shape: 'custom' }), walls));
    expect(shape.closureGapMm).toBeCloseTo(500);
    expect(shape.issues.some((i) => i.code === 'not-closed')).toBe(true);
    expect(shape.area.certainty).toBe('estimated');
  });

  it('flags unknown wall lengths as missing instead of guessing', () => {
    const walls = [wall('a', 5000, 0), createWall('b', 'b', { heading: 90 }), wall('c', 5000, 180), wall('d', 3000, 270)];
    const shape = computeRoomShape(roomWith(geometry({ shape: 'custom' }), walls));
    expect(shape.drawable).toBe(false);
    expect(shape.area.mm2).toBeNull();
    expect(shape.missing).toEqual(['b length']);
  });

  it('converts a rectangle to custom walls and back without loss', () => {
    const g = geometry({ length: m(6000), width: m(4000) });
    const room = roomWith(g);
    const custom = toCustomGeometry(room);
    expect(custom.walls.map((w) => [w.length.mm, w.heading])).toEqual([
      [6000, 0],
      [4000, 90],
      [6000, 180],
      [4000, 270],
    ]);
    const back = toRectangleGeometry(roomWith(custom.geometry, custom.walls));
    expect(back.lossy).toBe(false);
    expect(back.geometry.length.mm).toBe(6000);
    expect(back.geometry.width.mm).toBe(4000);
  });
});

describe('architectural element checks', () => {
  it('warns when an element extends beyond its wall or a wall is missing', () => {
    const g = geometry({ length: m(4000), width: m(3000) });
    const base: ArchElement = {
      id: 'd1',
      type: 'door',
      subtype: 'Single door',
      label: 'Door',
      placement: 'wall',
      wallId: 'E',
      offset: 2500,
      x: null,
      y: null,
      rotation: 0,
      width: 900,
      height: 2100,
      depth: null,
      elevation: 0,
      door: { hinge: 'left', swing: 'in' },
      status: 'confirmed',
      preserve: true,
      notes: '',
    };
    const issues = elementIssues(roomWith(g, syncWalls(g, []), [base, { ...base, id: 'd2', label: 'Ghost', wallId: 'N9' }]));
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(['beyond-wall', 'missing-wall']));
  });
});

describe('polygon offset', () => {
  it('offsets a rectangle outward', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const out = offsetPolygon(rect, 10);
    expect(polygonArea(out)).toBeCloseTo(120 * 70);
  });
});
