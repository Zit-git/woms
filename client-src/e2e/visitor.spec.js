import { test, expect } from '@playwright/test';

// Someone who has not signed in yet must see the sign-in page and no error. (It used to show "Last sign-in problem:
// Checking the signed-in user failed: Some network issue occured!" in red, because the web library fails instead of
// answering "nobody".) Needs no sign-in, so it can be run against any address:
//   WOMS_URL=https://<slate address>/ npx playwright test visitor
test.use({ storageState: { cookies: [], origins: [] } });

test('a visitor who is not signed in sees the sign-in page and no error', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500); // the check of who is signed in finishes (a failure is written down for the next load)
  await page.reload(); // a visitor reloads, comes back, or tries again: that is when the note used to appear
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByText(/Last sign-in problem/)).toHaveCount(0);
  await expect(page.getByText(/network issue/i)).toHaveCount(0);
  await expect(page.locator('.error-text')).toHaveCount(0);
});
