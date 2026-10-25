import { test, expect } from '@playwright/test';
import { openHome, openMenu, field } from './helpers';

// Decimal values are shown with exactly two digits, rounded (lib/format.js). Whole counts stay whole.
const LONG_DECIMAL = /\d\.\d{3,}/; // 0.384, 0.30000000000000004, 11.100000000000001 ...
const TWO_DIGITS = /^-?\d+\.\d{2}$/;

test('numbers: capacity figures and totals have two decimals, and no screen shows a long decimal tail', async ({ page }) => {
  test.setTimeout(240_000);
  await openHome(page);
  const settle = async () => {
    await page.waitForLoadState('load');
    await expect(page.getByText(/^Loading/)).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(400);
  };
  const noLongDecimals = async (name) => {
    const text = await page.locator('main, .main-content').first().innerText();
    expect(text, `${name} shows a decimal with more than two digits`).not.toMatch(LONG_DECIMAL);
  };

  await test.step('warehouse availability: every capacity, weight and space figure is a two-digit decimal', async () => {
    await openMenu(page, 'Warehouses');
    await page.locator('.tab', { hasText: 'Availability' }).click();
    await field(page, 'Warehouse').selectOption({ label: 'Rotterdam DC2' }).catch(() => {});
    await settle();
    const byUnit = page.locator('table').filter({ has: page.locator('th', { hasText: 'Capacity Unit' }) }).first();
    await expect(byUnit).toBeVisible({ timeout: 60_000 });
    const cells = await byUnit.locator('tbody tr').first().locator('td').allInnerTexts();
    const figures = cells.slice(1); // the first cell is the unit's name
    expect(figures.length).toBeGreaterThan(3);
    figures.forEach((c) => expect(c.trim(), `"${c}" is not a two-digit decimal`).toMatch(TWO_DIGITS));
    await page.screenshot({ path: 'e2e/results/format-availability.png', fullPage: true });
    await noLongDecimals('Availability');
  });

  await test.step('inbound totals: weight and volume have two decimals', async () => {
    await openMenu(page, 'Inbounds');
    await page.getByRole('button', { name: 'All dates', exact: true }).click();
    await settle();
    await page.locator('tbody tr.clickable-row').first().click();
    await expect(page.getByText('Inbound record')).toBeVisible({ timeout: 60_000 });
    await settle();
    const weight = page.locator('.summary-value', { hasText: /kg$/ }).first();
    const volume = page.locator('.summary-value', { hasText: /m³$/ }).first();
    await expect(weight).toHaveText(/^-?\d+\.\d{2} kg$/);
    await expect(volume).toHaveText(/^-?\d+\.\d{2} m³$/);
    await page.screenshot({ path: 'e2e/results/format-inbound.png' });
    await noLongDecimals('Inbound detail');
  });

  for (const screen of ['Dashboard', 'Inbounds', 'Outbounds', 'Storage', 'Deliveries']) {
    await test.step(`${screen}: no long decimals`, async () => {
      if (screen === 'Dashboard') await page.goto('./');
      else await openMenu(page, screen);
      await settle();
      await noLongDecimals(screen);
    });
  }
});
