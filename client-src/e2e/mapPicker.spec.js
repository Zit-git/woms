import { test, expect } from '@playwright/test';
import { openHome, openMenu } from './helpers';

// Choosing where a Handling Unit goes by clicking the warehouse map: green positions can take it and are
// clickable, grey ones are not (and say why), and the choice shows on the button. Nothing is stored: the
// test stops before "Store", so it leaves no data behind.
test('put-away: a position is chosen on the warehouse map, not from a drop-down', async ({ page }) => {
  await openHome(page);
  await openMenu(page, 'Storage');
  await page.getByText(/^Awaiting Put-away/).click();
  const first = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Put away' }) }).first();
  test.skip((await first.count()) === 0, 'no Handling Unit is waiting for put-away in this environment');
  await first.getByRole('button', { name: 'Put away' }).click();

  await expect(page.getByText('Storage location')).toBeVisible();
  await expect(page.locator('select').filter({ hasText: 'Select location...' })).toHaveCount(0); // no drop-down any more
  await page.getByRole('button', { name: /Choose on map|Change on map/ }).click();

  const map = page.locator('.modal-card');
  await expect(map.getByText(/positions can take it/)).toBeVisible({ timeout: 60_000 });
  const greyed = map.locator('button.location-box[data-state="unavailable"]');
  const usable = map.locator('button.location-box:not([data-state="unavailable"])');
  expect(await usable.count(), 'at least one position can take the unit').toBeGreaterThan(0);
  if (await greyed.count()) {
    await expect(greyed.first()).toBeDisabled();
    expect(await greyed.first().getAttribute('title')).toMatch(/ - .+/); // says why
  }
  const chosen = usable.first();
  const code = (await chosen.getAttribute('title')).split(' - ')[0];
  await chosen.click();
  await expect(page.getByRole('button', { name: new RegExp(`${code}.*Change on map`) })).toBeVisible();
});
