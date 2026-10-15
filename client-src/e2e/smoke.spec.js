import { test, expect } from '@playwright/test';
import { openHome, openMenu, expectNoErrors } from './helpers';

// The 2-minute check after every release: signed in, home loads, the main lists open.
test.describe('smoke', () => {
  test('home screen loads for the signed-in user', async ({ page }) => {
    await openHome(page);
    await expect(page.getByText(/Role:/)).toBeVisible();
    await expectNoErrors(page);
  });

  test('inbound list opens and offers New Inbound', async ({ page }) => {
    await openHome(page);
    await openMenu(page, 'Inbounds');
    await expect(page.getByRole('heading', { name: 'Inbound Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Inbound' })).toBeVisible();
    await expectNoErrors(page);
  });

  test("outbound list opens on today's pickups", async ({ page }) => {
    await openHome(page);
    await openMenu(page, 'Outbounds');
    await expect(page.getByRole('heading', { name: 'Outbound Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan pass' })).toBeVisible();
    await expectNoErrors(page);
  });

  test('warehouse availability opens without errors', async ({ page }) => {
    await openHome(page);
    await openMenu(page, 'Warehouses');
    await expect(page.getByRole('heading', { name: 'Warehouse Management' })).toBeVisible();
    await page.locator('.tab', { hasText: 'Availability' }).click();
    // the consolidated view is an option in the warehouse dropdown, selected by default
    await expect(page.locator('option', { hasText: 'All warehouses (consolidated)' })).toHaveCount(1);
    await expect(page.getByText('By Warehouse').first()).toBeVisible();
    await expectNoErrors(page);
  });
});
