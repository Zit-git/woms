import { describe, it, expect } from 'vitest';
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

// The app talks to the data service directly (see catalystClient.js). These tests stand in for the network:
// a fake `fetch` answers like the real service and records what was asked.
function fakeNetwork(handler) {
  const asked = [];
  globalThis.window = { location: { origin: 'https://site.test' } };
  globalThis.document = { cookie: 'a=1; ZD_CSRF_TOKEN=csrf-123; b=2' };
  globalThis.fetch = async (url, opts = {}) => {
    asked.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (String(url).includes('/__catalyst/sdk/init.js')) {
      return { ok: true, status: 200, text: async () => 'catalyst.initApp({ project_Id : "999", zaid : "888", auth_domain : "https://auth.test" })' };
    }
    const out = handler(String(url), opts) || {};
    const status = out.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? { status: 'success', data: [] })), json: async () => out.body };
  };
  return asked;
}

describe('getAllRows (sign-in loads the role list with 500 rows; Catalyst allows 300)', () => {
  it('never asks for more than 300 rows', async () => {
    const asked = fakeNetwork(() => ({ body: { status: 'success', data: [{ ROWID: '1' }] } }));
    await getAllRows('Customers', 500);
    expect(asked.find((a) => a.url.includes('/table/Customers/row')).url).toContain('max_rows=300');
  });
  it('turns an error response into a readable error instead of crashing', async () => {
    fakeNetwork(() => ({ status: 400, body: { status: 'failure', data: { message: 'max_rows too large' } } }));
    await expect(getAllRows('Transporters', 200)).rejects.toThrow(/max_rows too large/);
  });
  it('never hands back a non-array', async () => {
    fakeNetwork(() => ({ body: { status: 'success', data: { error: 'x' } } }));
    expect(await getAllRows('Suppliers', 200)).toEqual([]);
  });
});

describe('the data service is called directly, with the session', () => {
  it('uses the project from the SDK init script and sends the CSRF token from the cookie', async () => {
    const asked = fakeNetwork(() => ({ body: { status: 'success', data: [{ ROWID: '7' }] } }));
    const { updateRow } = await import('../catalystClient');
    await updateRow('InboundLine', { ROWID: '7', qty: 4 });
    const put = asked.find((a) => a.method === 'PUT');
    expect(put.url).toBe('/baas/v1/project/999/table/InboundLine/row');
    expect(put.headers['X-ZCSRF-TOKEN']).toBe('zd_csrparam=csrf-123');
    expect(put.body).toEqual([{ ROWID: '7', qty: 4 }]);
  });
  it('an id sent as a bare 17-digit number is kept exact (a browser would change its last digit)', async () => {
    const { addRow } = await import('../catalystClient');
    fakeNetwork(() => ({ body: '{"status":"success","data":[{"ROWID":11648000001245061,"customer_id":11648000001228002,"name":"x"}]}' }));
    const row = await addRow('Customers', { name: 'x' });
    expect(row.ROWID).toBe('11648000001245061');
    expect(row.customer_id).toBe('11648000001228002');
  });
  it('text inside a value is never altered, even when it looks like an id', async () => {
    const { parseReply } = await import('../catalystClient');
    const reply = parseReply('{"data":[{"description":"ref \\"ROWID\\":11648000001245061, ok","ROWID":"1"}]}');
    expect(reply.data[0].description).toBe('ref "ROWID":11648000001245061, ok');
  });
  it('a failed save says why, in words, and does not look like success', async () => {
    const { updateRow } = await import('../catalystClient');
    fakeNetwork(() => ({ status: 400, body: { status: 'failure', data: { message: 'No such Table with the given name exists.' } } }));
    await expect(updateRow('Nowhere', { ROWID: '1' })).rejects.toThrow(/No such Table/);
    fakeNetwork(() => ({ status: 401, body: { status: 'failure', data: {} } }));
    await expect(updateRow('Customers', { ROWID: '1' })).rejects.toThrow(/sign in again/i);
  });
  it('delete sends only the digits of the id', async () => {
    const { deleteRow } = await import('../catalystClient');
    const asked = fakeNetwork(() => ({ body: { status: 'success', data: [] } }));
    await deleteRow('Cargo', "123'; DROP TABLE x;--456");
    expect(asked.find((a) => a.method === 'DELETE').url).toContain('/table/Cargo/row?ids=123456');
  });
});

describe('calling a function from another address uses a token, without the SDK', () => {
  it('exchanges the project token with the sign-in service, caches it, and sends it without cookies', async () => {
    const { callFunction } = await import('../catalystClient');
    const asked = fakeNetwork((url) => {
      if (url.includes('/authentication/custom-token')) return { body: { status: 'success', data: { client_id: 'cid', jwt_token: 'signed', scopes: 'a,b' } } };
      if (url.startsWith('https://auth.test/clientoauth/v2/888/remote/auth')) return { body: { access_token: 'tok1', expires_in_sec: 3600 } };
      if (url.includes('/server/uploadFile/')) return { body: { ok: true } };
      return { body: { status: 'success', data: [] } };
    });
    globalThis.window.__WOMS_FORCE_TOKEN_ROUTE = true; // as Slate: this address does not serve functions
    // (the module remembers the route it first used, so load a fresh copy)
    const fresh = await import('../catalystClient?token-route');
    await fresh.callFunction('uploadFile', { a: 1 });
    await fresh.callFunction('uploadFile', { a: 2 });
    const exchange = asked.filter((a) => a.url.startsWith('https://auth.test/'));
    expect(exchange).toHaveLength(1); // the second upload reused the token
    expect(exchange[0].url).toContain('response_type=remote_token');
    expect(exchange[0].url).toContain('client_id=cid');
    expect(exchange[0].method).toBe('POST');
    const upload = asked.filter((a) => a.url.includes('/server/uploadFile/'));
    expect(upload).toHaveLength(2);
    expect(upload[0].headers.Authorization).toBe('Zoho-oauthtoken tok1');
    expect(callFunction).toBeTypeOf('function');
  });
});

describe('identical simultaneous queries share one request', () => {
  it('sends one request for N identical zcql calls made at the same time', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeNetwork(() => ({ body: { status: 'success', data: [{ T: { a: 1 } }] } }));
    const results = await Promise.all([zcql('SELECT a FROM T'), zcql('SELECT a FROM T'), zcql('SELECT a FROM T'), zcql('SELECT b FROM T')]);
    expect(asked.filter((a) => a.url.endsWith('/query'))).toHaveLength(2); // the three identical ones shared one request
    results.forEach((r) => expect(r).toEqual([{ T: { a: 1 } }]));
    results[0].push('mutated'); // each caller gets its own array
    expect(results[1]).toHaveLength(1);
  });
});

describe('queries return every row, not just the first 300', () => {
  const fakeData = (total) =>
    fakeNetwork((url, opts) => {
      const q = JSON.parse(opts.body).query;
      const m = /LIMIT (\d+), (\d+)$/.exec(q);
      const from = m ? Number(m[1]) - 1 : 0;
      const count = m ? Number(m[2]) : 300;
      const rows = Array.from({ length: Math.max(0, Math.min(count, total - from)) }, (_, i) => ({ T: { n: from + i + 1 } }));
      return { body: { status: 'success', data: rows } };
    });
  const queries = (asked) => asked.filter((a) => a.url.endsWith('/query')).map((a) => a.body.query);
  it('a short result is one request', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(12);
    expect(await zcql('SELECT n FROM T ORDER BY n')).toHaveLength(12);
    expect(queries(asked)).toEqual(['SELECT n FROM T ORDER BY n LIMIT 1, 300']);
  });
  it('384 rows come back as 300 + 84, in order, none missing or repeated', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(384);
    const rows = await zcql('SELECT n FROM T2 ORDER BY n');
    expect(rows).toHaveLength(384);
    expect(rows.map((r) => r.T.n)).toEqual(Array.from({ length: 384 }, (_, i) => i + 1));
    expect(queries(asked)).toEqual(['SELECT n FROM T2 ORDER BY n LIMIT 1, 300', 'SELECT n FROM T2 ORDER BY n LIMIT 301, 300']);
  });
  it('exactly 300 rows asks once more to be sure there is no 301st', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(300);
    expect(await zcql('SELECT n FROM T3 ORDER BY n')).toHaveLength(300);
    expect(queries(asked)).toHaveLength(2);
  });
  it('a query with its own LIMIT is left alone', async () => {
    const { zcql } = await import('../catalystClient');
    const asked = fakeData(1000);
    await zcql('SELECT n FROM T4 ORDER BY n LIMIT 1, 5');
    expect(queries(asked)).toEqual(['SELECT n FROM T4 ORDER BY n LIMIT 1, 5']);
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
