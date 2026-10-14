import { Link } from 'react-router-dom';
import RecordTasks from '../../components/RecordTasks';
import AuditTrail from '../../components/AuditTrail';
import DocumentsSummary from '../../components/DocumentsSummary';
import LazySection from '../../components/LazySection';

// Plain read-only record view, used by OutboundMaster regardless of stage --
// the buttons open whichever stage popup is next, they don't edit in place.
export default function OutboundDetailView({ request, pickTasks, dispatches, locations, primary, others, onAction }) {
  const dispatched = dispatches.length > 0;

  // Which inbounds these Handling Units came from, and how many from each.
  const inbounds = new Map();
  pickTasks.forEach((t) => {
    if (!t.inbound_advice_id) return;
    const k = String(t.inbound_advice_id);
    const cur = inbounds.get(k) || { id: t.inbound_advice_id, reference: t.inbound_reference, hus: 0 };
    cur.hus += 1;
    inbounds.set(k, cur);
  });

  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <div className="muted small" style={{ letterSpacing: 0.5 }}>
            PICKUP REFERENCE
          </div>
          <div className="wizard-ref-value">{request.outbound_reference || `#${request.ROWID}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {others.map((a) => (
            <button key={a.popup} className="btn secondary" onClick={() => onAction(a.popup)}>
              {a.label}
            </button>
          ))}
          {primary && (
            <button className="btn" onClick={() => onAction(primary.popup)}>
              {primary.label}
            </button>
          )}
        </div>
      </div>

      <div className="check-grid">
        <div className="check-block">
          <div className="check-block-title">Customer</div>
          <div>{request.customer_name}</div>
          <div className="muted small">Reference: {request.reference_number || '—'}</div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Pickup</div>
          <div>{request.requested_date || '—'}</div>
          <div className="muted small">Carrier: {request.transporter_name || 'not specified'}</div>
          <div className="muted small">
            From: {request.warehouse_name || '—'}
            {request.warehouse_address ? `, ${request.warehouse_address}` : ''}
          </div>
        </div>
        <div className="check-block">
          <div className="check-block-title">Driver check-in</div>
          {request.arrived_at ? (
            <>
              <div>
                {request.driver_name || '—'} <span className="muted small">(ID {request.driver_id_number || '—'})</span>
              </div>
              <div className="muted small">Phone: {request.driver_phone || '—'}</div>
              <div className="muted small">
                Vehicle: {request.vehicle_plate || '—'}
                {request.trailer_plate ? ` / trailer ${request.trailer_plate}` : ''}
              </div>
              <div className="muted small">
                Arrived {request.arrived_at} · checked in by {request.checked_in_by || '—'}
              </div>
            </>
          ) : (
            <div className="muted small">{dispatched ? 'No check-in was recorded for this pickup.' : 'Driver has not arrived yet.'}</div>
          )}
        </div>
        <div className="check-block">
          <div className="check-block-title">Dispatch</div>
          {dispatched ? (
            dispatches.map((d) => (
              <div key={d.ROWID}>
                <div>{d.dispatch_date}</div>
                <div className="muted small">
                  By {d.dispatched_by}
                  {d.vehicle_details ? ` · ${d.vehicle_details}` : ''}
                </div>
              </div>
            ))
          ) : (
            <div className="muted small">Not dispatched yet</div>
          )}
        </div>
        <div className="check-block">
          <div className="check-block-title">Linked Inbounds</div>
          {inbounds.size === 0 ? (
            <div className="muted small">No goods selected yet</div>
          ) : (
            [...inbounds.values()].map((i) => (
              <div key={i.id}>
                <Link className="link-btn" to={`/inbound/${i.id}`}>
                  {i.reference || `#${i.id}`}
                </Link>{' '}
                <span className="muted small">
                  {i.hus} HU{i.hus === 1 ? '' : 's'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <h3>Goods ({pickTasks.length})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>HU</th>
              <th>Cargo</th>
              <th>From inbound</th>
              <th>Location</th>
              <th>Qty</th>
              <th>QR Code</th>
              <th>Pick</th>
              <th>HU status</th>
            </tr>
          </thead>
          <tbody>
            {pickTasks.map((t) => {
              const loc = locations.get(String(t.cargo_location_id));
              return (
                <tr key={t.ROWID}>
                  <td>{t.cargo_hu_no || '—'}</td>
                  <td>{t.cargo_description}</td>
                  <td>
                    {t.inbound_advice_id ? (
                      <Link className="link-btn" to={`/inbound/${t.inbound_advice_id}`}>
                        {t.inbound_reference || `#${t.inbound_advice_id}`}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{loc?.code || <span className="muted">—</span>}</td>
                  <td>
                    {t.cargo_qty} {t.cargo_unit}
                  </td>
                  <td>{t.cargo_qr_code || <span className="muted">Not generated</span>}</td>
                  <td>
                    <span className="status-badge">{t.status}</span>
                  </td>
                  <td>{t.cargo_status}</td>
                </tr>
              );
            })}
            {pickTasks.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No goods selected yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LazySection><DocumentsSummary linkedModules={['Outbound Operations', 'Outbound Operations Photos']} recordId={request.ROWID} title="Documents" /></LazySection>
      <LazySection><RecordTasks moduleRef="Outbound Operations" recordRefId={request.ROWID} /></LazySection>
      <LazySection><AuditTrail modules={['Outbound Operations', 'Outbound Operations Photos']} recordId={request.ROWID} /></LazySection>
    </div>
  );
}
