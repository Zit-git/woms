// Slate serves the app's HTML with `cache-control: max-age=31536000` (a year), so
// a browser that has visited before keeps running the old JavaScript bundle long
// after a new version is deployed. This re-fetches the current page bypassing the
// cache (which also refreshes the cached copy) and, if it points at a newer bundle
// than the one running, reloads -- but never more than once per tab per 10 minutes,
// whatever the target, so inconsistent copies on the edge can never cause a loop.
const BUNDLE = /\/assets\/(index-[\w-]+\.js)/;
const LAST_RELOAD = 'woms.selfUpdateAt';
const MIN_GAP_MS = 10 * 60 * 1000;

export function reloadIfNewBuildAvailable() {
  const running = [...document.scripts].map((s) => s.src.match(BUNDLE)?.[1]).find(Boolean);
  if (!running) return; // dev server: no hashed bundle

  fetch(window.location.pathname + window.location.search, { cache: 'reload' })
    .then((res) => (res.ok ? res.text() : ''))
    .then((html) => {
      const latest = html.match(BUNDLE)?.[1];
      if (!latest || latest === running) return;
      try {
        const last = Number(sessionStorage.getItem(LAST_RELOAD)) || 0;
        if (Date.now() - last < MIN_GAP_MS) return;
        sessionStorage.setItem(LAST_RELOAD, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    })
    .catch(() => {});
}
