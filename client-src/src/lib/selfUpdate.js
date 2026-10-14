// Slate serves the app's HTML with `cache-control: max-age=31536000` (a year), so
// a browser that has visited before keeps running the old JavaScript bundle long
// after a new version is deployed -- fixes appear not to work until someone does
// a hard refresh. This re-fetches the current page bypassing the cache (which also
// refreshes the cached copy) and, if it points at a newer bundle than the one
// running, reloads once so the new version takes over.
const BUNDLE = /\/assets\/(index-[\w-]+\.js)/;

export function reloadIfNewBuildAvailable() {
  const running = [...document.scripts].map((s) => s.src.match(BUNDLE)?.[1]).find(Boolean);
  if (!running) return; // dev server: no hashed bundle

  fetch(window.location.pathname + window.location.search, { cache: 'reload' })
    .then((res) => (res.ok ? res.text() : ''))
    .then((html) => {
      const latest = html.match(BUNDLE)?.[1];
      if (!latest || latest === running) return;
      try {
        // One attempt per new build, so a stale edge copy can never cause a reload loop.
        if (sessionStorage.getItem('woms.reloadedFor') === latest) return;
        sessionStorage.setItem('woms.reloadedFor', latest);
      } catch {
        return;
      }
      window.location.reload();
    })
    .catch(() => {});
}
