import { expect } from '@playwright/test';

// Open the app and wait for the signed-in home screen. (The legacy /app/ host cannot open
// deep links like /app/inbound directly, so tests always start here and use the menu.)
export async function openHome(page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
}

// Click an item in the left menu, e.g. 'Inbounds', 'Outbounds', 'Warehouses'.
export async function openMenu(page, label) {
  await page.getByRole('link', { name: label, exact: true }).first().click();
}

export async function expectNoErrors(page) {
  await expect(page.locator('.error-text')).toHaveCount(0);
}

// Dates relative to today, as YYYY-MM-DD, so the tests can be rerun on any day.
export function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A form field found by its visible label text (the app's labels are not linked to the inputs).
export function field(scope, label) {
  return scope
    .locator('.form-row')
    .filter({ has: scope.locator('label', { hasText: label }) })
    .locator('input, select, textarea')
    .first();
}

// Choose the working warehouse in the left menu (needed before New Inbound/Outbound when the user has several).
export async function chooseWorkingWarehouse(page, name) {
  const select = page.getByLabel('Working warehouse');
  if (await select.count()) {
    await select.selectOption({ label: name });
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
  }
}

// Prints any data/function request that takes longer than `slowMs`, and anything still pending at the end,
// so a "the server did not respond" message in a test points at the request behind it.
export function watchSlowRequests(page, slowMs = 5000) {
  const started = new Map();
  page.on('request', (r) => {
    if (/\/baas\/|\/server\//.test(r.url())) started.set(r, Date.now());
  });
  page.on('requestfinished', (r) => {
    const t = started.get(r);
    if (t && Date.now() - t > slowMs) console.log(`SLOW ${Date.now() - t}ms ${r.method()} ${r.url().replace(/.*\/(baas|server)\//, '$1/').slice(0, 140)} ${r.postData()?.slice(0, 160) || ''}`);
    started.delete(r);
  });
  page.on('requestfailed', (r) => {
    if (started.has(r)) console.log(`FAILED ${r.failure()?.errorText} ${r.url().slice(-120)}`);
    started.delete(r);
  });
  return () => {
    for (const [r, t] of started) console.log(`PENDING ${Date.now() - t}ms ${r.method()} ${r.url().replace(/.*\/(baas|server)\//, '$1/').slice(0, 140)} ${r.postData()?.slice(0, 200) || ''}`);
  };
}
