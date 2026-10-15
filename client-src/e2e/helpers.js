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
