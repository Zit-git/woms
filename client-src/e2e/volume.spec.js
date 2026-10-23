import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';

// Times how long each main screen takes to settle (menu click to "no Loading… text, no requests in flight").
// Not part of the normal run: VOLUME=1 npx playwright test volume --workers=1
// Compare a run on the normal data with a run after e2e/volume/seed.mjs.
test.skip(!process.env.VOLUME, 'volume timing only runs with VOLUME=1');

const SCREENS = [
  { name: 'Dashboard (home)', menu: 'Dashboard', ready: /Welcome/ },
  { name: 'Inbounds list', menu: 'Inbounds', ready: 'Inbound Operations' },
  { name: 'Outbounds list (all dates)', menu: 'Outbounds', ready: 'Outbound Operations', after: (p) => p.getByRole('button', { name: 'All dates', exact: true }).click() },
  { name: 'Storage', menu: 'Storage', ready: null },
  { name: 'Warehouses, Availability tab', menu: 'Warehouses', ready: 'Warehouse Management', after: (p) => p.locator('.tab', { hasText: 'Availability' }).click() },
  { name: 'Deliveries', menu: 'Deliveries', ready: null },
  { name: 'Tasks', menu: 'Tasks', ready: null },
];

async function settle(page, quietMs = 700) {
  let last = Date.now();
  let inflight = 0;
  const onReq = () => { inflight++; };
  const onDone = () => { inflight--; last = Date.now(); };
  page.on('request', onReq); page.on('requestfinished', onDone); page.on('requestfailed', onDone);
  return {
    wait: async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const loading = await page.getByText(/^Loading/).count();
        if (!loading && inflight <= 0 && Date.now() - last > quietMs) return;
        await page.waitForTimeout(100);
      }
      throw new Error('screen did not settle in 180 s');
    },
    stop: () => { page.off('request', onReq); page.off('requestfinished', onDone); page.off('requestfailed', onDone); },
  };
}

test('how long the main screens take with the data that is there now', async ({ page }) => {
  test.setTimeout(900_000);
  await openHome(page);
  const rows = [];
  for (const s of SCREENS) {
    let requests = 0;
    const count = (r) => /\/baas\//.test(r.url()) && requests++;
    page.on('request', count);
    const t0 = Date.now();
    const watcher = await settle(page);
    if (s.menu === 'Dashboard') await page.goto('./');
    else await openMenu(page, s.menu);
    if (s.ready) await expect(page.getByRole('heading', { name: s.ready })).toBeVisible({ timeout: 180_000 });
    if (s.after) await s.after(page);
    await watcher.wait();
    watcher.stop();
    page.off('request', count);
    const errors = await page.locator('.error-text').count();
    const message = errors ? (await page.locator('.error-text').first().innerText()).slice(0, 300) : '';
    rows.push({ screen: s.name, seconds: ((Date.now() - t0) / 1000).toFixed(1), requests, errors, message });
  }
  // open the newest inbound as well: the detail page loads its own lines, units and documents
  await openMenu(page, 'Inbounds');
  await page.getByRole('heading', { name: 'Inbound Operations' }).waitFor();
  const t1 = Date.now();
  const w = await settle(page);
  await page.locator('tbody tr.clickable-row').first().click();
  await expect(page.getByText('Inbound record')).toBeVisible({ timeout: 180_000 });
  await w.wait();
  w.stop();
  rows.push({ screen: 'Inbound detail (first in list)', seconds: ((Date.now() - t1) / 1000).toFixed(1), requests: '-', errors: await page.locator('.error-text').count() });

  console.log('\nVOLUME TIMINGS\n' + rows.map((r) => `${r.screen.padEnd(34)} ${String(r.seconds).padStart(6)} s   requests ${String(r.requests).padStart(3)}   errors ${r.errors} ${r.message}`).join('\n'));
  for (const r of rows) expect(r.errors, `${r.screen} showed an error`).toBe(0);
});
