// The Catalyst Web SDK's init.js appends a legacy "/app/" prefix to
// redirects whenever client-package.json's login_redirect/homepage don't
// start with "/" -- which 404s on Slate (root-served) even though it's
// exactly right for the legacy Web Client Hosting build (served under
// /app/). Vite copies public/client-package.json verbatim into both
// builds, so this patches the Slate build's copy after the fact rather
// than keeping two near-duplicate source files in sync by hand.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../dist/client-package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(path, 'utf8'));
pkg.homepage = '/';
pkg.login_redirect = '/';
writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log('Patched dist/client-package.json for root-served (Slate) redirects.');
