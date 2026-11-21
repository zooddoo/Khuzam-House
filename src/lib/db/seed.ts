import { db } from './db';
import { createRoomRecord, defaultSettings } from './factories';
import { builtInPresetRecords } from './presets';
import { nowIso } from '../ids';
import type { Room, RoomType } from '../types';

/**
 * Initial project data for Bait Khuzam.
 *
 * Source: the project brief only. No floor plans, measurements or photographs
 * were supplied with the project files, so:
 * - every dimension is left UNKNOWN (nothing is invented),
 * - no floor is assigned (unknown),
 * - earlier conceptual directions are stored as `preliminaryConcept` notes.
 *   They are shown to the user but never applied to a room's design
 *   direction or sent to an AI model unless the user adopts them.
 */
export const SEED_ROOMS: { name: string; type: RoomType; concept: string }[] = [
  {
    name: 'Living & Dining',
    type: 'living-dining',
    concept: 'Warm minimalist, beige neutrals, wood cladding, restrained furniture.',
  },
  {
    name: 'Kitchen',
    type: 'kitchen',
    concept: 'Practical contemporary design, matte cabinets, warm neutral surfaces.',
  },
  { name: 'Majlis', type: 'majlis', concept: 'Contemporary guest seating and formal dining.' },
  { name: 'Family Lounge', type: 'family-lounge', concept: '' },
  { name: 'Master Bedroom', type: 'master-bedroom', concept: 'Calm, warm, hotel-inspired atmosphere.' },
  { name: "Children's Bedroom", type: 'children-bedroom', concept: 'Safe, adaptable, storage-focused.' },
  { name: 'Library', type: 'library', concept: 'Design direction still to be developed.' },
  { name: 'Backyard', type: 'backyard', concept: 'Family-friendly outdoor space.' },
  {
    name: 'Front Facade',
    type: 'front-facade',
    concept: 'Preserve the existing architectural character and update selected finishes.',
  },
  { name: 'Garage', type: 'garage', concept: '' },
];

let seeding: Promise<boolean> | null = null;

/** Seed the database on first run. Safe to call repeatedly. Returns true if it seeded. */
export function ensureSeeded(): Promise<boolean> {
  if (!seeding) {
    seeding = db
      .transaction('rw', [db.project, db.rooms, db.presets, db.settings], async () => {
        const existing = await db.project.get('project');
        if (existing) return false;
        const now = nowIso();
        await db.project.put({
          id: 'project',
          name: 'Bait Khuzam',
          location: 'Riyadh, Saudi Arabia',
          description: '',
          coverReferenceId: null,
          createdAt: now,
          updatedAt: now,
        });
        const rooms: Room[] = SEED_ROOMS.map((r, i) => createRoomRecord({ name: r.name, type: r.type, preliminaryConcept: r.concept }, i));
        await db.rooms.bulkPut(rooms);
        if ((await db.presets.count()) === 0) await db.presets.bulkPut(builtInPresetRecords());
        if (!(await db.settings.get('app'))) await db.settings.put(defaultSettings());
        return true;
      })
      .catch((err) => {
        seeding = null;
        throw err;
      });
  }
  return seeding;
}
