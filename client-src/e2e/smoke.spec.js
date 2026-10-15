import { test, expect } from '@playwright/test';

// The 2-minute check after every release: signed in, home loads, the two main lists open.
test.describe('smoke', () => {
  test('home screen loads for the signed-in user', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
    await expect(page.getByText(/Role:/)).toBeVisible();
    await expect(page.locator('.error-text')).toHaveCount(0);
  });

  test('inbound list opens and offers New Inbound', async ({ page }) => {
    await page.goto('./inbound');
    await expect(page.getByRole('heading', { name: 'Inbound Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New Inbound' })).toBeVisible();
    await expect(page.locator('.error-text')).toHaveCount(0);
  });

  test('outbound list opens on today\'s pickups', async ({ page }) => {
    await page.goto('./outbound');
    await expect(page.getByRole('heading', { name: 'Outbound Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan pass' })).toBeVisible();
    await expect(page.locator('.error-text')).toHaveCount(0);
  });

  test('warehouse availability opens without errors', async ({ page }) => {
    await page.goto('./warehouse');
    await expect(page.getByRole('heading', { name: 'Warehouse Management' })).toBeVisible();
    await page.getByText('Availability', { exact: true }).click();
    await expect(page.getByText('All warehouses (consolidated)')).toBeVisible();
    await expect(page.locator('.error-text')).toHaveCount(0);
  });
});
