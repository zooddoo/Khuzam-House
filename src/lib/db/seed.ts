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
export const SEED_ROOMS: { name: string; nameAr: string; type: RoomType; concept: string; conceptAr: string }[] = [
  {
    name: 'Living & Dining',
    nameAr: 'المعيشة والطعام',
    type: 'living-dining',
    concept: 'Warm minimalist, beige neutrals, wood cladding, restrained furniture.',
    conceptAr: 'بساطة دافئة، ألوان بيج محايدة، تكسية خشبية، أثاث محدود ومدروس.',
  },
  {
    name: 'Kitchen',
    nameAr: 'المطبخ',
    type: 'kitchen',
    concept: 'Practical contemporary design, matte cabinets, warm neutral surfaces.',
    conceptAr: 'تصميم معاصر عملي، خزائن مطفأة اللمعة، أسطح بألوان محايدة دافئة.',
  },
  { name: 'Majlis', nameAr: 'المجلس', type: 'majlis', concept: 'Contemporary guest seating and formal dining.', conceptAr: 'جلسات ضيوف معاصرة وطاولة طعام رسمية.' },
  { name: 'Family Lounge', nameAr: 'صالة العائلة', type: 'family-lounge', concept: '', conceptAr: '' },
  { name: 'Master Bedroom', nameAr: 'غرفة النوم الرئيسية', type: 'master-bedroom', concept: 'Calm, warm, hotel-inspired atmosphere.', conceptAr: 'أجواء هادئة ودافئة مستوحاة من الفنادق.' },
  { name: "Children's Bedroom", nameAr: 'غرفة نوم الأطفال', type: 'children-bedroom', concept: 'Safe, adaptable, storage-focused.', conceptAr: 'آمنة وقابلة للتكيّف وتركّز على التخزين.' },
  { name: 'Library', nameAr: 'المكتبة', type: 'library', concept: 'Design direction still to be developed.', conceptAr: 'التوجّه التصميمي لم يُحدَّد بعد.' },
  { name: 'Backyard', nameAr: 'الفناء الخلفي', type: 'backyard', concept: 'Family-friendly outdoor space.', conceptAr: 'مساحة خارجية مناسبة للعائلة.' },
  {
    name: 'Front Facade',
    nameAr: 'الواجهة الأمامية',
    type: 'front-facade',
    concept: 'Preserve the existing architectural character and update selected finishes.',
    conceptAr: 'الحفاظ على الطابع المعماري الحالي وتحديث بعض التشطيبات المختارة.',
  },
  { name: 'Garage', nameAr: 'المرآب', type: 'garage', concept: '', conceptAr: '' },
];

let seeding: Promise<boolean> | null = null;

/**
 * Seed the database the first time the studio is used. With cloud storage
 * this runs only after the first download showed the cloud is empty, so two
 * devices never create the starting rooms twice. Returns true if it seeded.
 */
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
          nameAr: 'بيت خزام',
          location: 'Riyadh, Saudi Arabia',
          locationAr: 'الرياض، المملكة العربية السعودية',
          description: '',
          coverReferenceId: null,
          createdAt: now,
          updatedAt: now,
        });
        const rooms: Room[] = SEED_ROOMS.map((r, i) =>
          createRoomRecord({ name: r.name, nameAr: r.nameAr, type: r.type, preliminaryConcept: r.concept, preliminaryConceptAr: r.conceptAr || undefined }, i),
        );
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
