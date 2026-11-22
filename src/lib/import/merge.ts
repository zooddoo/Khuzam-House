/**
 * Import & Merge: adds data from a structured import file to the studio.
 *
 * Safety rules
 * - Adds only. Nothing is deleted and no existing value is overwritten.
 * - Rooms that already exist are left unchanged unless the owner explicitly
 *   chooses "add to my room" — and even then only empty fields are filled and
 *   new items added; differences are shown instead of being applied.
 * - A restore point is created before anything is written, and every change
 *   goes through normal sync (Saved indicator, cloud history).
 * - Running the same import twice adds nothing new (items are matched by name).
 */
import { db } from '../db/db';
import { createElementRecord, createFurnitureRecord, createRequirementRecord, createRoomRecord, directionIsEmpty, emptyDirection, unknownGeometry } from '../db/factories';
import { syncWalls } from '../geometry/room';
import { newId, nowIso } from '../ids';
import { normalizeForSearch } from '../../i18n/arabic';
import { createRestorePoint } from '../backup/backup';
import type {
  ArchElement,
  Certainty,
  DesignDirection,
  DesignTask,
  Floor,
  FurnitureCategory,
  ID,
  LibraryItem,
  Measure,
  Project,
  Requirement,
  RequirementCategory,
  Room,
  RoomStatus,
  RoomType,
  Wall,
  WallDesign,
} from '../types';

/* ------------------------------------------------------------------ */
/* File format                                                          */
/* ------------------------------------------------------------------ */

type WallKey = 'N' | 'E' | 'S' | 'W';
interface ImportDim {
  m: number | null;
  certainty: Certainty;
}
interface ImportElement {
  type: ArchElement['type'];
  subtype: string;
  label: string;
  wall?: WallKey;
  placement?: 'wall' | 'free';
  center?: boolean;
  status: Certainty;
  preserve: boolean;
  swing?: 'in' | 'out' | 'sliding' | 'opening';
  notes: string;
}
interface ImportLayoutItem {
  name: string;
  category: FurnitureCategory;
  widthM: number;
  depthM: number;
  center?: boolean;
  dimsStatus: 'confirmed' | 'estimated';
  notes: string;
  library?: string;
}
interface ImportRequirement {
  title: string;
  description: string;
  category: RequirementCategory;
  priority: Requirement['priority'];
  status: Requirement['status'];
  kind: Requirement['kind'];
  group: string;
  notes: string;
  source: string;
}
interface ImportLibrary {
  name: string;
  category: FurnitureCategory;
  width?: number | null;
  depth?: number | null;
  notes: string;
}
export interface ImportRoom {
  key: string;
  name: string;
  nameAr: string;
  type: RoomType;
  floor: string | null;
  status: RoomStatus;
  description: string;
  geometry: { shape: 'rectangle'; length: ImportDim; width: ImportDim; source: string };
  walls: Partial<Record<WallKey, { notes: string; design: Partial<WallDesign> }>>;
  elements: ImportElement[];
  layout: ImportLayoutItem[];
  requirements: ImportRequirement[];
  constraints: string[];
  direction: (Omit<DesignDirection, 'presetId' | 'presetName' | 'updatedAt' | 'palette'> & { palette: { hex: string; name: string; role: string }[] }) | null;
  library: ImportLibrary[];
  missing: string[];
  photos: { file: string; wall: WallKey; note: string }[];
}
export interface ImportFile {
  format: 'bait-khuzam-import';
  version: 1;
  title: string;
  sources: string[];
  project: { name: string; nameAr: string; location: string; locationAr: string; description: string };
  floors: { key: string; name: string; nameAr: string }[];
  house: { decisions: string[]; removed: string[]; missing: string[] };
  conflicts: { id: number; room: string | null; title: string; detail: string }[];
  rooms: ImportRoom[];
}

export class ImportError extends Error {}

export function parseImportFile(text: string): ImportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('not-json');
  }
  const d = raw as Partial<ImportFile>;
  if (!d || d.format !== 'bait-khuzam-import') throw new ImportError('wrong-format');
  if (d.version !== 1) throw new ImportError('wrong-version');
  if (!Array.isArray(d.rooms) || !Array.isArray(d.floors) || !d.project || !d.house || !Array.isArray(d.conflicts)) throw new ImportError('damaged');
  for (const r of d.rooms) {
    if (!r || typeof r.key !== 'string' || typeof r.name !== 'string' || !r.geometry || !Array.isArray(r.requirements)) throw new ImportError('damaged');
  }
  return d as ImportFile;
}

/* ------------------------------------------------------------------ */
/* Plan                                                                 */
/* ------------------------------------------------------------------ */

const norm = (s: string | undefined | null) => normalizeForSearch(s ?? '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Room types where a house normally has a single space, so an existing room of that type is the same space. */
const SINGLE_TYPES: RoomType[] = ['living-dining', 'kitchen', 'majlis', 'master-bedroom', 'backyard', 'garage', 'front-facade', 'stairs', 'laundry'];

export type RoomChoice = 'keep' | 'fill' | 'new';

export interface Difference {
  field: 'name' | 'nameAr' | 'type' | 'floor' | 'length' | 'width' | 'description' | 'direction' | 'constraints' | 'requirements' | 'elements';
  mine: string;
  imported: string;
}

export interface RoomPlan {
  source: ImportRoom;
  existing: Room | null;
  matchBy: 'name' | 'type' | null;
  differences: Difference[];
  /** What "add to my room" / "create" would add. */
  adds: { requirements: number; rejected: number; elements: number; constraints: number; library: number; tasks: number };
}

export interface MergePlan {
  file: ImportFile;
  rooms: RoomPlan[];
  floorsToAdd: ImportFile['floors'];
  projectDescriptionAdded: boolean;
  houseTasks: number;
}

const fmtDim = (m: Measure) => (m.mm === null ? 'unknown' : `${+(m.mm / 1000).toFixed(3)} m (${m.certainty})`);
const fmtImportDim = (d: ImportDim) => (d.m === null ? 'unknown' : `${d.m} m (${d.certainty})`);

export async function planMerge(file: ImportFile): Promise<MergePlan> {
  const [rooms, floors, project, requirements, tasks] = await Promise.all([
    db.rooms.toArray(),
    db.floors.toArray(),
    db.project.get('project'),
    db.requirements.toArray(),
    db.tasks.toArray(),
  ]);
  const used = new Set<ID>();
  const floorName = (id: ID | null) => {
    const f = floors.find((x) => x.id === id);
    return f ? f.nameAr || f.name : '—';
  };
  const plans: RoomPlan[] = file.rooms.map((src) => {
    let existing: Room | null = null;
    let matchBy: RoomPlan['matchBy'] = null;
    const byName = rooms.find((r) => !used.has(r.id) && ((norm(r.name) && norm(r.name) === norm(src.name)) || (norm(r.nameAr) && norm(r.nameAr) === norm(src.nameAr))));
    if (byName) {
      existing = byName;
      matchBy = 'name';
    } else if (SINGLE_TYPES.includes(src.type)) {
      const same = rooms.filter((r) => !used.has(r.id) && r.type === src.type);
      if (same.length === 1) {
        existing = same[0];
        matchBy = 'type';
      }
    }
    if (existing) used.add(existing.id);

    const differences: Difference[] = [];
    const roomReqs = existing ? requirements.filter((q) => q.roomId === existing!.id) : [];
    if (existing) {
      if (existing.name !== src.name) differences.push({ field: 'name', mine: existing.name, imported: src.name });
      if ((existing.nameAr ?? '') !== src.nameAr) differences.push({ field: 'nameAr', mine: existing.nameAr ?? '—', imported: src.nameAr });
      if (existing.type !== src.type) differences.push({ field: 'type', mine: existing.type, imported: src.type });
      const fName = file.floors.find((f) => f.key === src.floor);
      if (src.floor && floorName(existing.floorId) !== (fName?.nameAr ?? '') && floorName(existing.floorId) !== (fName?.name ?? ''))
        differences.push({ field: 'floor', mine: floorName(existing.floorId), imported: fName ? fName.nameAr || fName.name : '—' });
      const g = existing.geometry;
      if (fmtDim(g.length) !== fmtImportDim(src.geometry.length)) differences.push({ field: 'length', mine: fmtDim(g.length), imported: fmtImportDim(src.geometry.length) });
      if (fmtDim(g.width) !== fmtImportDim(src.geometry.width)) differences.push({ field: 'width', mine: fmtDim(g.width), imported: fmtImportDim(src.geometry.width) });
      if (existing.description.trim() && src.description && existing.description.trim() !== src.description.trim())
        differences.push({ field: 'description', mine: existing.description, imported: src.description });
      if (src.direction && !directionIsEmpty(existing.direction)) differences.push({ field: 'direction', mine: existing.direction.style || '…', imported: src.direction.style });
    }
    const haveReq = new Set(roomReqs.map((q) => norm(q.title)));
    const newReqs = src.requirements.filter((q) => !haveReq.has(norm(q.title)));
    const haveEl = new Set((existing?.elements ?? []).map((e) => norm(e.label)));
    const haveCons = new Set((existing?.fixedConstraints ?? []).map(norm));
    const haveTasks = new Set(tasks.filter((t) => existing && t.roomId === existing.id).map((t) => norm(t.title)));
    const roomTasks = taskTitles(file, src).filter((t) => !haveTasks.has(norm(t)));
    return {
      source: src,
      existing,
      matchBy,
      differences,
      adds: {
        requirements: newReqs.filter((q) => q.status !== 'rejected').length,
        rejected: newReqs.filter((q) => q.status === 'rejected').length,
        elements: src.elements.filter((e) => !haveEl.has(norm(e.label))).length,
        constraints: src.constraints.filter((c) => !haveCons.has(norm(c))).length,
        library: src.library.length,
        tasks: roomTasks.length,
      },
    };
  });
  const floorsToAdd = file.floors.filter((f) => !floors.some((x) => norm(x.name) === norm(f.name) || (x.nameAr && norm(x.nameAr) === norm(f.nameAr))));
  const haveHouseTasks = new Set(tasks.filter((t) => !t.roomId).map((t) => norm(t.title)));
  return {
    file,
    rooms: plans,
    floorsToAdd,
    projectDescriptionAdded: !(project?.description ?? '').includes(file.project.description),
    houseTasks: houseTaskTitles(file).filter((t) => !haveHouseTasks.has(norm(t))).length,
  };
}

/* ------------------------------------------------------------------ */
/* Texts recorded as checklist items                                    */
/* ------------------------------------------------------------------ */

const WALL_NAME: Record<WallKey, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };

function taskTitles(file: ImportFile, r: ImportRoom): string[] {
  return [
    ...file.conflicts.filter((c) => c.room === r.key).map((c) => `⚠ Conflict ${c.id}: ${c.title} — ${c.detail}`),
    ...r.photos.map((p) => `Photo to upload (${WALL_NAME[p.wall]} wall): ${p.file} — ${p.note}`),
    ...r.missing.map((m) => `Missing information: ${m}`),
  ];
}

function houseTaskTitles(file: ImportFile): string[] {
  return [
    ...file.conflicts.filter((c) => !c.room).map((c) => `⚠ Conflict ${c.id}: ${c.title} — ${c.detail}`),
    ...file.house.missing.map((m) => `Missing information (house): ${m}`),
  ];
}

function projectBlock(file: ImportFile): string {
  return [
    file.project.description,
    '',
    'House-wide decisions:',
    ...file.house.decisions.map((d) => `- ${d}`),
    '',
    'Removed spaces (not rooms):',
    ...file.house.removed.map((d) => `- ${d}`),
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Apply                                                                */
/* ------------------------------------------------------------------ */

export interface MergeResult {
  roomsCreated: string[];
  roomsFilled: string[];
  roomsKept: string[];
  requirements: number;
  elements: number;
  library: number;
  tasks: number;
  floors: number;
}

const mm = (m: number | null | undefined) => (m === null || m === undefined ? null : Math.round(m * 1000));
const measureOf = (d: ImportDim): Measure => ({ mm: mm(d.m), certainty: d.m === null ? 'unknown' : d.certainty });

function geometryOf(src: ImportRoom) {
  return { ...unknownGeometry(), length: measureOf(src.geometry.length), width: measureOf(src.geometry.width), source: src.geometry.source };
}

function wallsFor(src: ImportRoom, base: Wall[]): Wall[] {
  return base.map((w) => {
    const imp = src.walls[w.id as WallKey];
    const photos = src.photos.filter((p) => p.wall === w.id).map((p) => `Photo to upload: ${p.file} — ${p.note}`);
    if (!imp && !photos.length) return w;
    const notes = [imp?.notes ?? '', ...photos].filter(Boolean).join('\n');
    const design = { ...w.design };
    for (const [k, v] of Object.entries(imp?.design ?? {}) as [keyof WallDesign, string][]) if (v && !design[k].trim()) design[k] = v;
    return { ...w, notes: w.notes.trim() ? (w.notes.includes(notes) ? w.notes : w.notes) : notes, design };
  });
}

function elementsFor(src: ImportRoom, room: Pick<Room, 'geometry'>): ArchElement[] {
  const L = room.geometry.length.mm;
  const W = room.geometry.width.mm;
  return src.elements.map((e) =>
    createElementRecord(e.type, {
      subtype: e.subtype,
      label: e.label,
      placement: e.placement ?? (e.wall ? 'wall' : 'free'),
      wallId: e.wall ?? null,
      x: e.center && L !== null ? Math.round(L / 2) : null,
      y: e.center && W !== null ? Math.round(W / 2) : null,
      status: e.status,
      preserve: e.preserve,
      notes: e.notes,
      door: e.type === 'door' ? { hinge: 'left', swing: e.swing ?? 'in' } : null,
    }),
  );
}

function directionFor(src: ImportRoom): DesignDirection | null {
  if (!src.direction) return null;
  return {
    ...emptyDirection(),
    ...src.direction,
    palette: src.direction.palette.map((p) => ({ id: newId('c'), hex: p.hex, name: p.name, role: p.role })),
    presetId: null,
    presetName: '',
    updatedAt: nowIso(),
  };
}

export async function applyMerge(plan: MergePlan, choices: Record<string, RoomChoice>, opts: { reason: string; addProjectDetails: boolean }): Promise<MergeResult> {
  const { file } = plan;
  await createRestorePoint(opts.reason);
  const result: MergeResult = { roomsCreated: [], roomsFilled: [], roomsKept: [], requirements: 0, elements: 0, library: 0, tasks: 0, floors: 0 };
  const now = nowIso();

  await db.transaction('rw', [db.project, db.floors, db.rooms, db.requirements, db.library, db.tasks], async () => {
    // Project: fill empty fields; append the house block to the description once.
    const project = await db.project.get('project');
    if (project && opts.addProjectDetails) {
      const patch: Partial<Project> = {};
      if (!project.name.trim()) patch.name = file.project.name;
      if (!project.nameAr?.trim()) patch.nameAr = file.project.nameAr;
      if (!project.location.trim()) patch.location = file.project.location;
      if (!project.locationAr?.trim()) patch.locationAr = file.project.locationAr;
      if (!project.description.includes(file.project.description)) {
        const block = projectBlock(file);
        patch.description = project.description.trim() ? `${project.description.trim()}\n\n${block}` : block;
      }
      if (Object.keys(patch).length) await db.project.update('project', { ...patch, updatedAt: now });
    }

    // Floors: add the ones that do not exist yet (matched by English or Arabic name).
    const floors = await db.floors.toArray();
    const floorIds = new Map<string, ID>();
    let order = floors.reduce((m, f) => Math.max(m, f.order), -1);
    for (const f of file.floors) {
      const found = floors.find((x) => norm(x.name) === norm(f.name) || (x.nameAr && norm(x.nameAr) === norm(f.nameAr)));
      if (found) {
        floorIds.set(f.key, found.id);
        continue;
      }
      const floor: Floor = {
        id: newId('floor'),
        name: f.name,
        nameAr: f.nameAr,
        order: ++order,
        planReferenceId: null,
        planCalibration: null,
        planOpacity: 0.55,
        notes: '',
        createdAt: now,
        updatedAt: now,
      };
      await db.floors.add(floor);
      floorIds.set(f.key, floor.id);
      result.floors++;
    }

    const library = await db.library.toArray();
    const allTasks = await db.tasks.toArray();
    let roomOrder = (await db.rooms.toArray()).reduce((m, r) => Math.max(m, r.order), -1);

    for (const rp of plan.rooms) {
      const src = rp.source;
      const choice: RoomChoice = rp.existing ? (choices[src.key] ?? 'keep') : 'new';
      if (choice === 'keep') {
        result.roomsKept.push(src.name);
        continue;
      }

      let room: Room;
      if (choice === 'new' || !rp.existing) {
        const geometry = geometryOf(src);
        const base = createRoomRecord(
          {
            name: src.name,
            nameAr: src.nameAr,
            type: src.type,
            geometry,
            floorId: src.floor ? (floorIds.get(src.floor) ?? null) : null,
            status: src.status,
            description: src.description,
            fixedConstraints: [...src.constraints],
          },
          ++roomOrder,
        );
        room = { ...base, walls: wallsFor(src, base.walls), direction: directionFor(src) ?? base.direction };
        room.elements = elementsFor(src, room);
        await db.rooms.add(room);
        result.roomsCreated.push(src.name);
        result.elements += room.elements.length;
      } else {
        // Add to the existing room: fill empty fields, add new items, never overwrite.
        const cur = (await db.rooms.get(rp.existing.id))!;
        const next: Room = { ...cur };
        if (!next.nameAr?.trim()) next.nameAr = src.nameAr;
        if (!next.floorId && src.floor) next.floorId = floorIds.get(src.floor) ?? null;
        if (!next.description.trim()) next.description = src.description;
        const g = next.geometry;
        if (g.shape === 'rectangle' && g.length.mm === null && g.width.mm === null) {
          next.geometry = { ...g, length: measureOf(src.geometry.length), width: measureOf(src.geometry.width), source: g.source.trim() || src.geometry.source };
          next.walls = syncWalls(next.geometry, next.walls);
        } else if (!g.source.trim()) {
          next.geometry = { ...g, source: src.geometry.source };
        }
        next.walls = wallsFor(src, next.walls);
        const haveEl = new Set(next.elements.map((e) => norm(e.label)));
        const added = elementsFor(src, next).filter((e) => !haveEl.has(norm(e.label)));
        next.elements = [...next.elements, ...added];
        result.elements += added.length;
        const haveCons = new Set(next.fixedConstraints.map(norm));
        next.fixedConstraints = [...next.fixedConstraints, ...src.constraints.filter((c) => !haveCons.has(norm(c)))];
        const dir = directionFor(src);
        if (dir && directionIsEmpty(next.direction)) next.direction = dir;
        if (next.status === 'not-started' && src.requirements.length) next.status = 'requirements-added';
        next.updatedAt = now;
        await db.rooms.put(next);
        room = next;
        result.roomsFilled.push(src.name);
      }

      // Library items (furniture lists): add, or link an item with the same name to this room.
      const libIds = new Map<string, ID>();
      for (const li of src.library) {
        const same = library.find((x) => norm(x.name) === norm(li.name) && (x.roomIds.includes(room.id) || x.roomIds.length === 0));
        if (same) {
          if (!same.roomIds.includes(room.id)) {
            same.roomIds = [...same.roomIds, room.id];
            await db.library.update(same.id, { roomIds: same.roomIds, updatedAt: now });
          }
          libIds.set(li.name, same.id);
          continue;
        }
        const item: LibraryItem = {
          id: newId('lib'),
          kind: 'furniture',
          category: li.category,
          name: li.name,
          width: mm(li.width),
          depth: mm(li.depth),
          height: null,
          material: '',
          color: '',
          brand: '',
          productUrl: '',
          notes: li.notes,
          price: null,
          currency: 'SAR',
          roomIds: [room.id],
          createdAt: now,
          updatedAt: now,
        };
        await db.library.add(item);
        library.push(item);
        libIds.set(li.name, item.id);
        result.library++;
      }

      // 2D layout items (only those with documented sizes).
      if (src.layout.length) {
        const cur = (await db.rooms.get(room.id))!;
        const haveItems = new Set(cur.layout.items.map((i) => norm(i.name)));
        const L = cur.geometry.length.mm;
        const W = cur.geometry.width.mm;
        const items = src.layout
          .filter((it) => !haveItems.has(norm(it.name)))
          .map((it) =>
            createFurnitureRecord({
              name: it.name,
              category: it.category,
              width: mm(it.widthM)!,
              depth: mm(it.depthM)!,
              x: it.center && L !== null ? Math.round(L / 2) : 0,
              y: it.center && W !== null ? Math.round(W / 2) : 0,
              dimsStatus: it.dimsStatus,
              notes: it.notes,
              libraryItemId: it.library ? (libIds.get(it.library) ?? null) : null,
            }),
          );
        if (items.length) await db.rooms.update(room.id, { layout: { ...cur.layout, items: [...cur.layout.items, ...items] }, updatedAt: now });
      }

      // Requirements (including rejected ideas), skipping titles already in the room.
      const have = new Set((await db.requirements.where('roomId').equals(room.id).toArray()).map((q) => norm(q.title)));
      let reqOrder = (await db.requirements.where('roomId').equals(room.id).count()) - 1;
      const reqs: Requirement[] = src.requirements
        .filter((q) => !have.has(norm(q.title)))
        .map((q) =>
          createRequirementRecord(
            room.id,
            { title: q.title, description: q.description, category: q.category, priority: q.priority, status: q.status, kind: q.kind, group: q.group, notes: q.notes, source: q.source },
            ++reqOrder,
          ),
        );
      if (reqs.length) await db.requirements.bulkAdd(reqs);
      result.requirements += reqs.length;

      // Checklist: conflicts, photos to upload, missing information.
      const haveTasks = new Set(allTasks.filter((t) => t.roomId === room.id).map((t) => norm(t.title)));
      const newTasks: DesignTask[] = taskTitles(file, src)
        .filter((t) => !haveTasks.has(norm(t)))
        .map((title) => ({ id: newId('task'), title, roomId: room.id, done: false, createdAt: now, doneAt: null }));
      if (newTasks.length) await db.tasks.bulkAdd(newTasks);
      result.tasks += newTasks.length;
    }

    const haveHouse = new Set(allTasks.filter((t) => !t.roomId).map((t) => norm(t.title)));
    const houseTasks: DesignTask[] = houseTaskTitles(file)
      .filter((t) => !haveHouse.has(norm(t)))
      .map((title) => ({ id: newId('task'), title, roomId: null, done: false, createdAt: now, doneAt: null }));
    if (houseTasks.length) await db.tasks.bulkAdd(houseTasks);
    result.tasks += houseTasks.length;
  });

  return result;
}
