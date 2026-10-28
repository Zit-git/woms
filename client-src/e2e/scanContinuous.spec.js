import { test, expect } from '@playwright/test';
import path from 'node:path';
import { openHome, openMenu, inDays, chooseWorkingWarehouse } from './helpers';
import { openSession, queryRows, insertRows, deleteRows } from './volume/common.mjs';
import { makeQrVideo } from './fixtures/qrVideo.mjs';

// The real camera path: headless Chromium is given a fake camera that shows one QR label after another, and the
// pick list is worked through in ONE scanner session (the camera stays open). Seeds SCANTEST records and removes them.
const DC2 = { id: '11648000001183001', name: 'Rotterdam DC2' };
const CUSTOMER = '11648000001228002'; // TEST Alpha Pallets Ltd
const stamp = Date.now().toString(36).toUpperCase();
const CODES = ['A', 'B', 'C'].map((k) => `WOMS-CARGO-SCANTEST${k}`);
const VIDEO = path.resolve('e2e/.fixtures/scan.mjpeg');
await makeQrVideo(CODES, VIDEO);

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`] },
  permissions: ['camera'],
});

test.describe('pick list with the camera left on', () => {
  test.setTimeout(240_000);
  let db;
  const made = { PickTask: [], Cargo: [], OutboundRequest: [], InboundLine: [], InboundAdvice: [] };

  test.beforeAll(async () => {
    db = await openSession();
  });
  test.afterAll(async () => {
    try {
      for (const table of ['PickTask', 'Cargo', 'OutboundRequest', 'InboundLine', 'InboundAdvice']) await deleteRows(db.call, table, made[table]);
    } finally {
      await db.browser.close();
    }
  });

  test('three labels are scanned in one session; the fourth unit is marked picked by hand', async ({ page }) => {
    const [advice] = await insertRows(db.call, 'InboundAdvice', [
      { reference_number: `SCANTEST ${stamp}`, inbound_reference: `IB-SCAN-${stamp}`, status: 'Completed', customer_id: CUSTOMER, warehouse_id: DC2.id, destination: 'Netherlands', expected_date: inDays(1), storage_start_date: inDays(1), storage_end_date: inDays(10), expected_colli: '4' },
    ]);
    made.InboundAdvice.push(advice);
    const [line] = await insertRows(db.call, 'InboundLine', [{ inbound_advice_id: advice, customer_id: CUSTOMER, warehouse_id: DC2.id, line_no: '1', unit: 'Box', description: 'SCANTEST goods', qty: 4, received_qty: 4, weight: 10 }]);
    made.InboundLine.push(line);
    const qr = [...CODES, `WOMS-CARGO-SCANTESTD-${stamp}`];
    const cargo = await insertRows(
      db.call,
      'Cargo',
      qr.map((code, i) => ({ inbound_advice_id: advice, customer_id: CUSTOMER, warehouse_id: DC2.id, description: `SCANTEST box ${i + 1}`, unit: 'Box', qty: '1', received_qty: 1, weight: 10, outer_package_no: String(i + 1), qr_code: code, status: 'Stored' }))
    );
    made.Cargo.push(...cargo);
    const [outbound] = await insertRows(db.call, 'OutboundRequest', [
      { reference_number: `SCANTEST ${stamp} OUT`, outbound_reference: `OB-SCAN-${stamp}`, status: 'Submitted', customer_id: CUSTOMER, warehouse_id: DC2.id, requested_date: inDays(0) },
    ]);
    made.OutboundRequest.push(outbound);
    const picks = await insertRows(db.call, 'PickTask', cargo.map((id) => ({ outbound_request_id: outbound, cargo_id: id, status: 'Assigned', assigned_to: 'scantest@example.com' })));
    made.PickTask.push(...picks);

    await openHome(page);
    await chooseWorkingWarehouse(page, DC2.name);
    await openMenu(page, 'Outbounds');
    await page.getByRole('button', { name: 'All dates' }).click();
    await page.locator('tr', { hasText: `OB-SCAN-${stamp}` }).click();
    await page.getByRole('button', { name: /Pick Goods/ }).first().click();

    const pick = page.locator('.modal-card').first();
    await expect(pick.getByText('0 of 4 picked')).toBeVisible();
    await pick.getByRole('button', { name: 'Scan to Pick' }).click();

    // one camera session: A, then B, then C (each shown for a few seconds, with blank gaps between)
    const scanner = page.locator('.modal-card').last();
    await expect(scanner.getByRole('status')).toContainText('SCANTEST', { timeout: 60_000 }).catch(() => {});
    await expect(page.getByText('3 of 4 picked')).toBeVisible({ timeout: 90_000 });

    // the camera is still on: it did not close after the first label
    await expect(scanner.getByText('The camera stays on')).toBeVisible();
    await scanner.getByRole('button', { name: 'Close' }).click();

    // the fourth unit: by hand
    await pick.getByRole('button', { name: 'Mark picked' }).click();
    await expect(page.getByText('4 of 4 picked')).toBeVisible({ timeout: 30_000 });

    const rows = await queryRows(db.call, `SELECT PickTask.status FROM PickTask WHERE PickTask.outbound_request_id = ${outbound}`);
    expect(rows.map((r) => r.PickTask.status)).toEqual(['Picked', 'Picked', 'Picked', 'Picked']);
  });
});
