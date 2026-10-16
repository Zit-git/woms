// One-time (and whenever the session expires): opens a real browser, YOU sign in,
// and the signed-in session is saved to e2e/.auth/state.json for the tests to reuse.
// This script never types or stores a password.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = (process.env.WOMS_URL || 'https://woms-775318997.development.catalystserverless.com/app/').replace(/\/?$/, '/');
// WOMS_SESSION chooses the file, so a second user (e.g. a warehouse-limited one) gets a session of their own.
const SESSION = process.env.WOMS_SESSION || 'e2e/.auth/state.json';
const WAIT_MS = 10 * 60 * 1000;
mkdirSync('e2e/.auth', { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(BASE_URL).catch(() => {});

let closed = false;
browser.on('disconnected', () => {
  closed = true;
});

console.log(`
A browser window opened at ${BASE_URL}
 1. Click "Sign in" and sign in there yourself (the page can take a few seconds to load).
 2. Wait until you see the WOMS home screen ("Welcome, ...").
 3. DO NOT close the window: it closes by itself and this terminal then says "Saved".
(Waiting up to 10 minutes.)
`);

const started = Date.now();
let saved = false;
while (!closed && Date.now() - started < WAIT_MS) {
  for (const p of context.pages()) {
    try {
      if (await p.getByRole('heading', { name: /^Welcome/ }).isVisible()) {
        await context.storageState({ path: SESSION });
        saved = true;
        break;
      }
    } catch {
      // page is navigating or was closed; keep waiting
    }
  }
  if (saved) break;
  await new Promise((r) => setTimeout(r, 1000));
}

if (saved) {
  console.log(`Saved ${SESSION}. You can run the tests now: npm run e2e`);
  await browser.close();
} else if (closed) {
  console.log('The window was closed before the home screen appeared, so nothing was saved. Run it again and leave the window open until it says "Saved".');
  process.exitCode = 1;
} else {
  console.log('Timed out waiting for the home screen; nothing was saved.');
  await browser.close();
  process.exitCode = 1;
}
