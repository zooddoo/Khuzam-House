import type { Reference, Requirement, RequirementSnapshot, Room, RoomSnapshot } from '../types';

function clone<T>(v: T): T {
  return structuredClone(v);
}

export function snapshotRoom(room: Room): RoomSnapshot {
  return {
    name: room.name,
    type: room.type,
    geometry: clone(room.geometry),
    ceilingHeight: clone(room.ceilingHeight),
    walls: clone(room.walls),
    elements: clone(room.elements),
    layoutItems: clone(room.layout.items),
    direction: clone(room.direction),
    fixedConstraints: [...room.fixedConstraints],
  };
}

export function snapshotRequirements(reqs: Requirement[], refs: Reference[]): RequirementSnapshot[] {
  return reqs.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    kind: r.kind,
    group: r.group,
    imageCaptions: refs.filter((x) => x.requirementIds.includes(r.id)).map((x) => x.title || x.explanation || 'Image'),
  }));
}
