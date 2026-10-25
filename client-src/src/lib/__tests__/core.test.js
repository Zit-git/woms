import { describe, it, expect, beforeEach } from 'vitest';
import { addDays, todayStr } from '../dates';
import { validateRequestDates, colliMismatch, totalPackages } from '../inboundValidation';
import { canApproveIn, canAccessWarehouse, scopeByWarehouse } from '../access';
import { expandLines } from '../capacity';
import { visibilityClause } from '../api';
import { getAllRows } from '../catalystClient';
import { applyServerChanges } from '../formSync';
import { newestOnly } from '../latest';
import { fixed2, decimal2 } from '../format';

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

describe('queries return every row, not just the first 300', () => {
  const fakeData = (total) => {
    const asked = [];
    globalThis.window = {
      catalyst: {
        ZCatalystQL: {
          executeQuery: (q) => {
            asked.push(q);
            const m = /LIMIT (\d+), (\d+)$/.exec(q);
            const from = m ? Number(m[1]) - 1 : 0;
            const count = m ? Number(m[2]) : 300;
            const rows = Array.from({ length: Math.max(0, Math.min(count, total - from)) }, (_, i) => ({ T: { n: from + i + 1 } }));
            return Promise.resolve({ status: 200, content: rows });
          },
        },
      },
    };
    return asked;
  };
  it('a short result is one request', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(12);
    expect(await zcql('SELECT n FROM T ORDER BY n')).toHaveLength(12);
    expect(asked).toEqual(['SELECT n FROM T ORDER BY n LIMIT 1, 300']);
  });
  it('384 rows come back as 300 + 84, in order, none missing or repeated', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(384);
    const rows = await zcql('SELECT n FROM T2 ORDER BY n');
    expect(rows).toHaveLength(384);
    expect(rows.map((r) => r.T.n)).toEqual(Array.from({ length: 384 }, (_, i) => i + 1));
    expect(asked).toEqual(['SELECT n FROM T2 ORDER BY n LIMIT 1, 300', 'SELECT n FROM T2 ORDER BY n LIMIT 301, 300']);
  });
  it('exactly 300 rows asks once more to be sure there is no 301st', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(300);
    expect(await zcql('SELECT n FROM T3 ORDER BY n')).toHaveLength(300);
    expect(asked).toHaveLength(2);
  });
  it('a query with its own LIMIT is left alone', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(1000);
    await zcql('SELECT n FROM T4 ORDER BY n LIMIT 1, 5');
    expect(asked).toEqual(['SELECT n FROM T4 ORDER BY n LIMIT 1, 5']);
  });
});

describe('a refresh of the saved record does not wipe what is being typed', () => {
  const saved = { customer: 'A', reference: 'old', expected_colli: null, destination: 'NL' };
  it('keeps an unsaved edit in another field when the record is re-read', () => {
    // the user has typed colli 4 (not saved yet) while the save of the reference comes back
    const form = { ...saved, expected_colli: '4' };
    const next = { ...saved, reference: 'new' };
    expect(applyServerChanges(form, saved, next)).toEqual({ customer: 'A', reference: 'new', expected_colli: '4', destination: 'NL' });
  });
  it('takes over a field that really changed on the server', () => {
    expect(applyServerChanges({ ...saved }, saved, { ...saved, destination: 'DE' }).destination).toBe('DE');
  });
  it('a re-read with nothing new leaves the form exactly as typed', () => {
    const form = { ...saved, reference: 'typing...' };
    expect(applyServerChanges(form, saved, { ...saved })).toEqual(form);
  });
  it('fields that appear or disappear are handled', () => {
    expect(applyServerChanges({ a: 1 }, { a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe('only the newest request fills the screen', () => {
  it('a slow answer for the earlier choice is ignored when it arrives last', () => {
    const r = newestOnly();
    const forDC1 = r.start(); // the first warehouse is asked for ...
    const forDC2 = r.start(); // ... and the user switches before it answers
    expect(r.isNewest(forDC2)).toBe(true); // the DC2 answer arrives first and is shown
    expect(r.isNewest(forDC1)).toBe(false); // the late DC1 answer must not replace it
  });
  it('a single request is always current', () => {
    const r = newestOnly();
    expect(r.isNewest(r.start())).toBe(true);
  });
  it('each use has its own tickets', () => {
    const a = newestOnly();
    const b = newestOnly();
    const t = a.start();
    b.start();
    b.start();
    expect(a.isNewest(t)).toBe(true);
  });
});

describe('decimal values are shown with two digits, rounded', () => {
  it('fixed2 always shows two decimals', () => {
    expect(fixed2(12)).toBe('12.00');
    expect(fixed2(0.384)).toBe('0.38');
    expect(fixed2('11.1')).toBe('11.10');
    expect(fixed2(0)).toBe('0.00');
  });
  it('rounds off rather than cuts off, including the cases binary numbers get wrong', () => {
    expect(fixed2(2.675)).toBe('2.68');
    expect(fixed2(1.005)).toBe('1.01');
    expect(fixed2(0.285)).toBe('0.29');
    expect(fixed2(-1.005)).toBe('-1.01');
    expect(fixed2(0.994)).toBe('0.99');
    expect(fixed2(0.995)).toBe('1.00');
  });
  it('removes floating point noise from sums', () => {
    expect(fixed2(0.1 + 0.2)).toBe('0.30');
    expect(decimal2(0.1 + 0.2)).toBe('0.30');
    expect(decimal2(7.000000000000001)).toBe('7');
    expect(fixed2(7.000000000000001)).toBe('7.00');
  });
  it('never shows minus zero', () => {
    expect(fixed2(-0.001)).toBe('0.00');
  });
  it('decimal2 keeps whole values whole and gives fractions two digits', () => {
    expect(decimal2(228)).toBe('228');
    expect(decimal2('228')).toBe('228');
    expect(decimal2(12.5)).toBe('12.50');
    expect(decimal2(0.1)).toBe('0.10');
    expect(decimal2(40.456)).toBe('40.46');
  });
  it('empty and odd values are handled', () => {
    expect(fixed2(null)).toBe('—');
    expect(fixed2(undefined)).toBe('—');
    expect(decimal2('')).toBe('—');
    expect(decimal2(null, '')).toBe('');
    expect(fixed2('n/a')).toBe('n/a');
  });
});
