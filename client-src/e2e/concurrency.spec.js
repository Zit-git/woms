import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHome, openMenu, inDays, field, chooseWorkingWarehouse } from './helpers';
import { openSession, queryRows, insertRows, deleteRows } from './volume/common.mjs';

// Two real users at the same moment: the administrator (e2e/.auth/state.json) and the warehouse-limited
// staff user (e2e/.auth/staff.json: Supervisor in Hamburg DC, Operator in Rotterdam DC2, see ACCESS_TEST_SETUP.md).
// Each test seeds a few CONCTEST records, lets both users act at once, then reads the database itself.
const STAFF_SESSION = process.env.WOMS_SESSION_STAFF || 'e2e/.auth/staff.json';
const DC2 = { id: '11648000001183001', name: 'Rotterdam DC2' };
const HAMBURG = { id: '11648000001197506', name: 'Hamburg DC' };
const CUSTOMER = '11648000001228002'; // TEST Alpha Pallets Ltd
const stamp = Date.now().toString(36).toUpperCase();

test.describe('two people at once', () => {
  test.skip(!fs.existsSync(STAFF_SESSION), 'No staff session: see docs/ACCESS_TEST_SETUP.md');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  let db; // { browser, call }
  const made = { PickTask: [], HuLine: [], Cargo: [], OutboundRequest: [], InboundLine: [], InboundAdvice: [] };
  const remember = (table, ids) => made[table].push(...ids);

  test.beforeAll(async () => {
    db = await openSession();
  });

  test.afterAll(async () => {
    try {
      // anything the races created on our pallets or outbounds goes too
      const picks = await queryRows(db.call, `SELECT PickTask.ROWID FROM PickTask WHERE PickTask.outbound_request_id IN (${made.OutboundRequest.join(', ') || 0}) OR PickTask.cargo_id IN (${made.Cargo.join(', ') || 0})`);
      remember('PickTask', picks.map((r) => r.PickTask.ROWID));
      for (const table of ['PickTask', 'HuLine', 'Cargo', 'OutboundRequest', 'InboundLine', 'InboundAdvice']) {
        await deleteRows(db.call, table, [...new Set(made[table])]);
      }
    } finally {
      await db.browser.close();
    }
  });

  // free pallet positions in Rotterdam DC2 (not blocked, nothing in them, nothing reserved)
  async function freeLocations(n) {
    const locs = await queryRows(
      db.call,
      'SELECT StorageLocations.ROWID, StorageLocations.location_code, StorageLocations.capacity, StorageLocations.occupancy_status FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Aisles ON Racks.aisle_id = Aisles.ROWID LEFT JOIN Zones ON Aisles.zone_id = Zones.ROWID WHERE Zones.warehouse_id = ' + DC2.id
    );
    const used = await queryRows(db.call, 'SELECT Cargo.current_location_id, Cargo.reserved_location_id FROM Cargo WHERE Cargo.current_location_id IS NOT NULL OR Cargo.reserved_location_id IS NOT NULL');
    const taken = new Set(used.flatMap((r) => [r.Cargo.current_location_id, r.Cargo.reserved_location_id]).filter(Boolean).map(String));
    const free = locs.map((r) => r.StorageLocations).filter((l) => String(l.capacity) === '1' && l.occupancy_status !== 'Blocked' && !taken.has(String(l.ROWID)));
    expect(free.length, 'not enough free positions in Rotterdam DC2 for the test').toBeGreaterThanOrEqual(n);
    return free.slice(0, n);
  }

  const pallet = (advice, tag, extra = {}) => ({
    inbound_advice_id: advice,
    customer_id: CUSTOMER,
    warehouse_id: DC2.id,
    description: `CONCTEST pallet ${tag}`,
    unit: 'Pallet',
    qty: '1',
    received_qty: 1,
    weight: 100,
    length_cm: 60,
    width_cm: 40,
    height_cm: 40,
    outer_package_no: '1',
    qr_code: `CONCTEST-${stamp}-${tag}`,
    status: 'Received',
    ...extra,
  });

  async function advice(tag, status, warehouse = DC2) {
    const [id] = await insertRows(db.call, 'InboundAdvice', [
      { reference_number: `CONCTEST ${stamp} ${tag}`, inbound_reference: `IB-CONC-${stamp}-${tag}`, status, customer_id: CUSTOMER, warehouse_id: warehouse.id, destination: 'Netherlands', expected_date: inDays(1), storage_start_date: inDays(1), storage_end_date: inDays(10), expected_colli: '1' },
    ]);
    remember('InboundAdvice', [id]);
    const [lineId] = await insertRows(db.call, 'InboundLine', [{ inbound_advice_id: id, customer_id: CUSTOMER, warehouse_id: warehouse.id, line_no: '1', unit: 'Pallet', description: `CONCTEST goods ${tag}`, qty: 1, received_qty: 1, weight: 100, length_cm: 60, width_cm: 40, height_cm: 40 }]);
    remember('InboundLine', [lineId]);
    return { id, lineId, reference: `IB-CONC-${stamp}-${tag}` };
  }

  async function signedIn(browser, baseURL, session) {
    const context = await browser.newContext({ storageState: session, baseURL });
    const page = await context.newPage();
    await openHome(page);
    return { context, page };
  }

  // ---------------------------------------------------------------------------------------------
  test('two people store into the same free position at the same moment: only one pallet may end up there', async ({ browser, baseURL }) => {
    const [target] = await freeLocations(1);
    const adviceA = await advice('PA', 'HU Created');
    const adviceB = await advice('PB', 'HU Created');
    for (const a of [adviceA, adviceB]) {
      const [cargoId] = await insertRows(db.call, 'Cargo', [pallet(a.id, a.reference.slice(-2))]);
      remember('Cargo', [cargoId]);
      const [huLine] = await insertRows(db.call, 'HuLine', [{ cargo_id: cargoId, inbound_line_id: a.lineId, qty: 1 }]);
      remember('HuLine', [huLine]);
    }

    const admin = await signedIn(browser, baseURL, 'e2e/.auth/state.json');
    const staff = await signedIn(browser, baseURL, STAFF_SESSION);
    const open = async ({ page }, ref) => {
      await chooseWorkingWarehouse(page, DC2.name);
      await openMenu(page, 'Inbounds');
      await page.locator('tr', { hasText: ref }).click();
      await page.getByRole('button', { name: /Put Away/ }).click();
      const modal = page.locator('.modal-card');
      const choose = modal.getByRole('button', { name: /Change on map/ }).first();
      await expect(choose).toBeVisible({ timeout: 60_000 }); // a location is suggested
      await choose.click();
      // both pick the very same position on the warehouse map
      await page.locator(`.modal-card button.location-box[title^="${target.location_code} - "]`).click();
      await expect(modal.getByRole('button', { name: /^Store 1 of 1/ })).toBeEnabled();
      return modal;
    };
    const [modalA, modalB] = await Promise.all([open(admin, adviceA.reference), open(staff, adviceB.reference)]);

    // the same instant
    await Promise.all([modalA.getByRole('button', { name: /^Store 1 of 1/ }).click(), modalB.getByRole('button', { name: /^Store 1 of 1/ }).click()]);
    await admin.page.waitForTimeout(8_000);

    const inside = await queryRows(db.call, `SELECT Cargo.ROWID, Cargo.description FROM Cargo WHERE Cargo.current_location_id = ${target.ROWID}`);
    console.log(`position ${target.location_code} now holds ${inside.length} pallet(s): ${inside.map((r) => r.Cargo.description).join(', ')}`);
    expect(inside.length, `a one-pallet position ${target.location_code} holds ${inside.length} pallets`).toBeLessThanOrEqual(1);
    // the one who came second is told, not left guessing
    const told = (await admin.page.getByText(/just filled by someone else/).count()) + (await staff.page.getByText(/just filled by someone else/).count());
    expect(told, 'nobody was told the position was taken').toBe(1);
    await admin.context.close();
    await staff.context.close();
  });

  // ---------------------------------------------------------------------------------------------
  test('two people edit different fields of the same request at once: both edits survive', async ({ browser, baseURL }) => {
    const shared = await advice('ED', 'Requested', HAMBURG); // both users can approve in Hamburg (administrator, supervisor)
    const admin = await signedIn(browser, baseURL, 'e2e/.auth/state.json');
    const staff = await signedIn(browser, baseURL, STAFF_SESSION);
    const open = async ({ page }) => {
      await chooseWorkingWarehouse(page, HAMBURG.name);
      await openMenu(page, 'Inbounds');
      await page.locator('tr', { hasText: shared.reference }).click();
      await page.getByRole('button', { name: /Continue Request|Edit Request/ }).first().click();
      await expect(page.getByText('Shipment Details')).toBeVisible({ timeout: 60_000 });
    };
    await Promise.all([open(admin), open(staff)]);

    const refValue = `CONC-ADMIN-${stamp}`;
    const cmrValue = `CONC-STAFF-${stamp}`;
    await Promise.all([
      (async () => {
        await field(admin.page, 'Customer Reference / PO Number').fill(refValue);
        await field(admin.page, 'Customer Reference / PO Number').blur();
      })(),
      (async () => {
        await field(staff.page, 'CMR (Freight Document) Number').fill(cmrValue);
        await field(staff.page, 'CMR (Freight Document) Number').blur();
      })(),
    ]);
    await admin.page.waitForTimeout(6_000);

    const [row] = await queryRows(db.call, `SELECT InboundAdvice.reference_number, InboundAdvice.cmr_number FROM InboundAdvice WHERE InboundAdvice.ROWID = ${shared.id}`);
    console.log('after both edits:', JSON.stringify(row.InboundAdvice));
    expect(row.InboundAdvice.reference_number).toBe(refValue);
    expect(row.InboundAdvice.cmr_number).toBe(cmrValue);
    await admin.context.close();
    await staff.context.close();
  });

  // ---------------------------------------------------------------------------------------------
  test('two outbounds claim the same pallet at the same moment: only one pick line may exist for it', async ({ browser, baseURL }) => {
    const [where] = await freeLocations(1);
    const home = await advice('OB', 'Put Away');
    const [cargoId] = await insertRows(db.call, 'Cargo', [pallet(home.id, 'OB', { status: 'Stored', current_location_id: where.ROWID })]);
    remember('Cargo', [cargoId]);
    const [huLine] = await insertRows(db.call, 'HuLine', [{ cargo_id: cargoId, inbound_line_id: home.lineId, qty: 1 }]);
    remember('HuLine', [huLine]);
    const requests = await insertRows(
      db.call,
      'OutboundRequest',
      ['A', 'B'].map((k) => ({ reference_number: `CONCTEST ${stamp} OUT ${k}`, outbound_reference: `OB-CONC-${stamp}-${k}`, status: 'Submitted', customer_id: CUSTOMER, warehouse_id: DC2.id, requested_date: inDays(0) }))
    );
    remember('OutboundRequest', requests);

    const admin = await signedIn(browser, baseURL, 'e2e/.auth/state.json');
    const staff = await signedIn(browser, baseURL, STAFF_SESSION);
    const open = async ({ page }, k) => {
      await chooseWorkingWarehouse(page, DC2.name);
      await openMenu(page, 'Outbounds');
      await page.locator('tr', { hasText: `OB-CONC-${stamp}-${k}` }).click();
      await page.getByRole('button', { name: /Select Goods/ }).click();
      const modal = page.locator('.modal-card');
      const select = modal.locator('select').first();
      await expect.poll(async () => (await select.locator('option').allTextContents()).some((t) => t.includes('CONCTEST')), { timeout: 60_000 }).toBe(true);
      const value = await select.locator('option', { hasText: 'CONCTEST' }).first().getAttribute('value');
      await select.selectOption(value);
      await expect(modal.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
      return modal;
    };
    const [modalA, modalB] = await Promise.all([open(admin, 'A'), open(staff, 'B')]);

    await Promise.all([modalA.getByRole('button', { name: 'Add', exact: true }).click(), modalB.getByRole('button', { name: 'Add', exact: true }).click()]);
    await admin.page.waitForTimeout(8_000);

    const lines = await queryRows(db.call, `SELECT PickTask.ROWID, PickTask.outbound_request_id FROM PickTask WHERE PickTask.cargo_id = ${cargoId}`);
    console.log(`the pallet is on ${lines.length} pick list(s)`);
    expect(lines.length, 'the same pallet is on more than one outbound').toBeLessThanOrEqual(1);
    const told = (await admin.page.getByText(/just added to outbound/).count()) + (await staff.page.getByText(/just added to outbound/).count());
    expect(told, 'nobody was told the pallet was taken').toBe(1);
    await admin.context.close();
    await staff.context.close();
  });
});
