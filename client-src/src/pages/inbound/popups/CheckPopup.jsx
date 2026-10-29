import { useState } from 'react';
import Modal from '../../../components/Modal';
import { createGRN } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { computeInboundSummary } from '../../../lib/inboundSummary';
import RecordTasks from '../../../components/RecordTasks';
import AuditTrail from '../../../components/AuditTrail';
import { fixed2, decimal2 } from '../../../lib/format';
import { usePagination } from '../../../lib/usePagination';
import Pagination from '../../../components/Pagination';

// Stage: final review before generating the GRN -- HUs (and their QR labels)
// were created one stage earlier (CreateHUPopup).
export default function CheckPopup({ advice, lines, cargoRows, transporters, suppliers, patchAdvice, onClose }) {
  const [completing, setCompleting] = useState(false);
  const { user } = useAuth();

  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, lines, cargoRows);

  const completeInbound = () => {
    setCompleting(true);
    createGRN(advice.ROWID, advice.inbound_reference, user?.email_id || '')
      .then(() => patchAdvice({ status: 'Ready' }))
      .then(onClose)
      .finally(() => setCompleting(false));
  };

  const pager = usePagination(lines);

  return (
    <Modal title={`Check: ${advice.inbound_reference || ''}`} onClose={onClose} wide>
      <div className="check-grid">
        <div className="check-block">
          <div className="check-block-title">Customer</div>
          <div>{advice.customer_name}</div>
          <div className="muted small">Reference: {advice.reference_number || '—'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Supplier</div>
          <div>{supplier?.name || '—'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Destination</div>
          <div>{advice.destination || '—'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Transport Information</div>
          <div>Type: {advice.transport_type || '—'}</div>
          <div>Carrier: {transporter?.name || '—'}</div>
          <div>CMR Number: {advice.cmr_number || '—'}</div>
          <div>ETA: {advice.expected_date || '—'}</div>
        </div>
      </div>

      <div className="summary-strip">
        <div>
          <div className="muted small">Expected Colli</div>
          <div className="summary-value">{summary.expectedColli} pcs</div>
        </div>
        <div>
          <div className="muted small">Received Pieces (Inner)</div>
          <div className="summary-value">{summary.receivedPieces} pcs</div>
        </div>
        <div>
          <div className="muted small">Total Packages</div>
          <div className="summary-value">{summary.totalOuterPackages}</div>
        </div>
        <div>
          <div className="muted small">Total Weight</div>
          <div className="summary-value">{fixed2(summary.totalWeight)} kg</div>
        </div>
        <div>
          <div className="muted small">Total Volume</div>
          <div className="summary-value">{fixed2(summary.totalVolume)} m³</div>
        </div>
      </div>

      <h3>Line Items Overview</h3>
      <div style={{ overflowX: 'auto' }}>
        <>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type</th>
              <th>Description</th>
              <th>Requested Qty</th>
              <th>Received Qty</th>
              <th>Weight/pkg (kg)</th>
              <th>L×W×H (cm)</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((c) => (
              <tr key={c.ROWID}>
                <td>{c.line_no}</td>
                <td>{c.unit}</td>
                <td>{c.description}</td>
                <td>{c.qty || '—'}</td>
                <td>{c.received_qty ?? '—'}</td>
                <td>{decimal2(c.weight)}</td>
                <td>
                  {c.length_cm}×{c.width_cm}×{c.height_cm}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      </div>

      <div className="check-block" style={{ marginTop: 16 }}>
        <div className="check-block-title">Remarks</div>
        <div>{advice.remarks || '—'}</div>
        {advice.adr_status && <div className="muted small">ADR (Dangerous Goods): {advice.adr_status}</div>}
      </div>

      <RecordTasks moduleRef="Inbound Operations" recordRefId={advice.ROWID} />
      <AuditTrail modules={['Inbound Operations', 'Inbound Operations Photos']} recordId={advice.ROWID} />

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={completeInbound} disabled={completing}>
          {completing ? 'Completing...' : 'Complete Inbound →'}
        </button>
      </div>
      <p className="muted small" style={{ textAlign: 'right' }}>
        All data will be confirmed and the Goods Receipt Note generated for this receipt.
      </p>
    </Modal>
  );
}
