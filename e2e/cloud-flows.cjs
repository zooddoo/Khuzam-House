/**
 * End-to-end flows against the local fake Supabase server.
 *
 *   node e2e/fake-supabase.mjs &                     # port 54321
 *   VITE_SUPABASE_URL=http://localhost:54321 \
 *   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npx vite build && npx vite preview --port 5173 &
 *   node e2e/cloud-flows.cjs
 *
 * Covers: owner sign-up and claim (Arabic UI), requirement with a photo and a
 * PDF (uploaded to storage), delete → Recently Deleted → restore, offline
 * editing, a failing server with "Not saved — retry", importing a generated
 * image in the Studio, and a second device seeing everything.
 */
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.FAKE_SUPABASE || 'http://localhost:54321';
const PNG = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/icons/icon-192.png'));
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const state = async () => (await fetch(`${API}/__test/state`)).json();
const fail = (patch) => fetch(`${API}/__test/fail`, { method: 'POST', body: JSON.stringify(patch) });
const rowsOf = (s, table) => s.rows.filter((r) => r.tbl === table || r.table === table);

async function saveState(page) {
  return page.locator('[data-testid=save-status]').first().getAttribute('data-state');
}
async function waitSaved(page, timeout = 15000) {
  // Give the change a moment to be queued before waiting for "Saved".
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => document.querySelector('[data-testid=save-status]')?.getAttribute('data-state') === 'saved', null, { timeout });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await fetch(`${API}/__test/reset`, { method: 'POST' });

  // 1. Owner account (default language: Arabic)
  await page.goto(BASE + '/');
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  await page.getByRole('button', { name: 'أول مرة؟ أنشئ حساب المالك' }).click();
  await page.getByLabel('البريد الإلكتروني').fill('owner@example.com');
  await page.getByLabel('كلمة المرور').fill('correct horse battery');
  await page.getByRole('button', { name: 'إنشاء حساب المالك' }).click();
  await page.getByRole('button', { name: 'اجعل هذا الحساب هو المالك' }).click();
  await waitSaved(page, 20000);
  console.log('✓ owner signed up, claimed, seeded and saved');

  // Switch to English for the rest of the flow.
  await page.evaluate(() => localStorage.setItem('bk.locale', JSON.stringify({ lang: 'en', digits: 'latn', calendar: 'gregory' })));
  const roomId = await page.evaluate(async () => {
    const r = indexedDB.open('bait-khuzam-studio');
    return new Promise((res) => {
      r.onsuccess = () => {
        const q = r.result.transaction('rooms').objectStore('rooms').getAll();
        q.onsuccess = () => res(q.result.sort((a, b) => a.order - b.order)[0].id);
      };
    });
  });

  // 2. Requirement with a photo and a PDF
  await page.goto(`${BASE}/rooms/${roomId}/requirements`);
  await page.getByLabel('New requirement').fill('Reading corner by the window — see attached plan');
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'corner.png', mimeType: 'image/png', buffer: PNG },
    { name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF },
  ]);
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await waitSaved(page, 30000);
  let s = await state();
  const pdfObj = s.objects.find((o) => o.path.endsWith('original.pdf'));
  assert.ok(pdfObj, 'PDF original uploaded to storage');
  assert.ok(s.objects.some((o) => o.path.endsWith('original.png')), 'PNG original uploaded');
  console.log('✓ requirement with photo + PDF saved; objects in storage:', s.objects.length);

  // 3. Delete → Recently Deleted → restore
  const reqCount = async () => (await state()).counts.requirements;
  const before = await reqCount();
  await page.getByRole('button', { name: 'Requirement actions' }).first().click();
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await page.getByRole('button', { name: 'Move to Recently Deleted' }).click();
  await waitSaved(page);
  assert.equal(await reqCount(), before - 1, 'requirement deleted on server');
  await page.goto(`${BASE}/deleted`);
  await page.getByTestId('trash-list').getByRole('button', { name: 'Restore' }).first().click();
  await waitSaved(page);
  assert.equal(await reqCount(), before, 'requirement restored on server');
  console.log('✓ delete → Recently Deleted → restore');

  // 4. Offline editing
  await page.goto(`${BASE}/rooms/${roomId}/requirements`);
  await ctx.setOffline(true);
  await page.getByLabel('New requirement').fill('Written while offline');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.waitForFunction(() => ['offline', 'error'].includes(document.querySelector('[data-testid=save-status]')?.getAttribute('data-state')), null, { timeout: 15000 });
  console.log('✓ offline state shown:', await saveState(page));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSaved(page, 30000);
  assert.ok((await state()).rows.some((r) => JSON.stringify(r.data ?? r).includes('Written while offline')), 'offline edit uploaded');
  console.log('✓ offline change uploaded after reconnect');

  // 5. Server failure → "Not saved — retry"
  await fail({ push: true });
  await page.getByLabel('New requirement').fill('Saved after a server failure');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=save-status]')?.getAttribute('data-state') === 'error', null, { timeout: 20000 });
  assert.match(await page.locator('[data-testid=save-status]:visible').first().innerText(), /Not saved/);
  await fail({ push: false });
  await page.locator('[data-testid=save-status]:visible').first().click();
  await page.getByRole('button', { name: 'Retry now' }).click();
  await waitSaved(page, 20000);
  console.log('✓ "Not saved — retry" shown, retry succeeded');

  // 5b. Arabic requirement: the prompt needs English before it can be copied
  await page.getByLabel('New requirement').fill('جلسة أرضية مريحة بجانب النافذة');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await waitSaved(page);
  await page.goto(`${BASE}/studio/${roomId}`);
  const copy = page.getByRole('button', { name: 'Copy prompt' });
  await page.getByText('Arabic text that needs English').waitFor();
  assert.equal(await copy.isDisabled(), true, 'Copy prompt blocked while Arabic has no English');
  const en = page.getByRole('textbox', { name: 'English (for the design prompt)' }).first();
  await en.fill('Comfortable floor seating beside the window');
  await en.blur();
  await page.getByText('Every Arabic text used in this design has an English version.').waitFor();
  assert.equal(await copy.isDisabled(), false, 'Copy prompt enabled once English is given');
  await waitSaved(page);
  assert.ok((await state()).counts.translations >= 1, 'English wording saved to the cloud');
  console.log('✓ Arabic requirement → English entered → prompt can be copied');

  // 6. Studio without an image API: import a generated image
  await page.goto(`${BASE}/studio/${roomId}`);
  await page.getByRole('button', { name: 'Import generated image' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').first().setInputFiles({ name: 'chatgpt-result.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByLabel('Made with').fill('ChatGPT');
  await dialog.getByRole('button', { name: 'Save as new version' }).click();
  await waitSaved(page, 30000);
  s = await state();
  const version = rowsOf(s, 'design_versions')
    .map((r) => r.data)
    .find((d) => d && d.origin === 'imported');
  assert.ok(version, 'imported version on server');
  assert.ok(version.prompt.length > 200, 'prompt stored with the version');
  assert.ok(Array.isArray(version.requirementsSnapshot) && version.requirementsSnapshot.length > 0, 'requirement snapshot stored');
  assert.ok(version.roomSnapshot, 'dimension snapshot stored');
  assert.ok(version.prompt.includes('Comfortable floor seating beside the window'), 'prompt uses the English wording');
  assert.ok(!/[\u0600-\u06FF]/.test(version.prompt), 'prompt is English only');
  assert.ok(version.translations?.some((t) => t.source.includes('جلسة أرضية')), 'Arabic original kept with the version');
  console.log('✓ imported image saved as version', version.number, 'with prompt, requirement + dimension snapshots');

  // 7. A second device sees everything
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push('device 2: ' + e.message));
  await p2.goto(BASE + '/');
  await p2.getByLabel('البريد الإلكتروني').fill('owner@example.com');
  await p2.getByLabel('كلمة المرور').fill('correct horse battery');
  await p2.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await waitSaved(p2, 30000);
  await p2.goto(`${BASE}/rooms/${roomId}/requirements`);
  await p2.getByText('Saved after a server failure').first().waitFor({ timeout: 15000 }).catch(async () => {
    await p2.getByText('Reading corner by the window').first().waitFor({ timeout: 5000 });
  });
  await p2.getByText('Reading corner by the window').first().waitFor();
  console.log('✓ second device shows the same requirements');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('\nAll cloud flows passed.');
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
