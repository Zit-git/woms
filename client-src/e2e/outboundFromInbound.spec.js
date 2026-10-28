import { test, expect } from '@playwright/test';
import { openHome, openMenu, chooseWorkingWarehouse } from './helpers';

// The customer quotes an inbound or GRN; the supervisor finds it, opens an outbound from its page, and can only pick
// goods from that inbound. Uses the sample inbound IB-2026-243231 (4 boxes, stored); skipped where it does not exist.
// The test creates one empty outbound and prints its reference so it can be removed afterwards.
const INBOUND = 'IB-2026-243231';

test('an outbound is created from an inbound found by its GRN number', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Inbounds');
  await page.getByLabel('Search').fill(`GRN-${INBOUND}`);
  const row = page.locator('tbody tr', { hasText: INBOUND });
  await row.first().waitFor({ timeout: 20000 }).catch(() => {}); // the list loads after the page does
  test.skip((await row.count()) === 0, `${INBOUND} is not in this environment`);
  await row.first().getByText('Open', { exact: true }).click();

  await page.getByRole('button', { name: 'Create Outbound' }).click();
  const dialog = page.getByRole('dialog').or(page.locator('.modal-card'));
  await expect(dialog.getByText(INBOUND)).toBeVisible();
  await expect(dialog.getByText('GRN-')).toBeVisible();
  await dialog.getByRole('button', { name: 'Create outbound' }).click();

  await expect(page).toHaveURL(/\/outbound\/\d+/);
  console.log('CREATED', await page.locator('.wizard-ref-value').innerText());
  await expect(page.getByRole('link', { name: INBOUND })).toBeVisible(); // Linked Inbounds, with no goods on it yet

  await page.getByRole('button', { name: /Select Goods|Edit Goods/ }).first().click();
  await expect(page.getByText(`Handling Units from inbound ${INBOUND}`)).toBeVisible();
  const options = await page.locator('.modal-card select option').allInnerTexts();
  for (const o of options.filter((t) => t && !t.startsWith('Select a Handling Unit'))) expect(o, 'only this inbound\'s goods are offered').toContain(INBOUND);
});
