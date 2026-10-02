import { useState } from 'react';
import Modal from '../../../components/Modal';
import { generateQRCode } from '../../../lib/api';

// Stage: Create Handling Units & stick QR. Each Cargo row already *is* one
// physical handling unit (StepGoods/RequestPopup create one row per package,
// not an aggregate line) -- this stage just stamps a QR on every row that
// doesn't have one yet, same deterministic generateQRCode used elsewhere
// (lib/api.js), pulled out of the old combined Check step into its own
// explicit action.
export default function CreateHUPopup({ advice, cargoRows, reloadCargo, patchAdvice, onClose }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const unlabeled = cargoRows.filter((c) => !c.qr_code);

  const createHandlingUnits = () => {
    setCreating(true);
    setError('');
    Promise.all(unlabeled.map((c) => generateQRCode(c.ROWID)))
      .then(() => reloadCargo())
      .then(() => patchAdvice({ status: 'HU Created' }))
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setCreating(false));
  };

  return (
    <Modal title={`Create Handling Units: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      {error && <div className="error-text">{error}</div>}

      <p className="muted small">
        Review the received quantities below, then create a Handling Unit (with its own QR code) for each physical package.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type</th>
              <th>Description</th>
              <th>Requested Qty</th>
              <th>Received Qty</th>
              <th>QR Status</th>
            </tr>
          </thead>
          <tbody>
            {cargoRows.map((c) => (
              <tr key={c.ROWID}>
                <td>{c.outer_package_no}</td>
                <td>{c.unit}</td>
                <td>{c.description}</td>
                <td>{c.qty || '—'}</td>
                <td>{c.received_qty ?? '—'}</td>
                <td>{c.qr_code ? <span className="status-badge status-stored">HU Created</span> : <span className="muted small">Pending</span>}</td>
              </tr>
            ))}
            {cargoRows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No cargo lines on this inbound.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <a className="btn secondary" href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}`} target="_blank" rel="noreferrer">
          Print Labels
        </a>
        <button className="btn" onClick={createHandlingUnits} disabled={creating}>
          {creating
            ? 'Creating...'
            : unlabeled.length === 0
              ? 'Continue →'
              : `Create ${unlabeled.length} Handling Unit${unlabeled.length === 1 ? '' : 's'} & Print Labels`}
        </button>
      </div>
    </Modal>
  );
}
