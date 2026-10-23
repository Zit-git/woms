// Shared by the volume seed and cleanup scripts: runs inside the signed-in browser session
// (the same route the app itself uses) so no credentials or keys are involved.
import { chromium } from '@playwright/test';

export const PROJECT = '11648000001127001';
export const BASE_URL = (process.env.WOMS_URL || 'https://woms-775318997.development.catalystserverless.com/app/').replace(/\/?$/, '/');
export const SESSION = process.env.WOMS_SESSION || 'e2e/.auth/state.json';
export const MANIFEST = 'e2e/.volume/manifest.json';

// Row ids are 17 digits: JSON numbers lose precision, so ids are always taken from the raw text.
export const rowIds = (text) => [...String(text).matchAll(/"ROWID"\s*:\s*"?(\d+)"?/g)].map((m) => m[1]);

export async function openSession() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: SESSION });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.getByRole('heading', { name: /^Welcome/ }).waitFor({ timeout: 60_000 });
  // table API of the signed-in session, with the CSRF token the SDK itself sends
  const call = (method, path, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const csrf = (document.cookie.match(/ZD_CSRF_TOKEN=([^;]+)/) || [])[1];
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-ZCSRF-TOKEN': `zd_csrparam=${csrf}` } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        return { status: res.status, json, text };
      },
      { method, url: `/baas/v1/project/${PROJECT}${path}`, body }
    );
  return { browser, page, call };
}

// ---- small helpers for tests that need exact records in the database (concurrency tests) ----
export async function queryRows(call, sql) {
  const r = await call('POST', '/query', { query: sql });
  if (r.status !== 200) throw new Error(`query failed: ${r.status} ${String(r.text).slice(0, 200)}`);
  return r.json?.data || r.json?.content || []; // rows keyed by table, as the query returns them
}
export async function insertRows(call, table, rows) {
  const r = await call('POST', `/table/${table}/row`, rows);
  const ids = rowIds(r.text);
  if (r.status !== 200 || ids.length !== rows.length) throw new Error(`${table} insert failed: ${r.status} ${String(r.text).slice(0, 300)}`);
  return ids;
}
export async function deleteRows(call, table, ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const r = await call('DELETE', `/table/${table}/row?ids=${ids.slice(i, i + 100).join(',')}`);
    if (r.status !== 200) throw new Error(`${table} delete failed: ${r.status} ${String(r.text).slice(0, 300)}`);
  }
}
