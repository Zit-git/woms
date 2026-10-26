import { test, expect } from '@playwright/test';
import zlib from 'node:zlib';
import { openHome, openMenu, expectNoErrors, inDays, field, chooseWorkingWarehouse, watchSlowRequests } from './helpers';

// A tiny valid PNG to upload as a test photo.
function tinyPng() {
  const crc = (buf) => {
    let c, crcv = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crcv ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcv = (crcv >>> 8) ^ c;
    }
    return (crcv ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 180)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Slow or still-pending data requests are printed after the test, to explain any "server did not respond" message.
let reportPending = () => {};
test.afterEach(() => reportPending());

const WAREHOUSE = 'Rotterdam DC2';
const CUSTOMER = 'TEST Alpha Pallets Ltd';

// A, B of docs/TEST_JOURNEY.md: request with validation, then the availability check.
test('inbound: request to GRN (validation, availability, receive, handling units, put-away)', async ({ page }) => {
  test.setTimeout(240_000);
  reportPending = watchSlowRequests(page);
  // With WOMS_TOKEN_ROUTE=1 the page calls functions the way Slate must (a token across addresses): count the token exchanges
  const tokenExchanges = [];
  page.on('request', (r) => /clientoauth\/v2\/\d+\/remote\/auth/.test(r.url()) && tokenExchanges.push(r.url()));

  await test.step('open Inbounds for the working warehouse and start a new request', async () => {
    await openHome(page);
    await chooseWorkingWarehouse(page, WAREHOUSE);
    await openMenu(page, 'Inbounds');
    await page.getByRole('button', { name: '+ New Inbound' }).click();
    await expect(page.getByText('Shipment Details')).toBeVisible(); // the Request popup opens by itself (A1)
  });

  const popup = page.locator('.modal, [role="dialog"]').last();

  await test.step('header fields and date rules (A2, A3)', async () => {
    await field(page, 'Customer *').selectOption({ label: CUSTOMER });
    await field(page, 'Destination (Country) *').selectOption({ index: 1 });
    // an arrival in the past is refused
    await field(page, 'Expected Arrival (ETA) *').fill(inDays(-1));
    await field(page, 'Expected Arrival (ETA) *').blur();
    await expect(page.getByText('Expected arrival cannot be in the past.')).toBeVisible();
    // a sensible one is accepted
    await field(page, 'Expected Arrival (ETA) *').fill(inDays(1));
    await field(page, 'Expected Arrival (ETA) *').blur();
    await expect(page.getByText('Expected arrival cannot be in the past.')).toHaveCount(0);
    // storage cannot start before arrival, nor end before it starts
    await field(page, 'Expected Storage Period: From').fill(inDays(0));
    await field(page, 'Expected Storage Period: From').blur();
    await expect(page.getByText('Storage cannot start before the expected arrival date.')).toBeVisible();
    await field(page, 'Expected Storage Period: From').fill(inDays(1));
    await field(page, 'Expected Storage Period: From').blur();
    await field(page, 'Expected Storage Period: To').fill(inDays(0));
    await field(page, 'Expected Storage Period: To').blur();
    await expect(page.getByText('Storage period cannot end before it starts.')).toBeVisible();
    await field(page, 'Expected Storage Period: To').fill(inDays(31));
    await field(page, 'Expected Storage Period: To').blur();
    await field(page, 'Transport Type').selectOption({ index: 3 });
    await field(page, 'CMR (Freight Document) Number').fill('AUTOTEST-CMR-1');
    await field(page, 'Customer Reference / PO Number').fill('AUTOTEST ' + new Date().toISOString().slice(0, 16));
  });

  await test.step('three line items and the Expected Colli rule (A4)', async () => {
    const lines = [
      { unit: 'Carton', desc: 'AUTOTEST Cotton T-shirts', qty: '40', kg: '12', l: '60', w: '40', h: '40' },
      { unit: 'Carton', desc: 'AUTOTEST Denim jeans', qty: '20', kg: '15', l: '60', w: '40', h: '40' },
      { unit: 'Box', desc: 'AUTOTEST Spare parts', qty: '10', kg: '8', l: '40', w: '30', h: '30' },
    ];
    for (let i = 0; i < lines.length; i++) {
      await page.getByRole('button', { name: '+ Add Line' }).click();
      const row = page.locator('.line-item-row').nth(i);
      await expect(row).toBeVisible();
      await row.locator('select').selectOption(lines[i].unit);
      const inputs = row.locator('input');
      await inputs.nth(1).fill(lines[i].desc);
      await inputs.nth(2).fill(lines[i].qty);
      await inputs.nth(3).fill(lines[i].kg);
      await inputs.nth(4).fill(lines[i].l);
      await inputs.nth(5).fill(lines[i].w);
      await inputs.nth(6).fill(lines[i].h);
      await inputs.nth(6).blur();
    }
    // 60 does not match 70 packages
    await field(page, 'Expected Colli *').fill('60');
    await field(page, 'Expected Colli *').blur();
    await expect(page.getByText(/line items add up to 70/)).toBeVisible();
    await page.getByRole('button', { name: 'Set to 70' }).click();
    await expect(page.getByText(/line items add up to/)).toHaveCount(0);
  });

  await test.step('close the popup: the page shows the lines and offers the availability check (A5)', async () => {
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('AUTOTEST Cotton T-shirts')).toBeVisible();
    await expect(page.getByRole('button', { name: /Availability Check/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Request' })).toBeVisible();
    await expectNoErrors(page);
  });

  await test.step('availability check: one row per day, rising dates (B1)', async () => {
    await page.getByRole('button', { name: /Availability Check/ }).click();
    await expect(page.getByText('Required').first()).toBeVisible();
    const days = await page.locator('table tbody tr td:first-child').allTextContents();
    const dated = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.trim()));
    expect(dated.length).toBeGreaterThan(20);
    expect(new Set(dated).size).toBe(dated.length); // every day is different
    expect(dated[0]).toBe(inDays(1));
  });

  await test.step('accept (B3)', async () => {
    await page.getByRole('button', { name: /^Accept/ }).click();
    await expect(page.getByRole('button', { name: /Mark as Received/ })).toBeVisible({ timeout: 30_000 });
    await expectNoErrors(page);
  });

  await test.step('receive: required fields, signature, documents with previews, quantities (C1-C5)', async () => {
    await page.getByRole('button', { name: /Mark as Received/ }).click();
    const receive = page.getByRole('button', { name: 'Mark as Received', exact: true });
    await expect(receive).toBeDisabled(); // nothing filled in yet
    await field(page, 'Warehouse Unloading Date *').fill(inDays(0));
    await field(page, 'Warehouse Unloading Date *').blur();
    await field(page, 'Warehouse Unloading Time *').fill('09:30');
    await field(page, 'Warehouse Unloading Time *').blur();
    await field(page, 'Plate / License Plate *').fill('AUTOTEST-NL-12-AB');
    await field(page, 'Plate / License Plate *').blur();
    await field(page, 'Driver Name *').fill('Auto Tester');
    await field(page, 'Driver Name *').blur();
    // line 1 arrives short: 38 of 40
    const received = page.locator('table input[type="number"]');
    await received.nth(0).fill('38');
    await field(page, 'Received Piece Count *').fill('70');
    await field(page, 'Received Piece Count *').blur();
    await expect(page.getByText(/Differs from the received quantities below \(68\)/)).toBeVisible();
    await field(page, 'Received Piece Count *').fill('68');
    await field(page, 'Received Piece Count *').blur();
    await expect(page.getByText(/Differs from the received quantities below/)).toHaveCount(0);

    // driver signature: draw, save, see it
    await page.getByRole('button', { name: 'Capture Signature' }).click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
    await page.mouse.move(box.x + 200, box.y + 50, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Save Signature' }).click();
    await expect(page.getByAltText('Captured signature')).toBeVisible({ timeout: 60_000 });

    // CMR photo and an extra photo are previewable right after upload
    const png = { name: 'autotest photo.png', mimeType: 'image/png', buffer: tinyPng() };
    const cmr = page.locator('.doc-slot', { hasText: 'CMR Upload' });
    await cmr.locator('input[type="file"]').first().setInputFiles(png);
    await expect(cmr.locator('img')).toBeVisible({ timeout: 60_000 });
    const extra = page.locator('.doc-slot', { hasText: 'Additional Photos' });
    await extra.locator('input[type="file"]').first().setInputFiles(png);
    await expect(extra.locator('img')).toBeVisible({ timeout: 60_000 });

    await expect(receive).toBeEnabled();
    await receive.click();
    await expect(page.getByRole('button', { name: /Create Handling Units/ })).toBeVisible({ timeout: 60_000 });
    // received 38 + 20 + 10 = 68 (the quantity typed in the popup was once silently reset to the planned 70)
    await expect(page.getByText('68 pcs').first()).toBeVisible();
    // the Documents card on the inbound page loads when scrolled into view: scroll like a person
    await page.mouse.move(700, 400); // over the page content, so the wheel scrolls it
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(400);
    }
    await expect(page.getByAltText('Driver Signature (Receiving)')).toBeVisible({ timeout: 60_000 });
    await expectNoErrors(page);
  });

  await test.step('handling units: split one line, combine two, over-pack refused (D1-D5)', async () => {
    await page.getByRole('button', { name: /Create Handling Units/ }).click();
    const modal = page.locator('.modal-card');
    const put = modal.locator('table').first().locator('input[type="number"]'); // "Put on new HU" per line
    const huRows = modal.locator('table').nth(1).locator('tbody tr'); // the Handling Units built so far
    // over-pack: 30 x 2 copies = 60 of the 38 received
    await put.nth(0).fill('30');
    await field(page, 'Create this many identical HUs').fill('2');
    await page.getByRole('button', { name: 'Add Handling Unit' }).click();
    await expect(page.getByText(/only 38 package\(s\) left to pack/)).toBeVisible();
    // split: line 1 = 19 on each of 2 pallets
    await put.nth(0).fill('19');
    await page.getByRole('button', { name: 'Add Handling Unit' }).click();
    await expect(huRows).toHaveCount(2, { timeout: 60_000 });
    // combine: lines 2 and 3 on one pallet
    await field(page, 'Create this many identical HUs').fill('1');
    await put.nth(1).fill('20');
    await put.nth(2).fill('10');
    await page.getByRole('button', { name: 'Add Handling Unit' }).click();
    await expect(huRows).toHaveCount(3, { timeout: 60_000 });
    const cont = page.getByRole('button', { name: /Continue to Put-away/ });
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page.getByRole('button', { name: /Put Away/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Handling Units' })).toBeVisible();
  });

  await test.step('put away: suggested locations, store all (E1-E2)', async () => {
    await page.getByRole('button', { name: /Put Away/ }).click();
    const store = page.getByRole('button', { name: /^Store \d+ of \d+/ });
    await expect(store).toBeEnabled({ timeout: 60_000 });
    await store.click();
    await expect(page.getByRole('button', { name: /Complete Inbound/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/RT2-[AB]\d-R0\d-B\d-L\d/).first()).toBeVisible(); // locations in the new format
  });

  await test.step('complete: GRN generated, status Ready (F1)', async () => {
    await page.getByRole('button', { name: /Complete Inbound/ }).first().click();
    await page.getByRole('button', { name: /Complete Inbound/ }).last().click();
    await expect(page.getByRole('button', { name: /Finish/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Goods Receipt Note')).toBeVisible();
    await expectNoErrors(page);
  });

  if (process.env.WOMS_TOKEN_ROUTE) {
    expect(tokenExchanges.length, 'the Slate route was not used: no token was requested').toBeGreaterThan(0);
    expect(tokenExchanges.length, 'a token is reused, not asked for again on every upload').toBeLessThan(4);
  }
});
