import { test, expect } from '@playwright/test';
import { openHome, openMenu, expectNoErrors, inDays, field, chooseWorkingWarehouse, watchSlowRequests } from './helpers';

const WAREHOUSE = 'Rotterdam DC2';
const CUSTOMER = 'TEST Alpha Pallets Ltd';

let reportPending = () => {};
test.afterEach(() => reportPending());

// A request with one line, ready for the availability check.
async function newReadyInbound(page) {
  await openMenu(page, 'Inbounds');
  await page.getByRole('button', { name: '+ New Inbound' }).click();
  await expect(page.getByText('Shipment Details')).toBeVisible();
  await field(page, 'Customer *').selectOption({ label: CUSTOMER });
  await field(page, 'Destination (Country) *').selectOption({ index: 1 });
  await field(page, 'Expected Arrival (ETA) *').fill(inDays(1));
  await field(page, 'Expected Arrival (ETA) *').blur();
  await field(page, 'Expected Storage Period: From').fill(inDays(1));
  await field(page, 'Expected Storage Period: From').blur();
  await field(page, 'Expected Storage Period: To').fill(inDays(15));
  await field(page, 'Expected Storage Period: To').blur();
  await field(page, 'Customer Reference / PO Number').fill('AUTOTEST rules ' + new Date().toISOString().slice(0, 16));
  await page.getByRole('button', { name: '+ Add Line' }).click();
  const row = page.locator('.line-item-row').first();
  await row.locator('select').selectOption('Carton');
  const inputs = row.locator('input');
  await inputs.nth(1).fill('AUTOTEST Rules goods');
  await inputs.nth(2).fill('4');
  await inputs.nth(3).fill('10');
  await inputs.nth(4).fill('60');
  await inputs.nth(5).fill('40');
  await inputs.nth(6).fill('40');
  await inputs.nth(6).blur();
  await field(page, 'Expected Colli *').fill('4');
  await field(page, 'Expected Colli *').blur();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /Availability Check/ })).toBeVisible({ timeout: 60_000 });
}

// I6, I8, D6: reject with a reason, reopen, accept, then edit an accepted inbound.
test('inbound: reject with a reason, reopen, accept, and editing an accepted request sends it back for a new check', async ({ page }) => {
  test.setTimeout(240_000);
  reportPending = watchSlowRequests(page);
  await openHome(page);
  await chooseWorkingWarehouse(page, WAREHOUSE);
  await newReadyInbound(page);

  await test.step('rejecting needs a reason (I6)', async () => {
    await page.getByRole('button', { name: /Availability Check/ }).click();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    const confirmReject = page.getByRole('button', { name: 'Reject Request' });
    await expect(confirmReject).toBeDisabled(); // no reason yet
    await page.getByPlaceholder(/Explain why this request can't be accepted/).fill('AUTOTEST no space in that period');
    await expect(confirmReject).toBeEnabled();
    await confirmReject.click();
    await expect(page.getByText('AUTOTEST no space in that period')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Availability Check|Mark as Received/ })).toHaveCount(0); // a rejected request cannot go on
  });

  await test.step('the administrator can reopen it; it is a normal request again (I6)', async () => {
    await page.getByRole('button', { name: 'Reopen Request' }).click();
    await expect(page.getByText('Shipment Details')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /Availability Check/ })).toBeVisible({ timeout: 60_000 });
  });

  await test.step('accept: Edit Request is still offered, the next step is receiving (I8)', async () => {
    await page.getByRole('button', { name: /Availability Check/ }).click();
    await page.getByRole('button', { name: /^Accept/ }).click();
    await expect(page.getByRole('button', { name: /Mark as Received/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Edit Request' })).toBeVisible();
  });

  await test.step('editing an accepted request asks first and returns it to Requested (D6, I8)', async () => {
    let message = '';
    page.once('dialog', (d) => {
      message = d.message();
      d.accept();
    });
    await page.getByRole('button', { name: 'Edit Request' }).click();
    await expect(page.getByText('Shipment Details')).toBeVisible({ timeout: 60_000 });
    expect(message).toMatch(/availability check is run again/);
    await page.getByRole('button', { name: 'Done' }).click();
    // back at Requested: it needs the availability check again, and cannot be received yet
    await expect(page.getByRole('button', { name: /Availability Check/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Mark as Received/ })).toHaveCount(0);
    await expectNoErrors(page);
  });
});

// O4: two drivers for the same customer on the same day stay separate.
test('outbound: two pickups for one customer on one day keep their own driver, vehicle and reference (O4)', async ({ page }) => {
  test.setTimeout(240_000);
  reportPending = watchSlowRequests(page);
  const stamp = new Date().toISOString().slice(0, 19);
  const jobs = [
    { carrier: 'TEST Carrier North (client-own)', driver: 'Alice Driver', plate: 'AUTO-NORTH-1', ref: `AUTOTEST O4-A ${stamp}` },
    { carrier: 'TEST Carrier South (client-own)', driver: 'Bob Driver', plate: 'AUTO-SOUTH-2', ref: `AUTOTEST O4-B ${stamp}` },
  ];
  await openHome(page);
  await chooseWorkingWarehouse(page, WAREHOUSE);

  for (const j of jobs) {
    await openMenu(page, 'Outbounds');
    await page.getByRole('button', { name: '+ New Outbound Request' }).click();
    await field(page, 'Customer').selectOption({ label: CUSTOMER });
    await field(page, 'Transporter').selectOption({ label: j.carrier });
    await field(page, 'Reference number').fill(j.ref);
    await field(page, 'Requested date').fill(inDays(0));
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const row = page.locator('tr', { hasText: j.ref });
    await expect(row).toBeVisible({ timeout: 60_000 });
    j.reference = (await row.locator('td').first().innerText()).trim();
  }
  expect(jobs[0].reference).not.toBe(jobs[1].reference);
  expect(jobs[0].reference).toMatch(/^OB-\d{4}-\d{6}$/);

  for (const j of jobs) {
    await openMenu(page, 'Outbounds');
    await page.locator('tr', { hasText: j.ref }).click();
    await page.getByRole('button', { name: /Driver Check-in/ }).first().click();
    const modal = page.locator('.modal-card');
    await field(modal, 'Driver name').fill(j.driver);
    await field(modal, 'Driver ID number').fill('ID-' + j.plate);
    await field(modal, 'Vehicle plate').fill(j.plate);
    await modal.getByRole('button', { name: 'Check driver in' }).click();
    await expect(page.getByText(j.plate).first()).toBeVisible({ timeout: 60_000 });
  }

  // each request shows only its own driver and vehicle
  for (const [i, j] of jobs.entries()) {
    const other = jobs[1 - i];
    await openMenu(page, 'Outbounds');
    await page.locator('tr', { hasText: j.ref }).click();
    await expect(page.getByRole('heading', { name: j.reference })).toBeVisible();
    await expect(page.getByText(j.plate).first()).toBeVisible();
    await expect(page.getByText(j.driver).first()).toBeVisible();
    await expect(page.getByText(other.plate)).toHaveCount(0);
    await expect(page.getByText(other.driver)).toHaveCount(0);
  }

  // the gate finds each pass by its own reference, not both
  await openMenu(page, 'Outbounds');
  await page.getByPlaceholder(/Find by pickup reference/).fill(jobs[0].reference);
  await expect(page.locator('tr', { hasText: jobs[0].reference })).toBeVisible();
  await expect(page.locator('tr', { hasText: jobs[1].reference })).toHaveCount(0);
  await expectNoErrors(page);
});
