import { Component } from 'react';

// After a new deploy, a tab (or a browser cache -- Slate serves index.html with a
// one-year max-age) can still hold the old index.html, which references JS chunk
// filenames the server no longer has. Clicking into a not-yet-loaded page then
// fails to fetch its chunk.
//
// Recovery is: re-fetch the page bypassing the cache (which refreshes the cached
// copy, so the reload picks up the new chunk list), then reload -- at most once a
// minute. The earlier version cleared its "already tried" flag whenever the
// boundary mounted, which it does on every load even when the chunk then fails, so
// a persistently stale page reloaded forever.
const RELOAD_AT = 'woms-chunk-reload-at';
const MIN_GAP_MS = 60 * 1000;

export default class ChunkErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Route failed to load:', error);
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_AT)) || 0;
    } catch {
      return;
    }
    if (Date.now() - last < MIN_GAP_MS) return;
    try {
      sessionStorage.setItem(RELOAD_AT, String(Date.now()));
    } catch {
      return;
    }
    fetch(window.location.pathname + window.location.search, { cache: 'reload' })
      .catch(() => {})
      .finally(() => window.location.reload());
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="card" style={{ maxWidth: 520, margin: 24 }}>
          <h3>Loading the latest version...</h3>
          <p className="muted small">
            If this stays on screen, your browser is holding an out-of-date copy. Press Ctrl+Shift+R (Cmd+Shift+R on a Mac) once.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
