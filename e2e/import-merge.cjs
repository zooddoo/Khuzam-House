/**
 * Import & Merge against the local fake Supabase (see cloud-flows.cjs for setup).
 * Fresh owner account (10 starter rooms) → import the included house data →
 * verify what was added → run again and verify nothing is duplicated.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.FAKE_SUPABASE || 'http://localhost:54321';
const OUT = process.argv[2];
const state = async () => (await fetch(`${API}/__test/state`)).json();
const live = (s, tbl) => s.rows.filter((r) => r.tbl === tbl && !r.deleted).map((r) => r.data);

async function waitSaved(page, timeout = 30000) {
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.querySelector('[data-testid=save-status]')?.getAttribute('data-state') === 'saved', null, { timeout });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await fetch(`${API}/__test/reset`, { method: 'POST' });
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'أول مرة؟ أنشئ حساب المالك' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('owner@example.com');
  await page.getByLabel('كلمة المرور').fill('correct horse battery');
  await page.getByRole('button', { name: 'إنشاء حساب المالك' }).click();
  await page.getByRole('button', { name: 'اجعل هذا الحساب هو المالك' }).click();
  await waitSaved(page);
  const before = await state();
  assert.equal(before.counts.rooms, 10, 'starter rooms');

  // Run 1 — preview, then "Add to all" for the existing starter rooms.
  await page.goto(BASE + '/settings');
  await page.getByRole('button', { name: 'استخدام بيانات البيت المرفقة' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('معاينة — لا يُضاف شيء حتى تؤكد').waitFor();
  if (OUT) await page.screenshot({ path: `${OUT}/import-preview-ar.png` });
  const overflow = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return d.scrollWidth - d.clientWidth;
  });
  assert.ok(overflow <= 1, 'preview fits a 360 px screen');
  await dialog.getByRole('button', { name: 'أضف إلى الكل' }).click();
  await dialog.getByRole('button', { name: 'إضافة إلى الاستوديو' }).click();
  await page.waitForURL('**/rooms');
  await waitSaved(page, 60000);

  let s = await state();
  const rooms = live(s, 'rooms');
  const reqs = live(s, 'requirements');
  const byName = (n) => rooms.find((r) => r.name === n);
  // Starter rooms matched: Living & Dining, Kitchen, Majlis, Master Bedroom, Backyard, Garage, Front Facade → 18 new rooms.
  assert.equal(rooms.length, 10 + 18, 'rooms after import');
  const kitchen = byName('Kitchen'); // starter room keeps its name
  assert.ok(kitchen, 'kitchen kept its name');
  assert.equal(kitchen.nameAr, 'المطبخ', 'Arabic name not overwritten');
  assert.equal(kitchen.geometry.length.mm, 5400);
  assert.equal(kitchen.geometry.width.mm, 4300);
  assert.equal(kitchen.geometry.length.certainty, 'confirmed');
  assert.equal(kitchen.ceilingHeight.mm, null, 'ceiling unknown');
  assert.equal(kitchen.layout.items.length, 1);
  const island = kitchen.layout.items[0];
  assert.deepEqual([island.width, island.depth, island.x, island.y, island.dimsStatus], [2200, 1000, 2700, 2150, 'confirmed']);
  assert.equal(kitchen.elements.length, 4);
  assert.ok(kitchen.elements.some((e) => e.type === 'door' && e.wallId === 'W' && e.door.swing === 'sliding'));
  assert.ok(kitchen.elements.every((e) => e.width === null && e.height === null && e.offset === null), 'no invented sizes/positions');
  assert.equal(kitchen.fixedConstraints.length, 28);
  const kReqs = reqs.filter((q) => q.roomId === kitchen.id);
  assert.equal(kReqs.length, 47);
  assert.equal(kReqs.filter((q) => q.status === 'rejected').length, 15);

  const living = byName('Living & Dining');
  assert.equal(living.geometry.length.mm, 8200);
  assert.equal(living.geometry.length.certainty, 'estimated', 'conflict 1: estimated');
  assert.equal(living.direction.palette.length, 6);
  assert.equal(living.direction.palette[0].hex, '#D9C9B8');
  const lReqs = reqs.filter((q) => q.roomId === living.id);
  assert.equal(lReqs.length, 42);
  assert.equal(lReqs.find((q) => q.title === 'Dining table for 8 people').status, 'pending');
  assert.notEqual(kitchen.direction.style, living.direction.style, 'separate directions');

  const tasks = live(s, 'tasks');
  assert.ok(tasks.some((t) => t.roomId === kitchen.id && t.title.startsWith('⚠ Conflict 2')));
  assert.ok(tasks.some((t) => t.roomId === living.id && t.title.includes('غرفة المعيشة - المدخل من الممر الجانبي.jpg')));
  assert.equal(live(s, 'floors').length, 3);
  assert.equal(s.objects.length, 0, 'no images imported');
  assert.ok(!JSON.stringify(s.rows).includes('images.openai.com'), 'no web image links');
  const bath = byName('Majlis Bathroom');
  assert.ok(bath && bath.geometry.length.mm === 1800);
  const stairs = byName('Staircase');
  assert.equal(stairs.geometry.length.mm, null);
  console.log('✓ run 1:', rooms.length, 'rooms,', reqs.length, 'requirements,', tasks.length, 'checklist items,', live(s, 'library_items').length, 'library items');

  // The kitchen prompt lists rejected ideas.
  await page.goto(`${BASE}/studio/${kitchen.id}`);
  await page.getByRole('button', { name: 'عرض الوصف' }).click();
  const prompt = await page.getByRole('dialog').locator('textarea').inputValue();
  assert.match(prompt, /PREVIOUSLY REJECTED IDEAS — DO NOT USE/);
  assert.match(prompt, /Sink on north wall/);
  assert.match(prompt, /Island: 2\.2 × 1\.0 m/);
  await page.keyboard.press('Escape');
  console.log('✓ kitchen prompt contains DO NOT CHANGE items and rejected ideas');

  // Run 2 — the same import adds nothing.
  const counts1 = (await state()).counts;
  await page.goto(BASE + '/settings');
  await page.getByRole('button', { name: 'استخدام بيانات البيت المرفقة' }).click();
  await dialog.getByRole('button', { name: 'أضف إلى الكل' }).click();
  await dialog.getByRole('button', { name: 'إضافة إلى الاستوديو' }).click();
  await page.waitForURL('**/rooms');
  await waitSaved(page, 60000);
  const counts2 = (await state()).counts;
  for (const k of ['rooms', 'requirements', 'tasks', 'library_items', 'floors']) assert.equal(counts2[k], counts1[k], `run 2 adds no ${k}`);
  console.log('✓ run 2 added nothing (no duplicates)');

  assert.deepEqual(errors, []);
  console.log('\nImport & Merge passed.');
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
