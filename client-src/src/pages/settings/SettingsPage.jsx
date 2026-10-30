import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FEATURES } from '../../lib/features';

export default function SettingsPage() {
  const { features, setFeature } = useAuth();
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const toggle = (key, on) => {
    setBusyKey(key);
    setError('');
    setFeature(key, on)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyKey(''));
  };

  return (
    <div>
      <h2>Settings</h2>

      <div className="card">
        <h3>Warehouse Module</h3>
        <p className="muted small">Choose which levels of the warehouse module are in use. Changes apply to everyone.</p>
        {error && <div className="error-text">{error}</div>}
        {FEATURES.map((f) => {
          const blocked = f.requires && !features[f.requires];
          return (
            <label
              key={f.key}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', opacity: blocked ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                role="switch"
                checked={features[f.key]}
                disabled={blocked || busyKey === f.key}
                onChange={(e) => toggle(f.key, e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              <span style={{ flex: 1 }}>
                <strong>{f.label}</strong>
                <span className="muted small" style={{ display: 'block' }}>{f.description}</span>
              </span>
              <span className="muted small">{blocked ? 'Needs Storage Locations' : features[f.key] ? 'On' : 'Off'}</span>
            </label>
          );
        })}
      </div>

      <div className="card">
        <h3>Application</h3>
        <p>
          <strong>System:</strong> Warehouse Operations Management System (WOMS)
        </p>
        <p>
          <strong>Platform:</strong> Zoho Catalyst (Slate)
        </p>
      </div>
    </div>
  );
}
