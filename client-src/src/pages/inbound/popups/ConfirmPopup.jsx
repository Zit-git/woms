import { useState } from 'react';
import Modal from '../../../components/Modal';
import { logAudit } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';

// Stage 2 (Confirmed): a Warehouse Manager/Supervisor reviews the completed
// request and confirms it -- a short gate, not a re-entry into every field.
export default function ConfirmPopup({ advice, cargoRows, suppliers, transporters, patchAdvice, onClose }) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, cargoRows);

  const confirm = () => {
    setConfirming(true);
    setError('');
    patchAdvice({ status: 'Confirmed' })
      .then(() => logAudit({ userId: user?.email_id, actionType: 'INBOUND_CONFIRMED', module: 'Inbound Operations', recordId: advice.ROWID }))
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setConfirming(false));
  };

  return (
    <Modal title={`Confirm Request: ${advice.inbound_reference || ''}`} onClose={onClose}>
      {error && <div className="error-text">{error}</div>}

      <div className="check-block">
        <div className="check-block-title">Customer</div>
        <div>{advice.customer_name}</div>
      </div>
      <div className="check-block">
        <div className="check-block-title">Destination</div>
        <div>{advice.destination || '—'}</div>
        <div className="muted small">ETA: {advice.expected_date || '—'}</div>
      </div>
      <div className="check-block">
        <div className="check-block-title">Supplier / Transporter</div>
        <div>{supplier?.name || '—'} / {transporter?.name || '—'}</div>
      </div>

      <div className="summary-strip" style={{ marginTop: 12 }}>
        <div>
          <div className="muted small">Expected Colli</div>
          <div className="summary-value">{summary.expectedColli} pcs</div>
        </div>
        <div>
          <div className="muted small">Line Items</div>
          <div className="summary-value">{cargoRows.length}</div>
        </div>
        <div>
          <div className="muted small">Total Weight</div>
          <div className="summary-value">{summary.totalWeight.toFixed(2)} kg</div>
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={confirm} disabled={confirming}>
          {confirming ? 'Confirming...' : 'Confirm Request'}
        </button>
      </div>
    </Modal>
  );
}
