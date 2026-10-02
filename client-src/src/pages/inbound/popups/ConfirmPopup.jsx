import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import { logAudit, listCapacityLocations, listCapacityCargo, listCapacityOutboundCommitments, listPackageTypes } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';
import { computeCapacity, requiredCapacityByUnit } from '../../../lib/capacity';

// Stage 2 (Availability Check & Acceptance): a Warehouse Manager/Supervisor
// checks this request's required capacity against what's actually available
// in the warehouse (via the capacity engine built for the Capacity
// Dashboard), then accepts or rejects. This request's own lines are still
// 'Requested', not 'Confirmed', so computeCapacity's Available figure
// naturally excludes them -- it's a clean before/after comparison.
export default function ConfirmPopup({ advice, cargoRows, suppliers, transporters, patchAdvice, onClose }) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [capacitySnapshot, setCapacitySnapshot] = useState(null);
  const [required, setRequired] = useState(new Map());

  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, cargoRows);

  useEffect(() => {
    Promise.all([listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes()])
      .then(([locations, cargo, outboundCommitments, packageTypes]) => {
        setCapacitySnapshot(computeCapacity({ locations, cargoRows: cargo, outboundCommitments, packageTypes, warehouseId: advice.warehouse_id }));
        setRequired(requiredCapacityByUnit(cargoRows, packageTypes));
      })
      .catch((err) => setError(err.message || String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice.warehouse_id]);

  const availableByUnit = new Map((capacitySnapshot?.byCapacityUnit || []).map((e) => [e.capacityUnit, e.available]));
  const allUnits = new Set([...required.keys(), ...availableByUnit.keys()]);

  const confirm = () => {
    setConfirming(true);
    setError('');
    patchAdvice({ status: 'Confirmed' })
      .then(() => logAudit({ userId: user?.email_id, actionType: 'INBOUND_CONFIRMED', module: 'Inbound Operations', recordId: advice.ROWID }))
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setConfirming(false));
  };

  const reject = () => {
    if (!rejectReason.trim()) return;
    setRejecting(true);
    setError('');
    patchAdvice({ status: 'Rejected', rejection_reason: rejectReason })
      .then(() =>
        logAudit({
          userId: user?.email_id,
          actionType: 'INBOUND_REJECTED',
          module: 'Inbound Operations',
          recordId: advice.ROWID,
          details: { reason: rejectReason },
        })
      )
      .then(onClose)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setRejecting(false));
  };

  return (
    <Modal title={`Availability Check: ${advice.inbound_reference || ''}`} onClose={onClose}>
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

      <div className="form-section-title">Availability Check</div>
      {!capacitySnapshot ? (
        <p className="muted small">Checking warehouse capacity...</p>
      ) : allUnits.size === 0 ? (
        <p className="muted small">No line items yet to check.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Capacity Unit</th>
              <th>Required</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            {[...allUnits].sort().map((unit) => {
              const req = required.get(unit) || 0;
              const avail = availableByUnit.get(unit) ?? 0;
              const short = req > avail;
              return (
                <tr key={unit}>
                  <td>{unit}</td>
                  <td>{req}</td>
                  <td style={short ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                    {avail}
                    {short && ' ⚠ short'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted small">A shortage is a warning, not a hard block — some capacity types may be approximate (see the Capacity Dashboard).</p>

      {showReject ? (
        <>
          <div className="form-row">
            <label>Rejection reason *</label>
            <textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this request can't be accepted" />
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn secondary" onClick={() => setShowReject(false)} disabled={rejecting}>
              Cancel
            </button>
            <button className="btn danger" onClick={reject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? 'Rejecting...' : 'Reject Request'}
            </button>
          </div>
        </>
      ) : (
        <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn secondary" onClick={() => setShowReject(true)} disabled={confirming}>
            Reject
          </button>
          <button className="btn" onClick={confirm} disabled={confirming}>
            {confirming ? 'Accepting...' : 'Accept Request'}
          </button>
        </div>
      )}
    </Modal>
  );
}
