import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';

// Every scan can be done by typing the code: the headless browser has no camera, so the scanner window shows its
// camera error, and the typed code must still work (and say so when it matches nothing).
test('a Pickup Pass is opened by typing its pickup reference instead of scanning', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Outbounds');
  await page.getByRole('button', { name: 'All dates' }).click();
  const reference = (await page.locator('tbody tr td').filter({ hasText: /^OB-\d{4}-\d+$/ }).first().innerText()).trim();

  await page.getByRole('button', { name: 'Scan pass' }).click();
  const box = page.getByLabel('Or type the code');
  await expect(box).toBeVisible();
  await expect(page.getByText('type the code below instead')).toBeVisible();

  await box.fill('OB-1999-000000');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.getByText('is not a Pickup Pass code')).toBeVisible();

  await page.getByRole('button', { name: 'Scan pass' }).click();
  await page.getByLabel('Or type the code').fill(reference.toLowerCase());
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page).toHaveURL(/\/outbound\/\d+/);
  await expect(page.getByText(reference).first()).toBeVisible();
});

test('on Storage a typed code that matches no package says so', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Storage');
  await page.getByRole('button', { name: 'Scan QR' }).click();
  await page.getByLabel('Or type the code').fill('WOMS-CARGO-000');
  await page.getByRole('button', { name: 'Use this code' }).click();
  await expect(page.getByText('No cargo matches scanned code "WOMS-CARGO-000"')).toBeVisible();
});
