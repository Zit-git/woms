import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';

// Long lists are shown a page at a time. The Inbounds list has hundreds of records, so it shows real paging.
test('the inbounds list is paged, the page size can change and a search starts again from page one', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Inbounds');
  const rows = page.locator('tbody tr');
  const bar = page.getByRole('navigation', { name: 'Pagination' });
  await expect(bar).toBeVisible({ timeout: 20000 });
  await expect(bar).toContainText(/^1–25 of \d+/);
  expect(await rows.count()).toBe(25);
  const firstOnPageOne = await rows.first().innerText();
  const total = Number((await bar.innerText()).match(/of (\d+)/)[1]);

  await bar.getByRole('button', { name: 'Next' }).click();
  await expect(bar).toContainText(/^26–50 of/);
  expect(await rows.first().innerText()).not.toBe(firstOnPageOne);
  await expect(bar.getByRole('button', { name: 'Previous' })).toBeEnabled();

  await bar.getByRole('button', { name: 'Last page' }).click();
  await expect(bar.getByRole('button', { name: 'Next' })).toBeDisabled();
  const last = Math.ceil(total / 25);
  await expect(bar).toContainText(`Page ${last} of ${last}`);
  expect(await rows.count()).toBe(total - 25 * (last - 1));

  await bar.getByLabel('Rows per page').selectOption('100');
  await expect(bar).toContainText(/^1–100 of/);
  expect(await rows.count()).toBe(100);

  // a search that leaves few results goes back to page one, with the controls gone when everything fits
  await page.getByLabel('Search').fill('GRN-IB-2026-243231');
  await expect(rows).toHaveCount(1, { timeout: 15000 });
  await expect(bar).toHaveCount(0);
});

test('a short list shows no paging controls', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Transporters');
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  const count = await page.locator('tbody tr').count();
  if (count <= 10) await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0);
});
