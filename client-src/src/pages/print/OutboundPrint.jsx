import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getOutboundRequestById, listPickTasksByRequest, listDispatchesByRequest } from '../../lib/api';
import QrCodeImage from '../../components/QrCodeImage';
import { ginNumber, ginStatus } from '../../lib/documents';
import { huNumber } from '../../lib/labels';

// Goods Issue Note (GIN): the outbound counterpart of the Goods Receipt Note. One page for the driver and the file:
// who collected what, when, in which vehicle, and which Handling Units left.
export default function OutboundPrint() {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [pickTasks, setPickTasks] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOutboundRequestById(requestId), listPickTasksByRequest(requestId), listDispatchesByRequest(requestId)]).then(([r, t, d]) => {
      setRequest(r);
      setPickTasks(t);
      setDispatches(d);
      setLoading(false);
    });
  }, [requestId]);

  if (loading) return <p className="muted">Loading...</p>;
  if (!request) return <p className="error-text">Outbound request not found.</p>;

  const dispatch = dispatches[0];
  const sentCount = pickTasks.filter((t) => t.cargo_status === 'Dispatched' || t.cargo_status === 'Delivered').length;

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <h1>Goods Issue Note</h1>
      <p>
        <strong>{ginNumber(request.outbound_reference) || 'GIN not available yet'}</strong>
        <span className="muted"> · {ginStatus(Boolean(dispatch))}</span>
      </p>
      <table className="print-meta">
        <tbody>
          <tr>
            <td>Pickup reference</td>
            <td>{request.outbound_reference || '—'}</td>
            <td>Customer reference / PO</td>
            <td>{request.reference_number || '—'}</td>
          </tr>
          <tr>
            <td>Customer</td>
            <td>{request.customer_name}</td>
            <td>Warehouse</td>
            <td>{request.warehouse_name || '—'}</td>
          </tr>
          <tr>
            <td>Source inbound</td>
            <td>{request.source_inbound_reference || '—'}</td>
            <td>Requested pickup date</td>
            <td>{request.requested_date || '—'}</td>
          </tr>
          <tr>
            <td>Transporter</td>
            <td>{request.transporter_name || '—'}</td>
            <td>Status</td>
            <td>{request.status}</td>
          </tr>
          <tr>
            <td>Driver</td>
            <td>
              {request.driver_name || '—'}
              {request.driver_id_number ? ` (ID ${request.driver_id_number})` : ''}
            </td>
            <td>Vehicle</td>
            <td>
              {request.vehicle_plate || '—'}
              {request.trailer_plate ? ` / trailer ${request.trailer_plate}` : ''}
            </td>
          </tr>
          <tr>
            <td>Arrived at the gate</td>
            <td>{request.arrived_at || '—'}</td>
            <td>Dispatched</td>
            <td>{dispatch ? `${dispatch.dispatch_date}${dispatch.dispatched_by ? ` by ${dispatch.dispatched_by}` : ''}` : '—'}</td>
          </tr>
        </tbody>
      </table>

      <h2>Handling Units</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th>HU</th>
            <th>Contents</th>
            <th>Qty</th>
            <th>From inbound</th>
            <th>Status</th>
            <th>QR Code</th>
          </tr>
        </thead>
        <tbody>
          {pickTasks.map((t) => (
            <tr key={t.ROWID}>
              <td>{huNumber(t.inbound_reference, t.cargo_hu_no) || '—'}</td>
              <td>{t.cargo_description}</td>
              <td>
                {t.cargo_qty} {t.cargo_unit}
              </td>
              <td>{t.inbound_reference || '—'}</td>
              <td>{t.cargo_status || t.status}</td>
              <td>
                {t.cargo_qr_code ? (
                  <>
                    <QrCodeImage value={t.cargo_qr_code} size={64} />
                    <div className="muted small">{t.cargo_qr_code}</div>
                  </>
                ) : (
                  <span className="muted">Not generated</span>
                )}
              </td>
            </tr>
          ))}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={6}>No goods on this outbound.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted small">
        {pickTasks.length} Handling Unit{pickTasks.length === 1 ? '' : 's'} on this note, {sentCount} dispatched.
      </p>

      <div className="print-sign-row">
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Issued by (warehouse)</p>
        </div>
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Received by (driver / transporter)</p>
        </div>
      </div>
    </div>
  );
}
