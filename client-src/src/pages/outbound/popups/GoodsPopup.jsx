import { useState } from 'react';
import Modal from '../../../components/Modal';
import { addPickLine, removePickTask } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

// Stage: choose which of the customer's Handling Units leave on this outbound.
export default function GoodsPopup({ request, pickTasks, availableCargo, locations, reload, setError, onClose }) {
  const { user } = useAuth();
  const [cargoId, setCargoId] = useState('');
  const [busy, setBusy] = useState(false);

  const add = (e) => {
    e.preventDefault();
    if (!cargoId) return;
    setBusy(true);
    addPickLine({ outbound_request_id: request.ROWID, cargo_id: cargoId, assigned_to: user?.email_id || '', status: 'Assigned' })
      .then(() => {
        setCargoId('');
        return reload();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(false));
  };

  // One at a time: each add checks that nobody else has claimed the unit in the meantime.
  const addAll = async () => {
    setBusy(true);
    try {
      for (const c of availableCargo) {
        await addPickLine({ outbound_request_id: request.ROWID, cargo_id: c.ROWID, assigned_to: user?.email_id || '', status: 'Assigned' });
      }
    } catch (err) {
      setError(err.message || String(err));
    }
    await reload().catch(() => {});
    setBusy(false);
  };

  const remove = (task) => {
    setBusy(true);
    removePickTask(task.ROWID)
      .then(reload)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`Select goods: ${request.outbound_reference || `#${request.ROWID}`}`} onClose={onClose} wide>
      <p className="muted small" style={{ marginTop: -8 }}>
        {request.inbound_advice_id
          ? `Handling Units from inbound ${request.source_inbound_reference || `#${request.inbound_advice_id}`} that are still in the warehouse.`
          : `Handling Units of ${request.customer_name} that are still in the warehouse.`}{' '}
        Picked lines can't be removed.
      </p>

      <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="form-row" style={{ flex: 1, marginBottom: 0 }}>
          <label>Handling Unit</label>
          <select value={cargoId} onChange={(e) => setCargoId(e.target.value)}>
            <option value="">Select a Handling Unit...</option>
            {availableCargo.map((c) => (
              <option key={c.ROWID} value={c.ROWID}>
                {[
                  c.description || 'Package',
                  c.outer_package_no && `#${c.outer_package_no}`,
                  c.unit && (c.qty ? `${c.qty} ${c.unit}` : c.unit),
                  c.inbound_reference,
                  c.location_code ? `in ${c.location_code}` : c.status,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit" disabled={busy || !cargoId}>
          Add
        </button>
        {availableCargo.length > 1 && (
          <button className="btn secondary" type="button" disabled={busy} onClick={addAll}>
            Add all ({availableCargo.length})
          </button>
        )}
      </form>
      {!availableCargo.length && <p className="muted small">{request.inbound_advice_id ? 'No Handling Units from this inbound are left to add.' : 'No available Handling Units for this customer.'}</p>}

      <h3 style={{ marginTop: 18 }}>On this outbound ({pickTasks.length})</h3>
      <table>
        <thead>
          <tr>
            <th>HU</th>
            <th>Description</th>
            <th>Location</th>
            <th>From inbound</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pickTasks.map((t) => (
            <tr key={t.ROWID}>
              <td>{t.cargo_hu_no || '—'}</td>
              <td>{t.cargo_description}</td>
              <td>{locations.get(String(t.cargo_location_id))?.code || <span className="muted">At the dock</span>}</td>
              <td>{t.inbound_reference || '—'}</td>
              <td>
                {t.status === 'Picked' ? (
                  <span className="muted small">Picked</span>
                ) : (
                  <button className="link-btn" disabled={busy} onClick={() => remove(t)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nothing selected yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
