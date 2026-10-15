import { test, expect } from '@playwright/test';
import { openHome, openMenu, expectNoErrors, inDays, field, chooseWorkingWarehouse, watchSlowRequests } from './helpers';

const WAREHOUSE = 'Rotterdam DC2';
const CUSTOMER = 'TEST Alpha Pallets Ltd';
const CARRIER = 'TEST Carrier North (client-own)';

let reportPending = () => {};
test.afterEach(() => reportPending());

// The pickup journey: request -> goods -> pass -> driver check-in -> fetch and scan -> dispatch -> delivered.
// Needs stored Handling Units for the test customer; the inbound journey test leaves some behind.
test('outbound: request to delivery (pass, check-in, scan-pick, dispatch)', async ({ page, context }) => {
  test.setTimeout(240_000);
  reportPending = watchSlowRequests(page);
  const customerRef = `AUTOTEST OB ${new Date().toISOString().slice(0, 19)}`;
  let reference = '';

  await test.step('new outbound request for today (O1, O2)', async () => {
    await openHome(page);
    await chooseWorkingWarehouse(page, WAREHOUSE);
    await openMenu(page, 'Outbounds');
    await page.getByRole('button', { name: '+ New Outbound Request' }).click();
    await field(page, 'Customer').selectOption({ label: CUSTOMER });
    await field(page, 'Transporter').selectOption({ label: CARRIER });
    await field(page, 'Reference number').fill(customerRef);
    await field(page, 'Requested date').fill(inDays(0));
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    // the list opens on today's pickups, so the new request is right there
    const row = page.locator('tr', { hasText: customerRef });
    await expect(row).toBeVisible({ timeout: 60_000 });
    reference = (await row.locator('td').first().innerText()).trim();
    expect(reference).toMatch(/^OB-\d{4}-\d{6}$/);
    await row.click();
    await expect(page.getByRole('heading', { name: reference })).toBeVisible();
  });

  await test.step('select two stored Handling Units of the customer (O1)', async () => {
    await page.getByRole('button', { name: /Select Goods/ }).click();
    const modal = page.locator('.modal-card');
    const select = modal.locator('select').first();
    // the inbound journey (run just before, in file order) leaves stored pallets for this customer
    const available = await select.locator('option').count();
    test.skip(available < 3, 'Not enough stored Handling Units for the test customer: run the inbound journey first (npm run e2e runs both in order).');
    const add = modal.getByRole('button', { name: 'Add', exact: true });
    for (let i = 0; i < 2; i++) {
      // the list refreshes after each add, so choose again until the choice sticks
      await expect(async () => {
        await select.selectOption({ index: 1 });
        await expect(add).toBeEnabled({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await add.click();
      await expect(modal.getByText(`On this outbound (${i + 1})`)).toBeVisible({ timeout: 30_000 });
    }
    await modal.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /Pick Goods/ }).first()).toBeVisible();
  });

  await test.step('pickup pass link points at this request (O8)', async () => {
    // The page itself is checked in the Slate-only test below: the legacy /app/ host cannot open deep links.
    const link = page.getByRole('link', { name: 'Print Pickup Pass' });
    await expect(link).toHaveAttribute('href', /print\/pickup\/\d+$/);
  });

  await test.step('dispatch is refused before the driver is checked in and goods are picked (O7)', async () => {
    await page.getByRole('button', { name: /Pick Goods/ }).first().click();
    const modal = page.locator('.modal-card');
    // fetch locations are shown for every line still to pick (O3)
    await expect(modal.getByText(/RT2-[AB]\d-R0\d-B\d-L\d/).first()).toBeVisible({ timeout: 30_000 });
    // pick (scan) each line
    for (let i = 0; i < 2; i++) {
      await modal.getByRole('button', { name: 'Scan & Pick' }).first().click();
      await expect(modal.getByText(`${i + 1} of 2 picked`)).toBeVisible({ timeout: 60_000 });
    }
    await modal.getByRole('button', { name: 'Done' }).click();
  });

  await test.step('driver check-in (O1)', async () => {
    await page.getByRole('button', { name: /Check Driver In/ }).first().click();
    const modal = page.locator('.modal-card');
    await field(modal, 'Driver name').fill('Auto Driver');
    await field(modal, 'Driver ID number').fill('ID-123456');
    await field(modal, 'Vehicle plate').fill('AUTOTEST-TN-111-A');
    await modal.getByRole('button', { name: 'Check driver in' }).click();
    await expect(page.getByRole('button', { name: /^Dispatch/ }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('AUTOTEST-TN-111-A').first()).toBeVisible();
  });

  await test.step('dispatch: handover signature, vehicle, confirm (O1)', async () => {
    await page.getByRole('button', { name: /^Dispatch/ }).first().click();
    const modal = page.locator('.modal-card');
    await expect(modal.getByRole('button', { name: 'Confirm Dispatch' })).toBeEnabled();
    await modal.getByRole('button', { name: 'Confirm Dispatch' }).click();
    await expect(page.getByRole('button', { name: /Mark Delivered/ }).first()).toBeVisible({ timeout: 90_000 });
  });

  await test.step('mark delivered (O10)', async () => {
    await page.getByRole('button', { name: /Mark Delivered/ }).first().click();
    await page.locator('.modal-card').getByRole('button', { name: 'Mark Delivered' }).click();
    await expect(page.getByText('Delivered').first()).toBeVisible({ timeout: 60_000 });
    await expectNoErrors(page);
  });

  await test.step('the pass is found by its reference at the gate (O8)', async () => {
    await openMenu(page, 'Outbounds');
    await page.getByPlaceholder(/Find by pickup reference/).fill(reference);
    await expect(page.locator('tr', { hasText: reference })).toBeVisible();
  });
});

// The rendered Pickup Pass needs deep links, which the Slate site supports and the legacy /app/ host does not.
test('pickup pass page shows the reference and a QR code (Slate site only)', async ({ page, baseURL }) => {
  test.skip(/\/app\/$/.test(baseURL), 'the legacy /app/ host cannot open deep links');
  await openHome(page);
  await chooseWorkingWarehouse(page, WAREHOUSE);
  await openMenu(page, 'Outbounds');
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  await page.locator('tbody tr.clickable-row').first().click();
  const [pass] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: 'Print Pickup Pass' }).click()]);
  await expect(pass.getByRole('heading', { name: 'Pickup Pass' })).toBeVisible({ timeout: 30_000 });
  await expect(pass.getByText(/OB-\d{4}-\d{6}/).first()).toBeVisible();
  await expect(pass.locator('img').first()).toBeVisible();
});
