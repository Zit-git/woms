import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHome, openMenu, expectNoErrors, chooseWorkingWarehouse } from './helpers';

// Access tests (A1-A7 of docs/TEST_PLAN.md). They need a second, warehouse-limited user:
//   Manager in MANAGER_WH, Operator in OPERATOR_WH, no access to OTHER_WH.
// Create that user in Administration -> Invite User, accept the invitation, then run
//   npm run e2e:login:staff   (you sign in as that user; only the session is saved)
// The tests are skipped when e2e/.auth/staff.json does not exist.
const STAFF_SESSION = process.env.WOMS_SESSION_STAFF || 'e2e/.auth/staff.json';
const MANAGER_WH = process.env.WOMS_MANAGER_WH || 'Rotterdam DC2';
const OPERATOR_WH = process.env.WOMS_OPERATOR_WH || 'Hamburg DC';
const OTHER_WH = process.env.WOMS_OTHER_WH || 'Antwerp DC';

test.describe('access by warehouse and role', () => {
  test.skip(!fs.existsSync(STAFF_SESSION), `No staff session: invite the test user, then run "npm run e2e:login:staff" (see the top of e2e/access.spec.js).`);
  test.describe.configure({ mode: 'serial' });

  const made = {}; // warehouse name -> { id, ref }, created once by the administrator

  test('administrator prepares one empty request in each of the three warehouses', async ({ page }) => {
    await openHome(page);
    for (const wh of [MANAGER_WH, OPERATOR_WH, OTHER_WH]) {
      await chooseWorkingWarehouse(page, wh);
      await openMenu(page, 'Inbounds');
      await page.getByRole('button', { name: '+ New Inbound' }).click();
      await expect(page.getByText('Shipment Details')).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      const ref = (await page.locator('h2').first().innerText()).trim();
      made[wh] = { id: page.url().split('/').pop(), ref };
      await openMenu(page, 'Inbounds');
    }
    expect(new Set(Object.values(made).map((m) => m.ref)).size).toBe(3);
  });

  test('A1/A4/A5: the user sees only the assigned warehouses and no administration', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: STAFF_SESSION, baseURL });
    const page = await ctx.newPage();
    await openHome(page);
    await expect(page.getByText('Role: Warehouse Staff')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
    const options = await page.getByLabel('Working warehouse').locator('option').allInnerTexts();
    expect(options.join('|')).toContain(MANAGER_WH);
    expect(options.join('|')).toContain(OPERATOR_WH);
    expect(options.join('|')).not.toContain(OTHER_WH);
    await expectNoErrors(page);
    await ctx.close();
  });

  test('A1/A3: lists hold the assigned warehouses\' inbounds only; the manager can act, the operator cannot', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: STAFF_SESSION, baseURL });
    const page = await ctx.newPage();
    await openHome(page);
    await openMenu(page, 'Inbounds');
    await expect(page.getByText(made[MANAGER_WH].ref).first()).toBeVisible();
    await expect(page.getByText(made[OPERATOR_WH].ref).first()).toBeVisible();
    await expect(page.getByText(made[OTHER_WH].ref)).toHaveCount(0);

    // manager in this warehouse: the next step is offered
    await page.getByText(made[MANAGER_WH].ref).first().click();
    await expect(page.getByRole('button', { name: /Continue Request|Availability Check/ })).toBeVisible();
    await openMenu(page, 'Inbounds');

    // operator in the other: record opens, but no approve/continue action
    await page.getByText(made[OPERATOR_WH].ref).first().click();
    await expect(page.getByRole('heading', { name: made[OPERATOR_WH].ref })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue Request|Availability Check|Mark as Received/ })).toHaveCount(0);
    await expectNoErrors(page);
    await ctx.close();
  });

  test('A1: New Inbound is possible in the managed warehouse only', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: STAFF_SESSION, baseURL });
    const page = await ctx.newPage();
    await openHome(page);
    await chooseWorkingWarehouse(page, OPERATOR_WH);
    await openMenu(page, 'Inbounds');
    await expect(page.getByRole('button', { name: '+ New Inbound' })).toBeDisabled();
    await chooseWorkingWarehouse(page, MANAGER_WH);
    await openMenu(page, 'Inbounds');
    await expect(page.getByRole('button', { name: '+ New Inbound' })).toBeEnabled();
    await ctx.close();
  });

  test('A5: warehouse configuration is for administrators; the user gets Availability only', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: STAFF_SESSION, baseURL });
    const page = await ctx.newPage();
    await openHome(page);
    await openMenu(page, 'Warehouses');
    await expect(page.locator('.tab', { hasText: 'Availability' })).toBeVisible();
    await expect(page.locator('.tab')).toHaveCount(1);
    await expectNoErrors(page);
    await ctx.close();
  });

  test('A3: a direct link to another warehouse\'s inbound is refused (Slate site only)', async ({ browser, baseURL }) => {
    test.skip(/\/app\/$/.test(baseURL), 'the legacy /app/ host cannot open deep links');
    const ctx = await browser.newContext({ storageState: STAFF_SESSION, baseURL });
    const page = await ctx.newPage();
    await page.goto(`./inbound/${made[OTHER_WH].id}`);
    await expect(page.getByText("You don't have access to this warehouse's records.")).toBeVisible();
    await ctx.close();
  });
});
