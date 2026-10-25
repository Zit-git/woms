import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openHome, inDays, chooseWorkingWarehouse, field } from './helpers';
import { openSession, queryRows, insertRows, deleteRows } from './volume/common.mjs';

// Phones and tablets: every screen in the menu and the main popups must fit the screen (no sideways
// scrolling of the page, popups inside the screen, the buttons reachable). Screenshots are kept in
// e2e/results/devices/ for a look. Chromium emulation of screen size, touch and mobile mode.
const DEVICES = [
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'small phone 360x640', viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true },
  { name: 'tablet 768x1024', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
  { name: 'tablet landscape 1024x768', viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true },
  { name: 'laptop 1280x720', viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false },
];
const DC2 = { id: '11648000001183001', name: 'Rotterdam DC2' };
const CUSTOMER = '11648000001228002'; // TEST Alpha Pallets Ltd
const stamp = Date.now().toString(36).toUpperCase();
const SHOTS = 'e2e/results/devices';
fs.mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: 'serial' });

let db;
const made = { PickTask: [], HuLine: [], Cargo: [], OutboundRequest: [], InboundLine: [], InboundAdvice: [] };
const refs = {}; // seeded records by purpose

test.beforeAll(async () => {
  db = await openSession();
  const remember = (t, ids) => made[t].push(...ids);
  const advice = async (tag, status) => {
    const [id] = await insertRows(db.call, 'InboundAdvice', [
      { reference_number: `DEVTEST ${stamp} ${tag}`, inbound_reference: `IB-DEV-${stamp}-${tag}`, status, customer_id: CUSTOMER, warehouse_id: DC2.id, destination: 'Netherlands', expected_date: inDays(1), storage_start_date: inDays(1), storage_end_date: inDays(10), expected_colli: '1' },
    ]);
    const [lineId] = await insertRows(db.call, 'InboundLine', [{ inbound_advice_id: id, customer_id: CUSTOMER, warehouse_id: DC2.id, line_no: '1', unit: 'Pallet', description: `DEVTEST goods ${tag}`, qty: 1, received_qty: status === 'Requested' || status === 'Confirmed' ? null : 1, weight: 100, length_cm: 60, width_cm: 40, height_cm: 40 }]);
    remember('InboundAdvice', [id]);
    remember('InboundLine', [lineId]);
    return { id, lineId, reference: `IB-DEV-${stamp}-${tag}` };
  };
  const withPallet = async (a, extra = {}) => {
    const [cargoId] = await insertRows(db.call, 'Cargo', [
      { inbound_advice_id: a.id, customer_id: CUSTOMER, warehouse_id: DC2.id, description: `DEVTEST pallet ${a.reference.slice(-2)}`, unit: 'Pallet', qty: '1', received_qty: 1, weight: 100, length_cm: 60, width_cm: 40, height_cm: 40, outer_package_no: '1', qr_code: `DEVTEST-${stamp}-${a.reference.slice(-2)}`, status: 'Received', ...extra },
    ]);
    const [huLine] = await insertRows(db.call, 'HuLine', [{ cargo_id: cargoId, inbound_line_id: a.lineId, qty: 1 }]);
    remember('Cargo', [cargoId]);
    remember('HuLine', [huLine]);
    return cargoId;
  };

  refs.requested = await advice('RQ', 'Requested');
  refs.confirmed = await advice('CF', 'Confirmed');
  refs.received = await advice('RC', 'Received');
  refs.huCreated = await advice('HU', 'HU Created');
  await withPallet(refs.received);
  await withPallet(refs.huCreated);

  // an outbound with one stored pallet on it (for the pick, goods and check-in screens)
  const locs = await queryRows(
    db.call,
    'SELECT StorageLocations.ROWID, StorageLocations.capacity, StorageLocations.occupancy_status FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Aisles ON Racks.aisle_id = Aisles.ROWID LEFT JOIN Zones ON Aisles.zone_id = Zones.ROWID WHERE Zones.warehouse_id = ' + DC2.id
  );
  const used = await queryRows(db.call, 'SELECT Cargo.current_location_id, Cargo.reserved_location_id FROM Cargo WHERE Cargo.current_location_id IS NOT NULL OR Cargo.reserved_location_id IS NOT NULL');
  const taken = new Set(used.flatMap((r) => [r.Cargo.current_location_id, r.Cargo.reserved_location_id]).filter(Boolean).map(String));
  const free = locs.map((r) => r.StorageLocations).find((l) => String(l.capacity) === '1' && l.occupancy_status !== 'Blocked' && !taken.has(String(l.ROWID)));
  const home = await advice('OB', 'Put Away');
  const cargoId = await withPallet(home, { status: 'Stored', current_location_id: free.ROWID });
  const [reqId] = await insertRows(db.call, 'OutboundRequest', [
    { reference_number: `DEVTEST ${stamp} OUT`, outbound_reference: `OB-DEV-${stamp}`, status: 'Submitted', customer_id: CUSTOMER, warehouse_id: DC2.id, requested_date: inDays(0) },
  ]);
  remember('OutboundRequest', [reqId]);
  const [pick] = await insertRows(db.call, 'PickTask', [{ cargo_id: cargoId, outbound_request_id: reqId, status: 'Assigned', assigned_to: 'devtest@test' }]);
  remember('PickTask', [pick]);
  refs.outbound = `OB-DEV-${stamp}`;
  refs.outboundEmpty = null;
});

test.afterAll(async () => {
  try {
    for (const t of ['PickTask', 'HuLine', 'Cargo', 'OutboundRequest', 'InboundLine', 'InboundAdvice']) await deleteRows(db.call, t, [...new Set(made[t])]);
  } finally {
    await db.browser.close();
  }
});

// ---- helpers -------------------------------------------------------------------------------------
async function settle(page) {
  await page.waitForLoadState('load');
  await expect(page.getByText(/^Loading/)).toHaveCount(0, { timeout: 90_000 });
  await page.waitForTimeout(400);
}

// The menu as a person uses it: on a phone, a few screens are in the bottom bar and the rest behind the
// menu button; on a wide screen the sidebar is always there.
async function go(page, label) {
  if (await page.locator('.mobile-topbar').isVisible()) {
    const inBar = page.locator('.bottom-nav').getByRole('link', { name: label.split(' ')[0], exact: true });
    if ((await inBar.count()) && (await inBar.first().isVisible())) {
      await inBar.first().click();
    } else {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.locator('.sidebar.mobile-open').getByRole('link', { name: label, exact: true }).click();
    }
  } else {
    await page.locator('.sidebar').getByRole('link', { name: label, exact: true }).click();
  }
  await settle(page);
}

// Page-level sideways overflow, and visible elements poking out of the screen outside any scrolling container.
async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const pageOverflow = document.documentElement.scrollWidth - vw;
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    const poking = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
        return r.right > vw + 1 && !inScroller(el);
      })
      .slice(0, 4)
      .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(el.textContent || '').trim().slice(0, 30)}"`);
    return { vw, pageOverflow, poking };
  });
}

async function checkScreen(page, device, name) {
  await settle(page);
  const r = await overflowReport(page);
  await page.screenshot({ path: `${SHOTS}/${device.name.replace(/ /g, '_')}--${name.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: false });
  expect(r.pageOverflow, `${name}: the page scrolls sideways by ${r.pageOverflow}px (${r.poking.join('; ')})`).toBeLessThanOrEqual(1);
  expect(r.poking, `${name}: elements outside the screen`).toEqual([]);
  // tabs side by side must not lie on top of each other (a row of eight squeezed into a phone did)
  const overlaps = await page.evaluate(() =>
    [...document.querySelectorAll('.tabs')].flatMap((strip) => {
      const boxes = [...strip.querySelectorAll('.tab')].map((t) => ({ text: t.textContent.trim(), r: t.getBoundingClientRect() }));
      return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.r.right > b.r.left + 2 && b.r.right > a.r.left + 2 && a.r.bottom > b.r.top + 2 && b.r.bottom > a.r.top + 2).map((b) => `${a.text} / ${b.text}`));
    })
  );
  expect(overlaps, `${name}: tabs overlap each other`).toEqual([]);
  expect(await page.locator('.error-text').count(), `${name} shows an error`).toBe(0);
}

async function checkPopup(page, device, name) {
  const modal = page.locator('.modal-card').last();
  await expect(modal).toBeVisible({ timeout: 60_000 });
  await settle(page);
  const box = await modal.boundingBox();
  const vp = device.viewport;
  expect(box.x, `${name}: popup starts left of the screen`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${name}: popup runs past the right edge (${Math.round(box.x + box.width)} > ${vp.width})`).toBeLessThanOrEqual(vp.width + 1);
  // every button in the popup can be scrolled to and sits inside the screen width
  const buttons = modal.getByRole('button');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible())) continue;
    await b.scrollIntoViewIfNeeded();
    const bb = await b.boundingBox();
    if (bb) expect(bb.x + bb.width, `${name}: a button is cut off at the right`).toBeLessThanOrEqual(vp.width + 1);
  }
  const r = await overflowReport(page);
  await page.screenshot({ path: `${SHOTS}/${device.name.replace(/ /g, '_')}--popup_${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
  expect(r.pageOverflow, `${name}: the page scrolls sideways by ${r.pageOverflow}px`).toBeLessThanOrEqual(1);
}

async function closePopup(page) {
  await page.locator('.modal-card').last().getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('.modal-card')).toHaveCount(0);
}

// ---- the audit, once per screen size -----------------------------------------------------------------
for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });

    test('every screen in the menu fits', async ({ page }) => {
      test.setTimeout(300_000);
      await openHome(page);
      await chooseWorkingWarehouse(page, DC2.name);
      await checkScreen(page, device, 'Dashboard');
      // the menu lists what this user may open; visit each (the sidebar is in the page even when folded away)
      const labels = (await page.locator('.sidebar nav a').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      expect(labels.length).toBeGreaterThan(5);
      for (const label of labels) {
        if (label === 'Dashboard') continue;
        await go(page, label);
        await checkScreen(page, device, label);
      }
      // the warehouse map (stacked level cards) as well
      await go(page, 'Warehouses');
      await page.locator('.tab', { hasText: 'Map' }).click();
      await field(page, 'Warehouse').selectOption({ label: DC2.name });
      await expect(page.locator('.level-card').first()).toBeVisible({ timeout: 90_000 });
      await checkScreen(page, device, 'warehouse map');
    });

    test('inbound popups fit and their buttons are reachable', async ({ page }) => {
      test.setTimeout(300_000);
      await openHome(page);
      await chooseWorkingWarehouse(page, DC2.name);
      const open = async (ref) => {
        await go(page, 'Inbounds');
        await page.locator('tr', { hasText: ref }).first().click();
        await settle(page);
        await checkScreen(page, device, `inbound ${ref.slice(-2)}`);
      };
      await open(refs.requested.reference);
      await page.getByRole('button', { name: /Continue Request|Edit Request/ }).first().click();
      await checkPopup(page, device, 'request');
      await closePopup(page);

      await open(refs.confirmed.reference);
      await page.getByRole('button', { name: /Mark as Received/ }).first().click();
      await checkPopup(page, device, 'receive');
      await closePopup(page);

      await open(refs.received.reference);
      await page.getByRole('button', { name: /Create Handling Units/ }).first().click();
      await checkPopup(page, device, 'handling units');
      await closePopup(page);

      await open(refs.huCreated.reference);
      await page.getByRole('button', { name: /Put Away/ }).first().click();
      await checkPopup(page, device, 'put-away');
      await closePopup(page);
    });

    test('outbound screens and popups fit', async ({ page }) => {
      test.setTimeout(300_000);
      await openHome(page);
      await chooseWorkingWarehouse(page, DC2.name);
      await go(page, 'Outbounds');
      await page.locator('tr', { hasText: refs.outbound }).first().click();
      await settle(page);
      await checkScreen(page, device, 'outbound request');
      await page.getByRole('button', { name: /Pick Goods/ }).first().click();
      await checkPopup(page, device, 'pick goods');
      await closePopup(page);
      await page.getByRole('button', { name: /Edit Goods|Select Goods/ }).first().click();
      await checkPopup(page, device, 'goods');
      await closePopup(page);
      await page.getByRole('button', { name: /Driver Check-in|Check Driver In/ }).first().click();
      await checkPopup(page, device, 'driver check-in');
      await closePopup(page);
    });
  });
}
