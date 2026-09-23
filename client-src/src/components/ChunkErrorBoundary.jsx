import { Component } from 'react';

// After a new deploy, a tab left open from before it still holds the old
// index.html, which references JS chunk filenames the server no longer
// has (each build hashes filenames differently). Clicking into a
// not-yet-loaded page then fails to fetch its chunk and, with no boundary,
// silently renders blank. This reloads once to pick up the current file
// list -- sessionStorage guards against looping if the error is real and
// persists after the reload.
const RELOAD_FLAG = 'woms-chunk-reload-attempted';

export default class ChunkErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    // A fresh, successful mount means this page load is healthy -- clear the
    // flag so a later, unrelated failure still gets its one auto-reload.
    sessionStorage.removeItem(RELOAD_FLAG);
  }

  componentDidCatch(error) {
    console.error('Route failed to load:', error);
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.failed) {
      return <p className="muted" style={{ padding: 24 }}>Loading the latest version...</p>;
    }
    return this.props.children;
  }
}
