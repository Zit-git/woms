import { Link } from 'react-router-dom';
import { computeInboundSummary } from '../../lib/inboundSummary';
import RecordTasks from '../../components/RecordTasks';
import AuditTrail from '../../components/AuditTrail';
import QrCodeImage from '../../components/QrCodeImage';
import DocumentsSummary from '../../components/DocumentsSummary';
import LazySection from '../../components/LazySection';
import { fixed2, decimal2 } from '../../lib/format';
import { usePagination } from '../../lib/usePagination';
import Pagination from '../../components/Pagination';

// Plain read-only record view, used by InboundMaster regardless of status --
// the one action button opens whichever stage popup is contextually next
// (labeled by the caller), not an accident of clicking some other control.
export default function InboundDetailView({ advice, lines, cargoRows, huContents, customers, transporters, suppliers, warehouses, grn, outboundLinks, createdOutbounds, locationLabels, onEdit, onEditRequest, editLabel = 'Edit' }) {
  const supplier = suppliers.find((s) => String(s.ROWID) === String(advice.supplier_id));
  const transporter = transporters.find((t) => String(t.ROWID) === String(advice.transporter_id));
  const warehouse = (warehouses || []).find((w) => String(w.ROWID) === String(advice.warehouse_id));
  const outboundByHu = new Map();
  (outboundLinks || []).forEach((l) => {
    const k = String(l.cargo_id);
    if (!outboundByHu.has(k)) outboundByHu.set(k, []);
    outboundByHu.get(k).push(l);
  });
  const linkedOutbounds = new Map();
  (outboundLinks || []).forEach((l) => {
    const k = String(l.outbound_request_id);
    const cur = linkedOutbounds.get(k) || { id: l.outbound_request_id, reference: l.outbound_reference, status: l.outbound_status, hus: 0 };
    cur.hus += 1;
    linkedOutbounds.set(k, cur);
  });
  // An outbound opened from this inbound is listed before any goods are on it.
  (createdOutbounds || []).forEach((o) => {
    const k = String(o.ROWID);
    if (!linkedOutbounds.has(k)) linkedOutbounds.set(k, { id: o.ROWID, reference: o.outbound_reference, status: o.status, hus: 0 });
  });
  const summary = computeInboundSummary(advice, lines, cargoRows);
  const linesById = new Map((lines || []).map((l) => [String(l.ROWID), l]));
  const contentsByHu = new Map();
  (huContents || []).forEach((h) => {
    const k = String(h.cargo_id);
    if (!contentsByHu.has(k)) contentsByHu.set(k, []);
    contentsByHu.get(k).push(h);
  });
  const packedByLine = new Map();
  (huContents || []).forEach((h) => packedByLine.set(String(h.inbound_line_id), (packedByLine.get(String(h.inbound_line_id)) || 0) + h.qty));

  const pagerLines = usePagination(lines);

  const pagerHus = usePagination(cargoRows);

  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <div className="muted small" style={{ letterSpacing: 0.5 }}>
            INBOUND REFERENCE
          </div>
          <div className="wizard-ref-value">{advice.inbound_reference || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onEditRequest && (
            <button className="btn secondary" onClick={onEditRequest}>
              Edit Request
            </button>
          )}
          {onEdit && (
            <button className="btn secondary" onClick={onEdit}>
              {editLabel}
            </button>
          )}
        </div>
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
        <div className="check-block">
          <div className="check-block-title">Warehouse &amp; Storage</div>
          <div>{warehouse?.name || '—'}</div>
          <div className="muted small">
            Storage period: {advice.storage_start_date || '—'} → {advice.storage_end_date || 'open-ended'}
          </div>
          <div className="muted small">Goods: {advice.adr_status === 'Yes' ? 'Dangerous goods (ADR)' : 'Standard'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Receiving</div>
          <div>
            {advice.warehouse_unloading_date || '—'} {advice.warehouse_unloading_time || ''}
          </div>
          <div className="muted small">Plate: {advice.license_plate || '—'}</div>
          <div className="muted small">Driver: {advice.driver_name || '—'}</div>
          <div className="muted small">Pieces counted: {advice.received_piece_count ?? '—'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Goods Receipt Note</div>
          {grn ? (
            <>
              <div>{grn.grn_number}</div>
              <div className="muted small">
                {grn.status}
                {grn.verified_by ? ` · verified by ${grn.verified_by}` : ''}
              </div>
              <a className="link-btn" href={`${import.meta.env.BASE_URL}print/grn/${advice.ROWID}`} target="_blank" rel="noreferrer">
                View GRN
              </a>
            </>
          ) : (
            <div className="muted small">Not generated yet</div>
          )}
        </div>
        <div className="check-block">
          <div className="check-block-title">Linked Outbounds</div>
          {linkedOutbounds.size === 0 ? (
            <div className="muted small">No goods have left on an outbound yet</div>
          ) : (
            [...linkedOutbounds.values()].map((o) => (
              <div key={o.id}>
                <Link className="link-btn" to={`/outbound/${o.id}`}>
                  {o.reference || `#${o.id}`}
                </Link>{' '}
                <span className="muted small">
                  {o.hus} of {cargoRows.length} HU{cargoRows.length === 1 ? '' : 's'} · {o.status === 'Dispatched' ? 'Dispatched' : 'Open'}
                </span>
              </div>
            ))
          )}
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

      <h3 style={{ marginTop: 24 }}>Line Items</h3>
      <div style={{ overflowX: 'auto' }}>
        <>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Unit Type</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Received</th>
              <th>On HUs</th>
              <th>Weight/pkg (kg)</th>
              <th>L×W×H (cm)</th>
            </tr>
          </thead>
          <tbody>
            {pagerLines.pageRows.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.line_no}</td>
                <td>{l.unit}</td>
                <td>{l.description}</td>
                <td>{l.qty ?? '—'}</td>
                <td>{l.received_qty ?? '—'}</td>
                <td>{packedByLine.get(String(l.ROWID)) || 0}</td>
                <td>{decimal2(l.weight)}</td>
                <td>
                  {l.length_cm ?? '—'}×{l.width_cm ?? '—'}×{l.height_cm ?? '—'}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No line items yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pagerLines} />
        </>
      </div>

      <div className="toolbar" style={{ marginTop: 24 }}>
        <h3 style={{ margin: 0 }}>Handling Units</h3>
        {cargoRows.length > 0 && (
          <a className="link-btn" href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}`} target="_blank" rel="noreferrer">
            Print all labels
          </a>
        )}
      </div>
      {cargoRows.length === 0 ? (
        <p className="muted small">
          No Handling Units yet — they are created, and QR labels generated, after the goods are received.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <>
          <table>
            <thead>
              <tr>
                <th>HU</th>
                <th>QR</th>
                <th>Type</th>
                <th>Contents</th>
                <th>Weight (kg)</th>
                <th>Storage Location</th>
                <th>Outbound</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagerHus.pageRows.map((c) => (
                <tr key={c.ROWID}>
                  <td>
                    <strong>{advice.inbound_reference ? `${advice.inbound_reference}-${String(c.outer_package_no || '').padStart(3, '0')}` : c.outer_package_no}</strong>
                    <div className="muted small">{c.qr_code}</div>
                    <a className="link-btn" href={`${import.meta.env.BASE_URL}print/putaway/${advice.ROWID}?ids=${c.ROWID}`} target="_blank" rel="noreferrer">
                      Print label
                    </a>
                  </td>
                  <td>
                    <QrCodeImage value={c.qr_code} size={56} />
                  </td>
                  <td>{c.unit}</td>
                  <td>
                    {(contentsByHu.get(String(c.ROWID)) || [])
                      .map((h) => {
                        const l = linesById.get(String(h.inbound_line_id));
                        return `#${l?.line_no ?? '?'} ${l?.description || l?.unit || ''} × ${h.qty}`;
                      })
                      .join(' · ') || c.description || '—'}
                  </td>
                  <td>{decimal2(c.weight)}</td>
                  <td>{locationLabels?.get(String(c.current_location_id)) || <span className="muted">Not put away yet</span>}</td>
                  <td>
                    {(outboundByHu.get(String(c.ROWID)) || []).length ? (
                      outboundByHu.get(String(c.ROWID)).map((o) => (
                        <div key={o.outbound_request_id}>
                          <Link className="link-btn" to={`/outbound/${o.outbound_request_id}`}>
                            {o.outbound_reference || `#${o.outbound_request_id}`}
                          </Link>{' '}
                          <span className="muted small">{o.outbound_status}</span>
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${c.status === 'Stored' ? 'status-stored' : 'status-received'}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination pager={pagerHus} />
          </>
        </div>
      )}

      <div className="check-block" style={{ marginTop: 16 }}>
        <div className="check-block-title">Remarks</div>
        <div>{advice.remarks || '—'}</div>
        {advice.adr_status && <div className="muted small">ADR (Dangerous Goods): {advice.adr_status}</div>}
      </div>

      {advice.status === 'Rejected' && advice.rejection_reason && (
        <div className="check-block" style={{ marginTop: 16, borderColor: 'var(--danger)' }}>
          <div className="check-block-title">Rejection Reason</div>
          <div>{advice.rejection_reason}</div>
        </div>
      )}

      <LazySection><DocumentsSummary linkedModules={['Inbound Operations', 'Inbound Operations Photos']} recordId={advice.ROWID} /></LazySection>
      <LazySection><RecordTasks moduleRef="Inbound Operations" recordRefId={advice.ROWID} /></LazySection>
      <LazySection><AuditTrail modules={['Inbound Operations', 'Inbound Operations Photos']} recordId={advice.ROWID} /></LazySection>
    </div>
  );
}
