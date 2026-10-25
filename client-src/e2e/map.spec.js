import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHome, openMenu, field, expectNoErrors } from './helpers';

// The warehouse map: each rack is a column per bay with the levels stacked upwards like a slide of cards
// (level 1 at the bottom, level 2 above it and a step to the right), and a position opens a popup with the
// Handling Units in it. Needs Rotterdam DC2's racks (2 bays x 3 levels) and at least one pallet in storage.
test('warehouse map: levels stack upwards and a position opens its Handling Units', async ({ page }) => {
  test.setTimeout(180_000);
  await openHome(page);
  await openMenu(page, 'Warehouses');
  await page.locator('.tab', { hasText: 'Map' }).click();
  await field(page, 'Warehouse').selectOption({ label: 'Rotterdam DC2' });
  await expect(page.locator('.level-card').first()).toBeVisible({ timeout: 90_000 });
  // the map belongs to the warehouse chosen (an older, slower answer for another warehouse once replaced it)
  await expect(page.locator('.warehouse-rack-label').first()).toContainText(/^RT2-/);
  await expect(page.getByText('A-01-01')).toHaveCount(0); // that is Rotterdam DC1's position

  fs.mkdirSync('e2e/results/map', { recursive: true });
  await page.screenshot({ path: 'e2e/results/map/map.png', fullPage: false });
  await test.step('level 2 sits above level 1, one step to the right; level 3 above that', async () => {
    const bay = page.locator('.rack-bay').first();
    const box = async (level) => bay.locator(`.level-card[data-level="${level}"]`).first().boundingBox();
    const [l1, l2, l3] = [await box(1), await box(2), await box(3)];
    expect(l2.y, 'level 2 is above level 1').toBeLessThan(l1.y);
    expect(l3.y, 'level 3 is above level 2').toBeLessThan(l2.y);
    expect(l2.x, 'level 2 is a step to the right of level 1').toBeGreaterThan(l1.x);
    expect(l3.x, 'level 3 is a step to the right of level 2').toBeGreaterThan(l2.x);
    // the cards are angled: each one is skewed, and their labels say which level they are
    await expect(bay.locator('.level-card').first()).toContainText(/^L1/);
    expect(await bay.locator('.level-card').first().evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  });

  await test.step('an occupied position opens the Handling Units stored in it', async () => {
    await page.locator('.level-card.occupied').first().click();
    const popup = page.locator('.modal-card');
    await expect(popup.getByText('Handling Units here')).toBeVisible();
    await expect(popup.locator('.hu-card').first()).toBeVisible({ timeout: 60_000 });
    await expect(popup.getByRole('link', { name: /Open full record/ }).first()).toHaveAttribute('href', /\/cargo\/\d+$/);
    await expect(popup.getByText('Customer').first()).toBeVisible();
    await expect(popup.getByText('Capacity').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/results/map/popup.png' });
    await popup.getByRole('button', { name: 'Close' }).last().click();
    await expect(page.locator('.modal-card')).toHaveCount(0);
  });

  await test.step('an empty position says so', async () => {
    await page.locator('.level-card.empty').first().click();
    await expect(page.locator('.modal-card').getByText('Nothing is stored in this position.')).toBeVisible({ timeout: 60_000 });
    await page.locator('.modal-card').getByRole('button', { name: 'Close' }).last().click();
  });
  await expectNoErrors(page);
});
