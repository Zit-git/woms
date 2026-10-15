import { describe, it, expect, beforeEach } from 'vitest';
import { addDays, todayStr } from '../dates';
import { validateRequestDates, colliMismatch, totalPackages } from '../inboundValidation';
import { canApproveIn, canAccessWarehouse, scopeByWarehouse } from '../access';
import { expandLines } from '../capacity';
import { visibilityClause } from '../api';
import { getAllRows } from '../catalystClient';

describe('dates', () => {
  it('addDays moves forward one calendar day in any timezone (it used to return the same date in India)', () => {
    process.env.TZ = 'Asia/Kolkata';
    expect(addDays('2026-10-13', 1)).toBe('2026-10-14');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-13', 0)).toBe('2026-10-13');
  });
  it('builds a range with distinct rising dates', () => {
    const out = [];
    for (let d = '2026-10-13', i = 0; d <= '2026-10-19' && i < 60; d = addDays(d, 1), i += 1) out.push(d);
    expect(new Set(out).size).toBe(7);
  });
});

describe('inbound validation', () => {
  const today = todayStr();
  it('refuses an arrival in the past and a storage period that ends before it starts', () => {
    expect(validateRequestDates({ expected_date: addDays(today, -1) }).expected_date).toBeTruthy();
    expect(validateRequestDates({ expected_date: addDays(today, 1), storage_start_date: addDays(today, 2), storage_end_date: addDays(today, 1) }).storage_end_date).toBeTruthy();
  });
  it('refuses storage that starts before the goods arrive', () => {
    expect(validateRequestDates({ expected_date: addDays(today, 5), storage_start_date: addDays(today, 4) }).storage_start_date).toBeTruthy();
  });
  it('accepts a sensible request', () => {
    expect(validateRequestDates({ expected_date: addDays(today, 1), storage_start_date: addDays(today, 1), storage_end_date: addDays(today, 30) })).toEqual({});
  });
  it('Expected Colli must equal the packages on the lines', () => {
    const lines = [{ qty: 40 }, { qty: 20 }, { qty: 10 }];
    expect(totalPackages(lines)).toBe(70);
    expect(colliMismatch(70, lines)).toBeNull();
    expect(colliMismatch(60, lines)).toMatch(/add up to 70/);
  });
});

describe('warehouse access', () => {
  const viewer = { isAdmin: false, email: 'u@x.com', assignments: [{ warehouseId: '11', role: 'Warehouse Manager' }, { warehouseId: '22', role: 'Warehouse Operator' }] };
  it('role is per warehouse', () => {
    expect(canApproveIn(viewer, '11')).toBe(true);
    expect(canApproveIn(viewer, '22')).toBe(false);
    expect(canAccessWarehouse(viewer, '33')).toBe(false);
    expect(canAccessWarehouse(viewer, null)).toBe(false); // unassigned records are admin-only
    expect(canAccessWarehouse({ isAdmin: true, assignments: [] }, null)).toBe(true);
  });
  it('scopes capacity rows to the user\'s warehouses', () => {
    const rows = [{ warehouse_id: '11' }, { warehouse_id: '22' }, { warehouse_id: '33' }, { warehouse_id: null }];
    expect(scopeByWarehouse(viewer, rows).map((r) => r.warehouse_id)).toEqual(['11', '22']);
  });
});

describe('visibilityClause', () => {
  const cols = { warehouseCol: 'X.warehouse_id', assignedCol: 'X.assigned_to' };
  it('admin sees everything', () => expect(visibilityClause({ isAdmin: true, assignments: [] }, cols)).toBe(''));
  it('manager sees her warehouse; operator only own rows in his', () => {
    const v = { email: "o'x@b.c", assignments: [{ warehouseId: '11', role: 'Warehouse Manager' }, { warehouseId: '22', role: 'Warehouse Operator' }] };
    expect(visibilityClause(v, cols)).toBe(" AND ((X.warehouse_id = 11) OR (X.warehouse_id = 22 AND X.assigned_to = 'o''x@b.c'))");
  });
  it('fails closed with no assignment or no viewer', () => {
    expect(visibilityClause({ assignments: [] }, cols)).toBe(' AND 1 = 0');
    expect(visibilityClause(undefined, cols)).toBe(' AND 1 = 0');
  });
});

describe('capacity', () => {
  it('expands a line of N packages into N rows', () => {
    expect(expandLines([{ ROWID: '1', qty: 3 }])).toHaveLength(3);
    expect(expandLines([{ ROWID: '1', qty: 0 }])).toHaveLength(0);
  });
});

describe('getAllRows (sign-in loads the role list with 500 rows; Catalyst allows 300)', () => {
  let requested;
  const stub = (response) => {
    requested = null;
    globalThis.window = { catalyst: { table: { tableId: () => ({ getPagedRows: (opts) => { requested = opts; return Promise.resolve(response); } }) } } };
  };
  beforeEach(() => { delete globalThis.window; });
  it('never asks for more than 300 rows', async () => {
    stub({ status: 200, content: [{ ROWID: '1' }] });
    await getAllRows('Customers', 500);
    expect(requested.max_rows).toBe(300);
  });
  it('turns an error response into a readable error instead of crashing', async () => {
    stub({ status: 400, message: 'max_rows too large' });
    await expect(getAllRows('Transporters', 200)).rejects.toThrow(/max_rows too large/);
  });
  it('never hands back a non-array', async () => {
    stub({ status: 200, content: { error: 'x' } });
    expect(await getAllRows('Suppliers', 200)).toEqual([]);
  });
});

describe('identical simultaneous queries share one request', () => {
  it('sends one request for N identical zcql calls made at the same time', async () => {
    const { zcql } = await import('../catalystClient');
    let sent = 0;
    globalThis.window = {
      catalyst: { ZCatalystQL: { executeQuery: () => { sent += 1; return new Promise((r) => setTimeout(() => r({ status: 200, content: [{ T: { a: 1 } }] }), 20)); } } },
    };
    const results = await Promise.all([zcql('SELECT a FROM T'), zcql('SELECT a FROM T'), zcql('SELECT a FROM T'), zcql('SELECT b FROM T')]);
    expect(sent).toBe(2); // the three identical ones shared one request
    results.forEach((r) => expect(r).toEqual([{ T: { a: 1 } }]));
    results[0].push('mutated'); // each caller gets its own array
    expect(results[1]).toHaveLength(1);
  });
});
