/**
 * End-to-end acceptance walkthrough for Bait Khuzam Studio.
 *
 * Usage:  npm run dev   (in another terminal)
 *         npm run test:e2e
 *
 * Uses a fresh browser profile, so it never touches your real project data.
 * The image provider HTTP endpoint is intercepted at the network layer in this
 * test only (the app itself never fakes results), so no API key or cost is involved.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.E2E_OUT ?? path.join(os.tmpdir(), 'bks-e2e');
mkdirSync(OUT, { recursive: true });

/* ---------- tiny PNG generator for test images ---------- */
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const shade = y > h * 0.7 ? 0.8 : 1;
      raw[i] = Math.round(rgb[0] * shade);
      raw[i + 1] = Math.round(rgb[1] * shade);
      raw[i + 2] = Math.round(rgb[2] * shade);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  photoNorth: path.join(OUT, 'living-north.png'),
  photoEast: path.join(OUT, 'living-east.png'),
  sofa: path.join(OUT, 'sofa-reference.png'),
  mood: path.join(OUT, 'mood.png'),
};
writeFileSync(files.photoNorth, png(320, 220, [232, 224, 212]));
writeFileSync(files.photoEast, png(320, 220, [222, 214, 200]));
writeFileSync(files.sofa, png(240, 180, [190, 170, 150]));
writeFileSync(files.mood, png(240, 180, [215, 200, 180]));
const generatedB64 = (n) => png(300, 200, [150 + n * 20, 140, 120]).toString('base64');

/* ---------- harness ---------- */
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: path.join(OUT, `failed-${results.length}.png`) }).catch(() => {});
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
const hosts = new Set();
page.on('request', (r) => hosts.add(new URL(r.url()).host));

let providerCalls = 0;
let lastProviderBody = '';
await page.route('**/v1/images/edits', async (route) => {
  providerCalls++;
  lastProviderBody = (route.request().postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: generatedB64(providerCalls) }] }) });
});

const go = async (hash) => {
  await page.goto(`${BASE}/#${hash}`);
  await page.waitForLoadState('networkidle');
};
let roomUrl = '';

console.log('Bait Khuzam Studio — acceptance walkthrough');

await step('1. Open Bait Khuzam Studio', async () => {
  await go('/');
  await page.getByRole('heading', { name: 'Bait Khuzam', level: 1 }).waitFor();
  assert(await page.getByText('Riyadh, Saudi Arabia').first().isVisible(), 'location not shown');
});

await step('2. View all rooms', async () => {
  await go('/rooms');
  await page.getByRole('heading', { name: 'My Rooms' }).waitFor();
  const n = await page.locator('article').count();
  assert(n >= 10, `expected seeded rooms, found ${n}`);
  assert((await page.getByText('Dimensions unknown').count()) >= 10, 'seeded rooms should have unknown dimensions');
});

await step('3. Open a room', async () => {
  await page.getByRole('link', { name: 'Living & Dining' }).first().click();
  await page.getByRole('heading', { name: 'Living & Dining', level: 1 }).waitFor();
  roomUrl = page.url().replace(/\/overview$/, '');
});

await step('4–5. Edit dimensions; area updates automatically', async () => {
  await page.goto(`${roomUrl}/dimensions`);
  await page.getByLabel('Length (east–west)').fill('6.2');
  await page.getByLabel('Width (north–south)').fill('4.8');
  await page.getByText('29.76 m²').first().waitFor({ timeout: 5000 });
  await page.getByLabel('Length (east–west)').fill('7');
  await page.getByText('33.60 m²').first().waitFor({ timeout: 5000 });
  await page.getByLabel('Ceiling height').fill('3.1');
  await page.getByLabel('Ceiling height').press('Enter');
  await page.getByText('21.70 m²').first().waitFor({ timeout: 5000 }); // north wall 7 × 3.1
});

await step('6. Edit wall dimensions (custom walls, inconsistency warning)', async () => {
  await page.getByRole('radio', { name: 'Custom walls' }).click();
  await page.getByText('Converted to custom walls').waitFor();
  const lengths = page.getByLabel('Length');
  await lengths.nth(1).fill('5');
  await lengths.nth(1).press('Enter');
  await page
    .getByText(/don.t form a closed room/)
    .first()
    .waitFor({ timeout: 5000 });
  await lengths.nth(1).fill('4.8');
  await lengths.nth(1).press('Enter');
  await page.waitForTimeout(500);
  assert((await page.getByText(/don.t form a closed room/).count()) === 0, 'closure warning should clear');
  await page.getByRole('radio', { name: 'Rectangle' }).click();
  await page.getByText('33.60 m²').first().waitFor();
});

await step('7. Record doors, windows and AC units', async () => {
  await page.goto(`${roomUrl}/architecture`);
  const add = async (type, fields, status) => {
    await page.getByRole('button', { name: type, exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    for (const [label, value] of fields) {
      const input = dlg.getByLabel(label, { exact: true });
      if ((await input.evaluate((el) => el.tagName)) === 'SELECT') await input.selectOption({ label: value });
      else {
        await input.fill(value);
        await input.press('Tab');
      }
    }
    if (status) await dlg.getByRole('radio', { name: status }).click();
    await dlg.getByRole('button', { name: 'Add element' }).click();
    await dlg.waitFor({ state: 'detached' });
  };
  await add('Window', [
    ['Wall', 'North'],
    ['Position along the wall', '1.2'],
    ['Width', '1.8'],
    ['Height', '1.5'],
    ['Sill height above floor', '0.9'],
  ]);
  await add('Door', [
    ['Wall', 'South'],
    ['Position along the wall', '0.4'],
    ['Width', '0.9'],
    ['Height', '2.1'],
  ]);
  await add(
    'AC unit',
    [
      ['Wall', 'East'],
      ['Position along the wall', '1.5'],
      ['Width', '0.9'],
      ['Height', '0.3'],
      ['Height above floor (bottom)', '2.2'],
    ],
    'Estimated',
  );
  assert((await page.getByText('Window', { exact: true }).count()) >= 1, 'window missing');
  assert((await page.getByText('Estimated', { exact: true }).count()) >= 1, 'AC should be estimated');
});

await step('8. Upload actual room photographs', async () => {
  await page.goto(`${roomUrl}/photos`);
  await page.locator('input[type=file]').first().setInputFiles([files.photoNorth, files.photoEast]);
  await page.getByText('2 images added').waitFor({ timeout: 15000 });
  await page.locator('figure').nth(1).waitFor({ timeout: 5000 });
});

await step('9–10. Add written requirements and attach images to a specific requirement', async () => {
  await page.goto(`${roomUrl}/requirements`);
  const box = page.getByLabel('New requirement');
  await box.fill('Must have a large L-shaped sofa facing the TV wall');
  await page.locator('label:has-text("Add images") input[type=file]').setInputFiles([files.sofa]);
  await page.getByLabel('Caption').first().fill('Low sofa shape I like');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.getByText('Requirement added').waitFor({ timeout: 15000 });
  await box.fill('No glossy kitchen-style cabinets');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.getByText('Must have a large L-shaped sofa facing the TV wall').first().waitFor();
  await page.getByText('Must have a large L-shaped sofa facing the TV wall').first().click();
  await page.getByText('Images for this requirement').waitFor();
  assert((await page.locator('input[aria-label="Caption"]').first().inputValue()) === 'Low sofa shape I like', 'caption not kept with the requirement image');
  // bulk paste
  await page.getByRole('button', { name: 'Paste multiple' }).click();
  await page.getByLabel('Requirements text').fill('Lighting:\n- Warm indirect lighting (must)\n- Optional: a reading lamp');
  await page.getByRole('button', { name: 'Split into requirements' }).click();
  await page.getByRole('button', { name: /Add 2 requirements/ }).click();
  await page.getByText(/2 requirements added/).waitFor();
});

await step('11–12. Add design references and choose a room-specific direction', async () => {
  await page.goto(`${roomUrl}/direction`);
  await page.getByRole('button', { name: /Warm Minimalist/ }).click();
  await page.getByText('Applied Warm Minimalist').waitFor();
  assert((await page.getByLabel('Interior style').inputValue()) === 'Warm minimalist', 'preset fields not applied');
  await page.locator('input[type=file]').first().setInputFiles([files.mood]);
  await page.getByText('Image added').waitFor({ timeout: 15000 });
});

await step('Room independence: other rooms keep their own (empty) direction', async () => {
  await go('/rooms');
  await page.getByRole('link', { name: 'Kitchen' }).first().click();
  await page.getByRole('link', { name: 'Direction', exact: true }).click();
  assert((await page.getByLabel('Interior style').inputValue()) === '', 'Kitchen must not inherit the Living & Dining direction');
});

await step('Prompt builder works without a provider (no fake image)', async () => {
  await page.goto(roomUrl.replace(/\/rooms\/([^/]+)$/, '/studio/$1'));
  await page.getByText('Image generation is not set up.', { exact: false }).first().waitFor();
  assert(await page.getByRole('button', { name: 'Generate design' }).isDisabled(), 'Generate must be disabled without a provider');
  await page.getByRole('button', { name: 'View prompt' }).click();
  const prompt = await page.getByLabel('Prompt text').inputValue();
  assert(prompt.includes('DO NOT CHANGE'), 'prompt lacks DO NOT CHANGE section');
  assert(prompt.includes('7.00 m (east–west) [confirmed]'), 'prompt lacks confirmed dimensions');
  assert(prompt.includes('APPROXIMATE FEATURES'), 'estimated AC should be listed as approximate');
  assert(prompt.includes('Must have a large L-shaped sofa'), 'prompt lacks requirement');
  assert(prompt.includes('No glossy kitchen-style cabinets'), 'prompt lacks exclusion');
  assert(prompt.includes('Warm minimalist'), 'prompt lacks direction');
  writeFileSync(path.join(OUT, 'prompt.txt'), prompt);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save as prompt-only version' }).click();
  await page.getByText(/Saved prompt-only version v1/).waitFor();
});

await step('13–14. Generate with a configured provider and save the design', async () => {
  await go('/settings');
  await page.getByRole('button', { name: /^OpenAI Images API/ }).click();
  const key = page.getByLabel('OpenAI API key');
  await key.fill('sk-e2e-test-key');
  await key.press('Tab');
  await page.getByText('Ready to generate').waitFor();
  await page.goto(roomUrl.replace(/\/rooms\/([^/]+)$/, '/studio/$1'));
  const gen = page.getByRole('button', { name: 'Generate design' });
  await gen.waitFor();
  assert(await gen.isEnabled(), 'Generate should be enabled once configured');
  await gen.click();
  await page.getByText(/Saved as v2/).waitFor({ timeout: 30000 });
  assert(providerCalls === 1, `expected 1 provider call, got ${providerCalls}`);
  const imageParts = (lastProviderBody.match(/name="image\[\]"/g) ?? []).length;
  assert(imageParts >= 2, `expected real images in the request, found ${imageParts}`);
  assert(lastProviderBody.includes('PHOTO OF THE ACTUAL ROOM TO REDESIGN'), 'base photo role not described');
  assert(lastProviderBody.includes('Low sofa shape I like'), 'requirement image caption missing from manifest');
});

await step('15. Create an additional version', async () => {
  await page.getByRole('button', { name: 'Generate design' }).click();
  await page.getByText(/Saved as v3/).waitFor({ timeout: 30000 });
  assert(providerCalls === 2, 'second generation should call the provider again');
});

await step('16. Compare versions', async () => {
  await page.goto(`${roomUrl}/versions`);
  const selectors = page.getByRole('button', { name: 'Select for comparison' });
  await selectors.nth(0).click({ force: true });
  await selectors.nth(0).click({ force: true });
  await page.getByRole('button', { name: /Compare 2/ }).click();
  await page.getByRole('heading', { name: 'Design Library' }).waitFor();
  await page.waitForTimeout(500);
  assert((await page.getByRole('button', { name: 'Remove from comparison' }).count()) === 2, 'two panes expected');
  await page.getByRole('radio', { name: /Slider/ }).click();
  await page.getByRole('slider', { name: 'Comparison divider' }).waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Comparison saved').waitFor();
});

await step('17–18. Approve a design; earlier versions are kept', async () => {
  await page.goto(`${roomUrl}/versions`);
  await page.locator('article button').filter({ hasText: /^v3/ }).first().click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByText('v3 approved').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert((await page.getByText('Approved').count()) >= 1, 'approved label missing');
  assert((await page.getByText('v2').count()) >= 1 && (await page.getByText('v1').count()) >= 1, 'earlier versions must remain');
  await page.goto(`${roomUrl}/overview`);
  await page.getByText(/Approved design · v3/).waitFor();
});

await step('19. Edit furniture dimensions and positions in the 2D layout', async () => {
  await page.goto(`${roomUrl}/layout`);
  await page.getByRole('button', { name: 'Add furniture' }).click();
  await page.getByRole('button', { name: /Sofa \(3-seat\)/ }).click();
  const width = page.getByLabel('Width', { exact: true });
  await width.fill('250');
  await width.press('Enter');
  await page.waitForTimeout(400);
  const fromWest = page.getByLabel('From west');
  const before = await fromWest.inputValue();
  const shape = page.locator('svg path[style*="cursor: move"]').first();
  const box = await shape.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await fromWest.inputValue();
  assert(before !== after, `position did not change (${before} → ${after})`);
  assert((await width.inputValue()) === '250', 'width edit not kept');
});

await step('Floor plan: place rooms on a floor (schematic, clearly labelled)', async () => {
  await go('/floor-plans');
  await page.getByRole('button', { name: 'Ground floor' }).first().click();
  await page.getByRole('heading', { name: 'Ground floor' }).waitFor();
  for (const name of ['Living & Dining', 'Kitchen']) {
    await page.locator('li', { hasText: name }).getByRole('button', { name: 'Add' }).first().click();
    await page.locator(`path[aria-label^="${name}"]`).waitFor({ timeout: 5000 });
  }
  assert(await page.getByText('Schematic — Not to Scale').isVisible(), 'schematic label missing');
  assert((await page.getByText('Size unknown').count()) >= 1, 'unknown-size room should be a labelled placeholder');
  await page.locator('path[aria-label^="Living & Dining"]').click();
  await page.getByRole('heading', { name: 'Living & Dining', level: 1 }).waitFor();
});

await step('Data survives a page reload', async () => {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.goto(`${roomUrl}/dimensions`);
  await page.getByText('33.60 m²').first().waitFor();
});

let backupPath = '';
await step('20. Export a backup, change data, restore it', async () => {
  await go('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  backupPath = path.join(OUT, download.suggestedFilename());
  await download.saveAs(backupPath);
  await page.getByText('Backup downloaded').waitFor();
  // delete a room so the restore has something to bring back
  await go('/rooms');
  await page.getByRole('button', { name: 'Actions for Garage' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete room' }).click();
  await page.getByText('Garage deleted').waitFor();
  await go('/settings');
  await page.locator('input[type=file][accept*="zip"]').setInputFiles(backupPath);
  await page.getByText('Restore this backup?').waitFor();
  await page.getByRole('button', { name: 'Replace current project…' }).click();
  await page.getByLabel('Confirmation word').fill('REPLACE');
  await page.getByRole('button', { name: 'Replace project' }).click();
  await page.getByText('Backup restored').waitFor({ timeout: 30000 });
  await go('/rooms');
  await page.getByRole('link', { name: 'Garage' }).first().waitFor();
  await go('/settings');
  await page.getByText('Before restoring').first().waitFor();
});

await step('21. No connection to ChatGPT', async () => {
  const bad = [...hosts].filter((h) => /chatgpt\.com|chat\.openai\.com/.test(h));
  assert(bad.length === 0, `unexpected hosts: ${bad.join(', ')}`);
});

if (process.env.E2E_SHOTS) {
  // Optional visual tour of populated screens.
  const shot = async (hash, name, prep) => {
    await page.goto(hash.startsWith('http') ? hash : `${BASE}/#${hash}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);
    if (prep) await prep();
    await page.screenshot({ path: path.join(OUT, `tour-${name}.png`) });
  };
  const roomHash = roomUrl.split('#')[1];
  await shot('/', 'home');
  await shot(`${roomHash}/overview`, 'overview');
  await shot(`${roomHash}/layout`, 'layout');
  await shot(`${roomHash}/walls`, 'walls');
  await shot(`${roomHash}/architecture`, 'architecture');
  await shot(`${roomHash}/requirements`, 'requirements', async () => {
    await page.getByText('Must have a large L-shaped sofa facing the TV wall').first().click();
    await page.waitForTimeout(400);
  });
  await shot(roomHash.replace(/\/rooms\/([^/]+)$/, '/studio/$1'), 'studio');
  await shot(`${roomHash}/versions`, 'versions', async () => {
    await page.locator('article button').filter({ hasText: /^v3/ }).first().click();
    await page.waitForTimeout(500);
  });
  await shot('/library/compare', 'compare-list');
  await shot('/library/references', 'references');
  await shot('/floor-plans', 'floorplans');
  await shot('/settings', 'settings', async () => {
    await page.getByText('Image generation', { exact: true }).first().scrollIntoViewIfNeeded();
  });
}

await page.screenshot({ path: path.join(OUT, 'final.png') });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Artifacts: ${OUT}`);
if (consoleErrors.length) console.log(`Console errors:\n  ${consoleErrors.slice(0, 10).join('\n  ')}`);
process.exit(failed.length ? 1 : 0);
