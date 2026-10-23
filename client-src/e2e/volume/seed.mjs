// Fills Development with history for a volume test. Every row is tagged VOLTEST and its id is
// recorded in e2e/.volume/manifest.json so volume-cleanup.mjs removes exactly these rows.
//   N=300 node e2e/volume/seed.mjs        (N inbounds; each has 3 lines, 10 pallets and one delivered outbound)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { openSession, rowIds, MANIFEST } from './common.mjs';

const N = Number(process.env.N || 300);
const HU_PER_INBOUND = 10;
const WAREHOUSES = ['11648000001183001', '11648000001197506', '11648000001197507']; // DC2, Hamburg, Antwerp
const CUSTOMERS = ['11648000001228002', '11648000001228003', '11648000001228004', '11648000001131407', '11648000001185003'];
const CARRIERS = ['11648000001229001', '11648000001229002', '11648000001229003', '11648000001136492'];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const day = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

mkdirSync('e2e/.volume', { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest));
const { browser, call } = await openSession();

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const r = await call('POST', `/table/${table}/row`, batch);
    const ids = rowIds(r.text);
    if (r.status !== 200 || ids.length !== batch.length) throw new Error(`${table} insert failed: ${r.status} (${ids.length} of ${batch.length} ids) ${String(r.text).slice(0, 300)}`);
    (manifest[table] ||= []).push(...ids);
    save();
  }
}

const t0 = Date.now();
const stamp = Date.now().toString(36).toUpperCase();
const inbounds = Array.from({ length: N }, (_, i) => ({
  reference_number: `VOLTEST ${stamp} ${i + 1}`,
  inbound_reference: `IB-VOL-${stamp}-${pad(i + 1, 4)}`,
  status: 'Completed',
  customer_id: CUSTOMERS[i % CUSTOMERS.length],
  warehouse_id: WAREHOUSES[i % WAREHOUSES.length],
  transporter_id: CARRIERS[i % CARRIERS.length],
  destination: 'Netherlands',
  expected_date: day(5 + (i % 170)),
  storage_start_date: day(5 + (i % 170)),
  storage_end_date: day(1 + (i % 170)),
  expected_colli: String(HU_PER_INBOUND * 4),
}));
await insert('InboundAdvice', inbounds);
const adviceIds = manifest.InboundAdvice.slice(-N);
console.log(`inbounds ${N}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const lines = adviceIds.flatMap((id, i) =>
  [1, 2, 3].map((n) => ({ inbound_advice_id: id, customer_id: inbounds[i].customer_id, warehouse_id: inbounds[i].warehouse_id, line_no: String(n), unit: 'Pallet', description: `VOLTEST goods ${n}`, qty: 4, received_qty: 4, weight: 100, length_cm: 120, width_cm: 80, height_cm: 100 }))
);
await insert('InboundLine', lines);
const lineIds = manifest.InboundLine.slice(-lines.length);
console.log(`lines ${lines.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const cargo = adviceIds.flatMap((id, i) =>
  Array.from({ length: HU_PER_INBOUND }, (_, k) => ({
    inbound_advice_id: id,
    customer_id: inbounds[i].customer_id,
    warehouse_id: inbounds[i].warehouse_id,
    description: `VOLTEST pallet ${k + 1}`,
    unit: 'Pallet',
    qty: '4',
    received_qty: 4,
    weight: 400,
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    outer_package_no: String(k + 1),
    qr_code: `VOLTEST-${stamp}-${i + 1}-${k + 1}`,
    status: 'Delivered',
  }))
);
await insert('Cargo', cargo);
const cargoIds = manifest.Cargo.slice(-cargo.length);
console.log(`pallets ${cargo.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

await insert('HuLine', cargoIds.map((cid, j) => ({ cargo_id: cid, inbound_line_id: lineIds[Math.floor(j / HU_PER_INBOUND) * 3 + (j % 3)], qty: 4 })));
console.log(`handling unit lines ${cargoIds.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const outbounds = adviceIds.map((id, i) => ({
  reference_number: `VOLTEST ${stamp} OUT ${i + 1}`,
  outbound_reference: `OB-VOL-${stamp}-${pad(i + 1, 4)}`,
  status: 'Delivered',
  customer_id: inbounds[i].customer_id,
  warehouse_id: inbounds[i].warehouse_id,
  transporter_id: CARRIERS[i % CARRIERS.length],
  requested_date: day(1 + (i % 160)),
  driver_name: 'Volume Driver',
  vehicle_plate: `VOL-${pad(i % 100)}`,
}));
await insert('OutboundRequest', outbounds);
const outboundIds = manifest.OutboundRequest.slice(-N);
console.log(`outbounds ${N}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

await insert('PickTask', cargoIds.map((cid, j) => ({ cargo_id: cid, outbound_request_id: outboundIds[Math.floor(j / HU_PER_INBOUND)], status: 'Picked', assigned_to: 'volume@test' })));
console.log(`pick lines ${cargoIds.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log('done; ids recorded in', MANIFEST);
await browser.close();
