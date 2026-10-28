import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/Modal';
import { createOutboundFromInbound } from '../../../lib/api';
import { todayStr } from '../../../lib/dates';

// The customer names the inbound (or its GRN) they want goods from; the supervisor opens the outbound here,
// with customer, warehouse and source inbound already filled in. One inbound can have many outbounds.
export default function CreateOutboundPopup({ advice, grn, customers, transporters, setError, onClose }) {
  const navigate = useNavigate();
  const [transporterId, setTransporterId] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const customer = (customers || []).find((c) => String(c.ROWID) === String(advice.customer_id));

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    createOutboundFromInbound(advice, { transporter_id: transporterId, reference_number: reference.trim(), requested_date: date })
      .then((created) => navigate(`/outbound/${created.ROWID}`))
      .catch((err) => {
        setError(err.message || String(err));
        setBusy(false);
        onClose();
      });
  };

  return (
    <Modal title="Create outbound from this inbound" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted small" style={{ marginTop: -8 }}>
          Goods can only be chosen from this inbound's Handling Units. You can create more than one outbound from the same inbound.
        </p>
        <div className="form-row">
          <label>Inbound</label>
          <div>
            {advice.inbound_reference || `#${advice.ROWID}`}
            {grn?.grn_number && <span className="muted small"> · {grn.grn_number}</span>}
          </div>
        </div>
        <div className="form-row">
          <label>Customer</label>
          <div>{customer?.name || '—'}</div>
        </div>
        <div className="form-row">
          <label>Carrier (optional)</label>
          <select value={transporterId} onChange={(e) => setTransporterId(e.target.value)}>
            <option value="">No carrier yet</option>
            {(transporters || []).map((t) => (
              <option key={t.ROWID} value={t.ROWID}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Customer reference / PO (optional)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Pickup date</label>
          <input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating...' : 'Create outbound'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
