import { describe, expect, it } from 'vitest';
import type { ArchElement, FurnitureItem, RoomGeometry } from '../types';
import { computeRoomShape, syncWalls } from '../geometry/room';
import { validateLayout } from './validate';

const g: RoomGeometry = {
  shape: 'rectangle',
  length: { mm: 6000, certainty: 'confirmed' },
  width: { mm: 4000, certainty: 'confirmed' },
  lCutout: { length: { mm: null, certainty: 'unknown' }, width: { mm: null, certainty: 'unknown' }, corner: 'ne' },
  customOrigin: { x: 0, y: 0 },
  source: '',
};
const shape = computeRoomShape({ geometry: g, walls: syncWalls(g, []) });
const checks = { overlap: true, bounds: true, doors: true, windows: true, ac: true, clearance: true, architecture: true };

function item(id: string, x: number, y: number, w: number, d: number, extra: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id,
    name: id,
    category: 'other',
    shape: 'rect',
    x,
    y,
    width: w,
    depth: d,
    height: null,
    rotation: 0,
    dimsStatus: 'confirmed',
    layer: 'standard',
    color: '',
    notes: '',
    libraryItemId: null,
    locked: false,
    ignoreClearance: false,
    ...extra,
  };
}

function el(partial: Partial<ArchElement>): ArchElement {
  return {
    id: 'e',
    type: 'door',
    subtype: 'Single door',
    label: 'Door',
    placement: 'wall',
    wallId: 'S',
    offset: 1000,
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
    ...partial,
  };
}

const run = (items: FurnitureItem[], elements: ArchElement[] = [], clearanceMm = 600) =>
  validateLayout({ shape, elements, items, layout: { clearanceMm, checks } });

describe('layout validation', () => {
  it('reports no problems for a well-placed item', () => {
    expect(run([item('Sofa', 3000, 2000, 2000, 900)])).toEqual([]);
  });

  it('detects furniture outside the room', () => {
    const w = run([item('Sofa', 5800, 2000, 1000, 900)]);
    expect(w.map((x) => x.code)).toContain('bounds');
  });

  it('detects overlapping furniture but ignores rugs and tucked chairs', () => {
    expect(run([item('A', 3000, 2000, 1000, 1000), item('B', 3500, 2000, 1000, 1000)]).map((x) => x.code)).toContain('overlap');
    expect(run([item('A', 3000, 2000, 1000, 1000), item('Rug', 3000, 2000, 2000, 1500, { layer: 'floor' })]).map((x) => x.code)).not.toContain('overlap');
    const tucked = run([item('Table', 3000, 2000, 2000, 1000, { category: 'dining-table' }), item('Chair', 3000, 1500, 500, 550, { category: 'chair' })]);
    expect(tucked.map((x) => x.code)).not.toContain('overlap');
  });

  it('flags furniture inside a door swing', () => {
    // South wall runs east→west, so offset 1000 from its left end (SE corner) puts the door near x = 5000.
    const w = run([item('Cabinet', 4600, 3600, 600, 400)], [el({})]);
    expect(w.some((x) => x.code === 'door')).toBe(true);
  });

  it('flags tall furniture in front of a window only when it rises above the sill', () => {
    const win = el({ id: 'w', type: 'window', subtype: 'Window', label: 'Window', wallId: 'N', offset: 2000, width: 1500, elevation: 900, door: null });
    expect(run([item('Wardrobe', 2750, 300, 1000, 600, { height: 2200 })], [win]).some((x) => x.code === 'window' && x.level === 'warning')).toBe(true);
    expect(run([item('Bench', 2750, 300, 1000, 400, { height: 450 })], [win]).some((x) => x.code === 'window')).toBe(false);
    expect(run([item('Unknown', 2750, 300, 1000, 400)], [win]).some((x) => x.code === 'window' && x.level === 'info')).toBe(true);
  });

  it('flags tall furniture under a wall AC unit', () => {
    const ac = el({
      id: 'ac',
      type: 'ac',
      subtype: 'Wall split unit',
      label: 'AC',
      wallId: 'W',
      offset: 1500,
      width: 900,
      height: 300,
      elevation: 2200,
      door: null,
    });
    // West wall runs south→north; offset from its left end (SW corner).
    const w = run([item('Shelf', 400, 2050, 800, 400, { height: 2100 })], [ac]);
    expect(w.some((x) => x.code === 'ac')).toBe(true);
  });

  it('reports narrow passages below the user threshold, but not intentional adjacency', () => {
    const narrow = run([item('Bed', 3000, 2000, 1600, 2000), item('Desk', 4300, 2000, 600, 600)], [], 600);
    expect(narrow.some((x) => x.code === 'clearance')).toBe(true);
    const adjacent = run([item('Bed', 3000, 2000, 1600, 2000), item('Nightstand', 4050, 1300, 500, 400)], [], 600);
    expect(adjacent.some((x) => x.code === 'clearance')).toBe(false);
  });

  it('lists elements with unknown positions instead of guessing', () => {
    const w = run([], [el({ offset: null })]);
    expect(w.some((x) => x.code === 'unchecked' && x.elementIds.includes('e'))).toBe(true);
  });

  it('does not run when the room outline is unknown', () => {
    const unknown = computeRoomShape({ geometry: { ...g, width: { mm: null, certainty: 'unknown' } }, walls: [] });
    const w = validateLayout({ shape: unknown, elements: [], items: [item('A', 0, 0, 10, 10)], layout: { clearanceMm: 600, checks } });
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe('unchecked');
  });
});
