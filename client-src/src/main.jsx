import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './index.css';
import { reloadIfNewBuildAvailable } from './lib/selfUpdate';

// The app must never run inside another page's frame. If Catalyst's sign-in form ever
// lands the post-login redirect inside its own iframe, the app would load itself inside
// that frame, show its login screen, embed another sign-in frame, and repeat forever.
// Break out to the top window instead.
if (window.top !== window.self) {
  try {
    window.top.location.replace(window.location.href);
  } catch {
    // cross-origin parent: nothing more we can do from inside the frame
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reloadIfNewBuildAvailable();
