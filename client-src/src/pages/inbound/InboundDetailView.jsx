import { computeInboundSummary } from '../../lib/inboundSummary';
import RecordTasks from '../../components/RecordTasks';
import AuditTrail from '../../components/AuditTrail';
import DocumentsSummary from '../../components/DocumentsSummary';

// A finished (Ready/Completed) inbound is no longer a workflow in progress --
// this is a plain read-only record of what happened, separate from the
// step-by-step wizard used while it's still Pending. "Edit" is the one
// deliberate door back into that wizard, not an accident of clicking a step.
export default function InboundDetailView({ advice, cargoRows, customers, transporters, suppliers, onEdit }) {
  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const summary = computeInboundSummary(advice, cargoRows);

  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <div className="muted small" style={{ letterSpacing: 0.5 }}>
            INBOUND REFERENCE
          </div>
          <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
        </div>
        <button className="btn secondary" onClick={onEdit}>
          Edit
        </button>
      </div>

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
          <div className="muted small">Total Outer Packages</div>
          <div className="summary-value">{summary.totalOuterPackages}</div>
        </div>
        <div>
          <div className="muted small">Total Weight</div>
          <div className="summary-value">{summary.totalWeight.toFixed(2)} kg</div>
        </div>
        <div>
          <div className="muted small">Total Volume</div>
          <div className="summary-value">{summary.totalVolume.toFixed(3)} m³</div>
        </div>
      </div>

      <h3>Line Items</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Weight/pkg (kg)</th>
              <th>L×W×H (cm)</th>
            </tr>
          </thead>
          <tbody>
            {cargoRows.map((c) => (
              <tr key={c.ROWID}>
                <td>{c.outer_package_no}</td>
                <td>{c.unit}</td>
                <td>{c.description}</td>
                <td>{c.qty || '—'}</td>
                <td>{c.weight}</td>
                <td>
                  {c.length_cm}×{c.width_cm}×{c.height_cm}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="check-block" style={{ marginTop: 16 }}>
        <div className="check-block-title">Remarks</div>
        <div>{advice.remarks || '—'}</div>
        {advice.adr_status && <div className="muted small">ADR (Dangerous Goods): {advice.adr_status}</div>}
      </div>

      <DocumentsSummary linkedModules={['Inbound Operations', 'Inbound Operations Photos']} recordId={advice.ROWID} />
      <RecordTasks moduleRef="Inbound Operations" recordRefId={advice.ROWID} />
      <AuditTrail modules={['Inbound Operations', 'Inbound Operations Photos']} recordId={advice.ROWID} />
    </div>
  );
}
