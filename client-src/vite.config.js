import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default build (used by Slate, and by `npm run build`) serves from the
// app's own root. `npm run build:webclient` reproduces the old Catalyst
// static Web Client layout (served under /app/, output copied to ../client)
// for the fallback deployment path.
const isWebClientBuild = process.env.BUILD_TARGET === 'webclient';

export default defineConfig({
  base: isWebClientBuild ? '/app/' : '/',
  plugins: [react()],
  build: isWebClientBuild
    ? { outDir: '../client', emptyOutDir: true }
    : {},
});
