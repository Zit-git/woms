import { describe, it, expect } from 'vitest';
import { computeCapacity, projectAvailability } from '../capacity';
import { allocateLocations, recommendWarehouses, putawayConflicts } from '../allocation';

// Scenarios C1-C9 of docs/TEST_PLAN.md, run against the capacity and allocation engines with small
// hand-made warehouses so every expected number can be checked by eye.
const PALLET_TYPES = [{ name: 'Pallet', capacity_unit: 'Pallet position', units_per_item: 1 }];
const loc = (id, extra = {}) => ({ ROWID: String(id), location_code: `L${id}`, warehouse_id: 'W1', capacity: 1, capacity_unit: 'Pallet position', ...extra });
const pallet = (id, extra = {}) => ({ ROWID: String(id), unit: 'Pallet', weight: 100, length_cm: 120, width_cm: 80, height_cm: 100, customer_id: 'A', warehouse_id: 'W1', ...extra });
const run = (o) => allocateLocations({ packageTypes: PALLET_TYPES, customerId: 'A', storageStart: '2026-11-01', storageEnd: '2026-11-30', allCargo: [], outboundCommitments: [], ...o });
const placed = (r) => r.filter((x) => x.locationId).length;

describe('C1 exactly the free capacity / one more', () => {
  const locations = [loc(1), loc(2), loc(3)];
  it('three pallets fit three positions', () => {
    expect(placed(run({ cargoRows: [pallet(1), pallet(2), pallet(3)], locations }))).toBe(3);
  });
  it('a fourth pallet does not fit and is reported, not dropped', () => {
    const r = run({ cargoRows: [pallet(1), pallet(2), pallet(3), pallet(4)], locations });
    expect(placed(r)).toBe(3);
    expect(r).toHaveLength(4);
    expect(r[3].locationId).toBeNull();
  });
  it('no two pallets get the same single-position location', () => {
    const ids = run({ cargoRows: [pallet(1), pallet(2), pallet(3)], locations }).map((r) => r.locationId);
    expect(new Set(ids).size).toBe(3);
  });
  it('a position that takes 2 units of capacity is full after one item', () => {
    const types = [{ name: 'Pallet', capacity_unit: 'Pallet position', units_per_item: 2 }];
    const r = allocateLocations({ cargoRows: [pallet(1), pallet(2)], locations: [loc(1, { capacity: 3 })], allCargo: [], packageTypes: types, customerId: 'A' });
    expect(placed(r)).toBe(1);
  });
});

describe('C2 two accepted inbounds on overlapping days', () => {
  const reserved = { ...pallet(90), current_location_id: null, reserved_location_id: '1', inbound_advice_id: 'IN-A', inbound_status: 'Confirmed', storage_start_date: '2026-11-01', storage_end_date: '2026-11-30' };
  it('the second inbound cannot take the position the first reserved', () => {
    const r = run({ cargoRows: [pallet(1)], locations: [loc(1), loc(2)], allCargo: [reserved] });
    expect(r[0].locationId).toBe('2');
  });
  it('it can take it once the first inbound\'s storage period is over', () => {
    const r = run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [reserved], storageStart: '2026-12-05', storageEnd: '2026-12-31' });
    expect(r[0].locationId).toBe('1');
  });
  it('editing the first inbound itself does not make it compete with its own reservation', () => {
    const r = run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [reserved], excludeAdviceId: 'IN-A' });
    expect(r[0].locationId).toBe('1');
  });
  it('an open-ended reservation blocks every later date', () => {
    const open = { ...reserved, storage_end_date: null };
    const r = run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [open], storageStart: '2027-06-01', storageEnd: '2027-06-30' });
    expect(r[0].locationId).toBeNull();
  });
  it('the capacity view counts the confirmed inbound as committed and lowers what is available', () => {
    const cap = computeCapacity({ locations: [loc(1), loc(2), loc(3)], cargoRows: [reserved], outboundCommitments: [], packageTypes: PALLET_TYPES });
    expect(cap.totals).toMatchObject({ total: 3, committed: 1, occupied: 0, available: 2 });
  });
});

describe('C3 space frees up on the dispatch date', () => {
  const stored = { ...pallet(80), current_location_id: '1', inbound_status: 'Put Away' };
  const leaves = (date) => [{ cargo_id: '80', requested_date: date, warehouse_id: 'W1' }];
  it('a new request starting after the scheduled dispatch can use the position', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], outboundCommitments: leaves('2026-10-20'), storageStart: '2026-10-21' })[0].locationId).toBe('1');
  });
  it('the dispatch day itself counts as free', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], outboundCommitments: leaves('2026-10-20'), storageStart: '2026-10-20' })[0].locationId).toBe('1');
  });
  it('a request starting before the dispatch is refused', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], outboundCommitments: leaves('2026-10-20'), storageStart: '2026-10-19' })[0].locationId).toBeNull();
  });
  it('goods with no dispatch scheduled keep blocking', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], storageStart: '2027-01-01' })[0].locationId).toBeNull();
  });
});

describe('C4 weight and size limits', () => {
  it('an item heavier than the location\'s limit is refused, a lighter one accepted', () => {
    const l = [loc(1, { max_weight_kg: 100 })];
    expect(run({ cargoRows: [pallet(1, { weight: 150 })], locations: l })[0].locationId).toBeNull();
    expect(run({ cargoRows: [pallet(1, { weight: 80 })], locations: l })[0].locationId).toBe('1');
  });
  it('two items together may not exceed the limit even though each fits', () => {
    const l = [loc(1, { capacity: 2, max_weight_kg: 100 })];
    const r = run({ cargoRows: [pallet(1, { weight: 60 }), pallet(2, { weight: 60 })], locations: l });
    expect(placed(r)).toBe(1);
  });
  it('an item taller than the location is refused; one that fits when turned is accepted', () => {
    const l = [loc(1, { length_cm: 100, width_cm: 100, height_cm: 100 })];
    expect(run({ cargoRows: [pallet(1, { length_cm: 50, width_cm: 50, height_cm: 120 })], locations: l })[0].locationId).toBeNull();
    expect(run({ cargoRows: [pallet(1, { length_cm: 100, width_cm: 50, height_cm: 90 })], locations: l })[0].locationId).toBe('1');
  });
  it('total volume is a limit as well as the single item\'s size', () => {
    const l = [loc(1, { capacity: 2, length_cm: 120, width_cm: 100, height_cm: 100 })]; // 1.2 m3
    const r = run({ cargoRows: [pallet(1, { length_cm: 100, width_cm: 100, height_cm: 70 }), pallet(2, { length_cm: 100, width_cm: 100, height_cm: 70 })], locations: l });
    expect(placed(r)).toBe(1); // 0.7 + 0.7 > 1.2
  });
  it('a blocked location is never used', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1, { occupancy_status: 'Blocked' })] })[0].locationId).toBeNull();
  });
  it('cartons are not put on pallet positions (capacity units differ)', () => {
    const types = [...PALLET_TYPES, { name: 'Carton', capacity_unit: 'Shelf slot', units_per_item: 1 }];
    const r = allocateLocations({ cargoRows: [pallet(1, { unit: 'Carton' })], locations: [loc(1)], allCargo: [], packageTypes: types, customerId: 'A' });
    expect(r[0].locationId).toBeNull();
  });
});

describe('C5 one customer per location', () => {
  const holdsA = { ...pallet(70), current_location_id: '1', customer_id: 'A', inbound_status: 'Put Away' };
  it('customer B is not offered a location that holds customer A\'s goods, even with room left', () => {
    const r = run({ cargoRows: [pallet(1, { customer_id: 'B' })], customerId: 'B', locations: [loc(1, { capacity: 2 })], allCargo: [holdsA] });
    expect(r[0].locationId).toBeNull();
  });
  it('customer A may share the rest of it', () => {
    const r = run({ cargoRows: [pallet(1)], locations: [loc(1, { capacity: 2 })], allCargo: [holdsA] });
    expect(r[0].locationId).toBe('1');
  });
  it('B gets the next empty location instead', () => {
    const r = run({ cargoRows: [pallet(1, { customer_id: 'B' })], customerId: 'B', locations: [loc(1, { capacity: 2 }), loc(2)], allCargo: [holdsA] });
    expect(r[0].locationId).toBe('2');
  });
  it('one request never mixes: the first item claims an empty location for its customer', () => {
    const r = run({ cargoRows: [pallet(1), pallet(2)], locations: [loc(1, { capacity: 2 })] });
    expect(placed(r)).toBe(2);
  });
  it('the capacity view leaves a location with room but another owner out of the unclaimed figure', () => {
    const cap = computeCapacity({ locations: [loc(1, { capacity: 2 }), loc(2, { capacity: 2 })], cargoRows: [holdsA], outboundCommitments: [], packageTypes: PALLET_TYPES });
    expect(cap.totals).toMatchObject({ total: 4, occupied: 1, available: 3, unclaimedTotal: 2, unclaimedAvailable: 2 });
  });
});

describe('C6 goods received but not yet put away', () => {
  const dock = { ...pallet(60), current_location_id: null, inbound_status: 'Received', inbound_advice_id: 'IN-B' };
  const confirmed = { ...pallet(61), current_location_id: null, inbound_status: 'Confirmed', inbound_advice_id: 'IN-C' };
  it('is shown as backlog', () => {
    const cap = computeCapacity({ locations: [loc(1), loc(2)], cargoRows: [dock], outboundCommitments: [], packageTypes: PALLET_TYPES });
    expect(cap.pendingPutaway).toBe(1);
  });
  it('a confirmed, not yet arrived inbound is committed, not backlog', () => {
    const cap = computeCapacity({ locations: [loc(1), loc(2)], cargoRows: [confirmed], outboundCommitments: [], packageTypes: PALLET_TYPES });
    expect(cap.pendingPutaway).toBe(0);
    expect(cap.totals.committed).toBe(1);
  });
  it('goods on the dock still need a position: free space does not grow when they arrive', () => {
    const before = computeCapacity({ locations: [loc(1), loc(2)], cargoRows: [confirmed], outboundCommitments: [], packageTypes: PALLET_TYPES }).totals.available;
    const after = computeCapacity({ locations: [loc(1), loc(2)], cargoRows: [dock], outboundCommitments: [], packageTypes: PALLET_TYPES }).totals.available;
    expect(after).toBe(before);
  });
});

describe('C7 dispatch lowers occupancy', () => {
  const stored = { ...pallet(50), current_location_id: '1', inbound_status: 'Put Away' };
  const out = [{ cargo_id: '50', requested_date: '2026-11-10', warehouse_id: 'W1' }];
  const args = { locations: [loc(1), loc(2)], cargoRows: [stored], outboundCommitments: out, packageTypes: PALLET_TYPES };
  it('today it is still occupied', () => expect(computeCapacity(args).totals.occupied).toBe(1));
  it('before the dispatch date it is still occupied', () => expect(computeCapacity({ ...args, asOfDate: '2026-11-09' }).totals.occupied).toBe(1));
  it('on the dispatch date the space is free again', () => {
    const c = computeCapacity({ ...args, asOfDate: '2026-11-10' });
    expect(c.totals).toMatchObject({ occupied: 0, available: 2 });
  });
  it('once the goods have left (no location), nothing is occupied', () => {
    expect(computeCapacity({ ...args, cargoRows: [{ ...stored, current_location_id: null, inbound_status: 'Dispatched' }] }).totals.occupied).toBe(0);
  });
  it('weight and space follow', () => {
    const l = [loc(1, { max_weight_kg: 1000, length_cm: 120, width_cm: 100, height_cm: 120 })];
    const now = computeCapacity({ ...args, locations: l });
    const later = computeCapacity({ ...args, locations: l, asOfDate: '2026-11-10' });
    expect(now.weight.occupied).toBe(100);
    expect(later.weight.occupied).toBe(0);
    expect(later.space.occupied).toBe(0);
  });
  it('projectAvailability gives one rising row per day', () => {
    const rows = projectAvailability({ ...args, dates: ['2026-11-09', '2026-11-10', '2026-11-11'] });
    expect(rows.map((r) => r.totals.occupied)).toEqual([1, 0, 0]);
  });
});

describe('C8/C9 warehouses', () => {
  const locations = [loc(1), loc(2), loc(3, { warehouse_id: 'W2' })];
  const cargoRows = [{ ...pallet(40), current_location_id: '1' }, { ...pallet(41, { warehouse_id: 'W2' }), current_location_id: '3' }];
  const calc = (warehouseId) => computeCapacity({ locations, cargoRows, outboundCommitments: [], packageTypes: PALLET_TYPES, warehouseId });
  it('each warehouse sees only its own figures', () => {
    expect(calc('W1').totals).toMatchObject({ total: 2, occupied: 1, available: 1 });
    expect(calc('W2').totals).toMatchObject({ total: 1, occupied: 1, available: 0 });
  });
  it('the consolidated view equals the sum of the warehouses', () => {
    const all = calc(undefined).totals;
    for (const k of ['total', 'occupied', 'committed', 'available']) expect(all[k]).toBe(calc('W1').totals[k] + calc('W2').totals[k]);
  });
  it('recommendWarehouses ranks the warehouse that can fit the most first', () => {
    const ranked = recommendWarehouses({
      warehouses: [{ ROWID: 'W2' }, { ROWID: 'W1' }],
      cargoRows: [pallet(1), pallet(2)],
      allLocations: [loc(1), loc(2), loc(3, { warehouse_id: 'W2' })],
      allCargo: [],
      packageTypes: PALLET_TYPES,
      customerId: 'A',
      storageStart: '2026-11-01',
      storageEnd: '2026-11-30',
    });
    expect(ranked.map((r) => [r.warehouse.ROWID, r.fitCount])).toEqual([['W1', 2], ['W2', 1]]);
  });
});

describe('put-away is physical: what is in a location right now occupies it', () => {
  const stored = { ...pallet(30), current_location_id: '1', inbound_status: 'Put Away' };
  const leavesToday = [{ cargo_id: '30', requested_date: '2026-11-01', warehouse_id: 'W1' }];
  it('planning ahead: a pallet due out before the new storage starts frees its position', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], outboundCommitments: leavesToday, storageStart: '2026-11-01' })[0].locationId).toBe('1');
  });
  it('putting away now: the same pallet, still there, blocks the position (no commitments assumed)', () => {
    expect(run({ cargoRows: [pallet(1)], locations: [loc(1)], allCargo: [stored], outboundCommitments: [], storageStart: '2026-11-01' })[0].locationId).toBeNull();
  });
});

describe('putawayConflicts (the last check before storing)', () => {
  const stored = { ...pallet(30), current_location_id: '1' };
  const check = (placements, o = {}) => putawayConflicts({ placements, locations: [loc(1), loc(2), loc(3, { occupancy_status: 'Blocked' })], allCargo: [stored], packageTypes: PALLET_TYPES, customerId: 'A', ...o });
  it('an empty position is fine', () => expect(check([{ cargo: pallet(1), locationId: '2' }])).toEqual([]));
  it('a position that is already full is refused', () => expect(check([{ cargo: pallet(1), locationId: '1' }])).toEqual(['L1 is already full.']));
  it('two pallets into one single position: the second is refused', () => {
    expect(check([{ cargo: pallet(1), locationId: '2' }, { cargo: pallet(2), locationId: '2' }])).toEqual(['L2 is already full.']);
  });
  it('another customer\'s goods in the position are refused even when there is room', () => {
    const roomy = [loc(1, { capacity: 4 })];
    expect(putawayConflicts({ placements: [{ cargo: pallet(1, { customer_id: 'B' }), locationId: '1' }], locations: roomy, allCargo: [stored], packageTypes: PALLET_TYPES, customerId: 'B' })).toEqual(["L1 holds another customer's goods."]);
  });
  it('the same customer may share a position with room', () => {
    expect(putawayConflicts({ placements: [{ cargo: pallet(1), locationId: '1' }], locations: [loc(1, { capacity: 4 })], allCargo: [stored], packageTypes: PALLET_TYPES, customerId: 'A' })).toEqual([]);
  });
  it('a blocked position is refused', () => expect(check([{ cargo: pallet(1), locationId: '3' }])).toContain('L3 is blocked.'));
  it('cartons of 0.1 position each fit ten to a position, the eleventh does not', () => {
    const types = [{ name: 'Carton', capacity_unit: 'Pallet position', units_per_item: 0.1 }];
    const cartons = Array.from({ length: 11 }, (_, i) => ({ cargo: pallet(i + 100, { unit: 'Carton' }), locationId: '2' }));
    expect(putawayConflicts({ placements: cartons, locations: [loc(2)], allCargo: [], packageTypes: types, customerId: 'A' })).toEqual(['L2 is already full.']);
    expect(putawayConflicts({ placements: cartons.slice(0, 10), locations: [loc(2)], allCargo: [], packageTypes: types, customerId: 'A' })).toEqual([]);
  });
});
