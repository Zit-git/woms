import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import './index.css';
import { reloadIfNewBuildAvailable } from './lib/selfUpdate';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reloadIfNewBuildAvailable();
