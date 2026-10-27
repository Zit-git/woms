import { test, expect } from '@playwright/test';
import { apiHeaders } from '../src/lib/apiHeaders.js';

// Not signed in, on whichever address WOMS_URL points at: a request built with the app's own headers must reach the
// Catalyst service (it answers 401 "authentication failed", as JSON). If it gets the app's page back instead (200 HTML
// for a read) or "method not valid", the address is not passing /baas/ requests on, which is exactly how the Slate
// sign-in broke. Run it against Slate after every push:  WOMS_URL=https://<slate address>/ npx playwright test routing
test.use({ storageState: { cookies: [], origins: [] } });

test('requests built with the app\'s headers reach the Catalyst service on this address', async ({ page, baseURL }) => {
  await page.goto(baseURL); // gives the page its CSRF cookie
  await expect(page.locator('body')).toBeVisible();
  const project = await page.evaluate(async () => {
    const t = await (await fetch('/__catalyst/sdk/init.js')).text();
    return /project_Id\s*:\s*"(\d+)"/.exec(t)?.[1];
  });
  expect(project).toBeTruthy();
  const csrf = await page.evaluate(() => (/(?:^|;\s*)ZD_CSRF_TOKEN=([^;]+)/.exec(document.cookie) || [])[1] || '');
  // distinct row limits: a reply that is wrong is cached per address, so never reuse the addresses the app itself uses
  const unique = 120 + Math.floor(Math.random() * 170);
  const reads = [`/baas/v1/project/${project}/table/Warehouses/row?max_rows=${unique}`, `/baas/v1/project/${project}/table/Customers/row?max_rows=${unique + 1}`];
  for (const path of reads) {
    const r = await page.evaluate(async ({ path, headers }) => {
      const res = await fetch(path, { credentials: 'include', headers });
      return { status: res.status, type: res.headers.get('content-type') || '', start: (await res.text()).slice(0, 40) };
    }, { path, headers: apiHeaders(csrf) });
    expect(r.type, `${path} came back as ${r.status} ${r.start}: not the Catalyst service`).toContain('json');
    expect(r.status).toBe(401); // not signed in: the service itself said so
  }
});
