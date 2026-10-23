// Removes exactly the rows recorded by seed.mjs (children first), then clears the manifest.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openSession, MANIFEST } from './common.mjs';

if (!existsSync(MANIFEST)) {
  console.log('Nothing to clean: no manifest.');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const { browser, call } = await openSession();
for (const table of ['PickTask', 'HuLine', 'Cargo', 'OutboundRequest', 'InboundLine', 'InboundAdvice']) {
  const ids = manifest[table] || [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await call('DELETE', `/table/${table}/row?ids=${ids.slice(i, i + 100).join(',')}`);
    if (r.status !== 200) throw new Error(`${table} delete failed: ${r.status} ${String(r.text).slice(0, 300)}`);
  }
  console.log(`${table}: ${ids.length} removed`);
  manifest[table] = [];
  writeFileSync(MANIFEST, JSON.stringify(manifest));
}
await browser.close();
