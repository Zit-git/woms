import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';

// Printable documents. The legacy /app/ address cannot open a deep link such as /print/... directly (Slate can), so
// each page is reached by navigating inside the running app, which is what a link does there.
const DC2_ID = '11648000001183001';
async function goInApp(page, url) {
  await page.evaluate((u) => {
    history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

test('Goods Issue Note: shown on the outbound page and printable, numbered like the GRN', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Outbounds');
  await page.getByRole('button', { name: 'All dates' }).click();
  const row = page.locator('tbody tr', { hasText: /OB-\d{4}-\d+/ }).first();
  await row.waitFor({ timeout: 30_000 });
  const reference = (await row.innerText()).match(/OB-\d{4}-\d+/)[0];
  await row.click();

  await expect(page.getByText('Goods Issue Note', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`GIN-${reference}`).first()).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop();

  await goInApp(page, `/app/print/outbound/${id}`);
  await expect(page.getByRole('heading', { name: 'Goods Issue Note' })).toBeVisible();
  await expect(page.getByText(`GIN-${reference}`).first()).toBeVisible();
  await expect(page.getByText('Issued by (warehouse)')).toBeVisible();
});

test('position labels: a sheet of QR labels for a warehouse, each with its code to type', async ({ page }) => {
  await openHome(page);
  await goInApp(page, `/app/print/locations?warehouse=${DC2_ID}`);
  await expect(page.getByRole('heading', { name: /Position labels/ })).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.label-card');
  expect(await cards.count()).toBeGreaterThan(3);
  await expect(cards.first().getByText(/^WOMS-LOC-\d+$/)).toBeVisible();
  await expect(cards.first().locator('img, canvas, svg').first()).toBeVisible();
});

test('Handling Unit labels: the sheet for chosen units shows HU number, customer and code', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Storage');
  const firstLabel = page.getByRole('link', { name: 'Label' }).first();
  await firstLabel.waitFor({ timeout: 30_000 });
  const href = await firstLabel.getAttribute('href');
  await goInApp(page, href);
  await expect(page.getByRole('heading', { name: 'Handling Unit Labels' })).toBeVisible({ timeout: 60_000 });
  const card = page.locator('.label-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByText(/^WOMS-CARGO-/)).toBeVisible();
});
