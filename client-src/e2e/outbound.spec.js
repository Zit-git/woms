import { test, expect } from '@playwright/test';
import { openHome, openMenu, expectNoErrors, inDays, field, chooseWorkingWarehouse, watchSlowRequests } from './helpers';
import { openSession, queryRows, insertRows, deleteRows } from './volume/common.mjs';

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
      await modal.getByRole('button', { name: 'Mark picked' }).first().click();
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
    // The test customer's address (...@woms-test.example) cannot receive mail, so the app correctly says
    // the dispatch email was not sent; any other error is a failure.
    await expect(page.locator('.error-text').filter({ hasNotText: /customer email could not be sent/ })).toHaveCount(0);
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

// A Handling Unit that sits on one outbound's pick lines must not be offered to another outbound.
async function createRequest(page, label) {
  const customerRef = `AUTOTEST ${label} ${new Date().toISOString().slice(0, 19)}`;
  await openMenu(page, 'Outbounds');
  await page.getByRole('button', { name: '+ New Outbound Request' }).click();
  await field(page, 'Customer').selectOption({ label: CUSTOMER });
  await field(page, 'Reference number').fill(customerRef);
  await field(page, 'Requested date').fill(inDays(0));
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const row = page.locator('tr', { hasText: customerRef });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  await expect(page.getByRole('button', { name: /Select Goods/ })).toBeVisible({ timeout: 30_000 });
}

// Two stored pallets of its own, so the test does not depend on what earlier tests happened to leave behind.
async function seedTwoStoredPallets() {
  const db = await openSession();
  const DC2 = '11648000001183001';
  const ALPHA = '11648000001228002';
  const locs = await queryRows(
    db.call,
    'SELECT StorageLocations.ROWID, StorageLocations.capacity, StorageLocations.occupancy_status FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Aisles ON Racks.aisle_id = Aisles.ROWID LEFT JOIN Zones ON Aisles.zone_id = Zones.ROWID WHERE Zones.warehouse_id = ' + DC2
  );
  const used = await queryRows(db.call, 'SELECT Cargo.current_location_id, Cargo.reserved_location_id FROM Cargo WHERE Cargo.current_location_id IS NOT NULL OR Cargo.reserved_location_id IS NOT NULL');
  const taken = new Set(used.flatMap((r) => [r.Cargo.current_location_id, r.Cargo.reserved_location_id]).filter(Boolean).map(String));
  const free = locs.map((r) => r.StorageLocations).filter((l) => String(l.capacity) === '1' && l.occupancy_status !== 'Blocked' && !taken.has(String(l.ROWID)));
  expect(free.length, 'not enough free positions in Rotterdam DC2').toBeGreaterThanOrEqual(2);
  const [adviceId] = await insertRows(db.call, 'InboundAdvice', [
    { reference_number: `AUTOTEST O5 ${Date.now()}`, status: 'Put Away', customer_id: ALPHA, warehouse_id: DC2, destination: 'Netherlands', expected_date: inDays(0) },
  ]);
  const cargoIds = await insertRows(
    db.call,
    'Cargo',
    [1, 2].map((n) => ({
      inbound_advice_id: adviceId,
      customer_id: ALPHA,
      warehouse_id: DC2,
      description: `O5TEST pallet ${n}`,
      unit: 'Pallet',
      qty: '1',
      received_qty: 1,
      weight: 100,
      length_cm: 60,
      width_cm: 40,
      height_cm: 40,
      outer_package_no: String(n),
      qr_code: `O5TEST-${Date.now()}-${n}`,
      status: 'Stored',
      current_location_id: free[n - 1].ROWID,
    }))
  );
  const remove = async () => {
    try {
      const picks = await queryRows(db.call, `SELECT PickTask.ROWID FROM PickTask WHERE PickTask.cargo_id IN (${cargoIds.join(', ')})`);
      await deleteRows(db.call, 'PickTask', picks.map((r) => r.PickTask.ROWID));
      await deleteRows(db.call, 'Cargo', cargoIds);
      await deleteRows(db.call, 'InboundAdvice', [adviceId]);
    } finally {
      await db.browser.close();
    }
  };
  return { remove };
}

test('outbound: a Handling Unit already on one request is not offered to a second request (O5)', async ({ page }) => {
  test.setTimeout(180_000);
  const seeded = await seedTwoStoredPallets();
  try {
    await openHome(page);
    await chooseWorkingWarehouse(page, WAREHOUSE);

    // request A takes pallet 1
    await createRequest(page, 'OB-A');
    await page.getByRole('button', { name: /Select Goods/ }).click();
    let modal = page.locator('.modal-card');
    const select = modal.locator('select').first();
    await expect.poll(async () => (await select.locator('option', { hasText: 'O5TEST pallet 1' }).count()), { timeout: 30_000 }).toBe(1);
    const taken = await select.locator('option', { hasText: 'O5TEST pallet 1' }).first().innerText();
    await select.selectOption({ label: taken });
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(modal.getByText('On this outbound (1)')).toBeVisible({ timeout: 30_000 });
    await modal.getByRole('button', { name: 'Done' }).click();

    // request B is still offered pallet 2, but not pallet 1
    await createRequest(page, 'OB-B');
    await page.getByRole('button', { name: /Select Goods/ }).click();
    modal = page.locator('.modal-card');
    const offered = modal.locator('select').first().locator('option');
    await expect.poll(async () => (await offered.filter({ hasText: 'O5TEST pallet 2' }).count()), { timeout: 30_000 }).toBe(1);
    expect(await offered.allTextContents()).not.toContain(taken);
    expect(await offered.filter({ hasText: 'O5TEST pallet 1' }).count()).toBe(0);
  } finally {
    await seeded.remove();
  }
});
