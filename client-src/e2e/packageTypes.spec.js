import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';
import { openSession, queryRows, deleteRows, rowIds } from './volume/common.mjs';

// Package types can be edited in place. The test makes its own type and removes it again afterwards.
const stamp = Date.now().toString(36).toUpperCase();
const NAME = `ZZTEST ${stamp}`;

test.afterAll(async () => {
  const db = await openSession();
  try {
    const found = await queryRows(db.call, `SELECT ROWID FROM PackageTypes WHERE name = '${NAME}'`);
    const ids = rowIds(JSON.stringify(found));
    if (ids.length) await deleteRows(db.call, 'PackageTypes', ids);
  } finally {
    await db.browser.close();
  }
});

async function openPackageTypes(page) {
  await openHome(page);
  await openMenu(page, 'Warehouses');
  await page.locator('.tab', { hasText: 'Package Types' }).click();
  await expect(page.getByRole('heading', { name: 'Add Package / Handling-Unit Type' })).toBeVisible();
}

test('a package type can be edited, and a name that is already taken or a bad amount is refused', async ({ page }) => {
  await openPackageTypes(page);
  const addForm = page.locator('form.card');
  await addForm.getByPlaceholder('e.g. Pallet').fill(NAME);
  await addForm.getByRole('button', { name: '+ Add Type' }).click();
  const row = page.locator('tbody tr', { hasText: NAME });
  await expect(row).toBeVisible({ timeout: 15000 });

  // edit: a type nothing uses may change everything, name included
  await row.getByRole('button', { name: 'Edit' }).click();
  const editing = page.locator('tbody tr').filter({ has: page.getByLabel('Units per item') });
  await expect(editing.getByLabel('Name')).toBeEnabled({ timeout: 15000 });
  await editing.getByLabel('Capacity unit').selectOption('Cartons');
  await editing.getByLabel('Units per item').fill('0.25');
  await editing.getByLabel('Status').selectOption('Inactive');
  await editing.getByLabel('Name').fill(`${NAME} X`);
  await editing.getByRole('button', { name: 'Save' }).click();
  const renamed = page.locator('tbody tr', { hasText: `${NAME} X` });
  await expect(renamed).toBeVisible({ timeout: 15000 });
  await expect(renamed).toContainText('Cartons');
  await expect(renamed).toContainText('0.25');
  await expect(renamed).toContainText('Inactive');

  // put the name back (the cleanup finds it by name), then try a taken name and a bad amount
  await renamed.getByRole('button', { name: 'Edit' }).click();
  const again = page.locator('tbody tr').filter({ has: page.getByLabel('Units per item') });
  await expect(again.getByLabel('Name')).toBeEnabled({ timeout: 15000 });
  await again.getByLabel('Name').fill('pallet');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await again.getByLabel('Name').fill(NAME);
  await again.getByLabel('Units per item').fill('0');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('Units per item');
  await again.getByLabel('Units per item').fill('2');
  await again.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('tbody tr', { hasText: NAME }).first()).toContainText('2');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the name of a type that goods use cannot be changed', async ({ page }) => {
  await openPackageTypes(page);
  const pallet = page.locator('tbody tr').filter({ has: page.getByText('Pallet', { exact: true }) }).first();
  await pallet.getByRole('button', { name: 'Edit' }).click();
  const editing = page.locator('tbody tr').filter({ has: page.getByLabel('Units per item') });
  await expect(editing.getByText(/In use by/)).toBeVisible({ timeout: 15000 });
  await expect(editing.getByLabel('Name')).toBeDisabled();
  await editing.getByRole('button', { name: 'Cancel' }).click();
});
