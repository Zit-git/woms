// One-time (and whenever the session expires): opens a real browser, YOU sign in,
// and the signed-in session is saved to e2e/.auth/state.json for the tests to reuse.
// This script never types or stores a password.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = (process.env.WOMS_URL || 'https://woms-775318997.development.catalystserverless.com/app/').replace(/\/?$/, '/');
mkdirSync('e2e/.auth', { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(BASE_URL);
console.log(`\nSign in in the browser window that just opened (${BASE_URL}).\nThe session is saved automatically once the home screen appears (waiting up to 5 minutes)...\n`);
await page.getByRole('heading', { name: /^Welcome/ }).waitFor({ timeout: 5 * 60 * 1000 });
await context.storageState({ path: 'e2e/.auth/state.json' });
console.log('Saved e2e/.auth/state.json. You can close this window; the tests can run now.');
await browser.close();
