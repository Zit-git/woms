// Renders the home-screen icons (same warehouse glyph as the app's brand) with the Chromium that Playwright ships.
// Run once after changing the design: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';

const glyph = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#10192b"/>
  <g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="none" stroke="#2dd4bf" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/>
  </g>
</svg>`;

const browser = await chromium.launch();
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${glyph(size)}</body>`);
  await page.screenshot({ path: `public/icons/${file}` });
  await page.close();
}
await browser.close();
console.log('Icons written to public/icons/');
