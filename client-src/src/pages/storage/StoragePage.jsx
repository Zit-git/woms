import { useCallback, useEffect, useState } from 'react';
import { listCargoPendingPutAway, listStoredCargo, listAllStorageLocations, recordScan } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import QrScannerModal from '../../components/QrScannerModal';

export default function StoragePage() {
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const [pending, setPending] = useState([]);
  const [stored, setStored] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCargo, setActiveCargo] = useState(null); // { id, mode: 'putaway' | 'relocate' }
  const [pickedLocation, setPickedLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listCargoPendingPutAway(viewer), listStoredCargo(viewer), listAllStorageLocations()])
      .then(([p, s, l]) => {
        setPending(p);
        setStored(s);
        setLocations(l);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openPicker = (cargoId, mode) => {
    setActiveCargo({ id: cargoId, mode });
    setPickedLocation('');
  };

  const handleScanned = useCallback(
    (decodedText) => {
      setShowScanner(false);
      const pendingMatch = pending.find((c) => c.qr_code === decodedText);
      if (pendingMatch) {
        openPicker(pendingMatch.ROWID, 'putaway');
        return;
      }
      const storedMatch = stored.find((c) => c.qr_code === decodedText);
      if (storedMatch) {
        openPicker(storedMatch.ROWID, 'relocate');
        return;
      }
      setError(`No cargo matches scanned code "${decodedText}"`);
    },
    [pending, stored]
  );

  const confirmMove = () => {
    if (!activeCargo || !pickedLocation) return;
    setBusy(true);
    recordScan(activeCargo.id, user?.email_id || '', activeCargo.mode === 'putaway' ? 'storage' : 'relocation', pickedLocation)
      .then(() => {
        setActiveCargo(null);
        load();
      })
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusy(false));
  };

  if (loading) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Storage</h2>
          <p className="muted small">Put-away and relocation for cargo already received into the warehouse.</p>
        </div>
        <button className="btn secondary" onClick={() => setShowScanner(true)}>
          Scan QR
        </button>
      </div>

      {showScanner && <QrScannerModal onDecode={handleScanned} onClose={() => setShowScanner(false)} />}

      {error && <div className="error-text">{error}</div>}

      {activeCargo && (
        <div className="card">
          <h3>{activeCargo.mode === 'putaway' ? 'Assign storage location' : 'Relocate to'}</h3>
          <div className="form-row">
            <label>Storage location</label>
            <select value={pickedLocation} onChange={(e) => setPickedLocation(e.target.value)}>
              <option value="">Select location...</option>
              {locations.map((l) => (
                <option key={l.ROWID} value={l.ROWID}>
                  {l.location_code} ({l.path})
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={confirmMove} disabled={busy || !pickedLocation}>
              {busy ? 'Saving...' : 'Confirm'}
            </button>
            <button className="btn secondary" onClick={() => setActiveCargo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <h3>Pending Put-Away ({pending.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Description</th>
            <th>Qty</th>
            <th>QR Code</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pending.map((c) => (
            <tr key={c.ROWID}>
              <td>{c.customer_name}</td>
              <td>{c.description}</td>
              <td>
                {c.qty} {c.unit}
              </td>
              <td>{c.qr_code || <span className="muted">Not generated</span>}</td>
              <td>
                <button className="link-btn" onClick={() => openPicker(c.ROWID, 'putaway')}>
                  Put Away
                </button>
              </td>
            </tr>
          ))}
          {pending.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nothing pending put-away.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Stored Cargo ({stored.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Description</th>
            <th>Location</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {stored.map((c) => (
            <tr key={c.ROWID}>
              <td>{c.customer_name}</td>
              <td>{c.description}</td>
              <td>{c.location_code}</td>
              <td>
                <span className="status-badge">{c.status}</span>
              </td>
              <td>
                <button className="link-btn" onClick={() => openPicker(c.ROWID, 'relocate')}>
                  Relocate
                </button>
              </td>
            </tr>
          ))}
          {stored.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No stored cargo yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
