import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getOutboundRequestById, listPickTasksByRequest } from '../../lib/api';
import QrCodeImage from '../../components/QrCodeImage';
import { PICKUP_QR_PREFIX } from '../../lib/reference';

// What a customer gives its carrier before a pickup: the reference and QR the
// driver presents at the gate. Scanning the QR in Outbound Operations opens
// this request.

export default function PickupPass() {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOutboundRequestById(requestId), listPickTasksByRequest(requestId)]).then(([r, t]) => {
      setRequest(r);
      setTasks(t);
      setLoading(false);
    });
  }, [requestId]);

  if (loading) return <p className="muted">Loading...</p>;
  if (!request) return <p className="error-text">Outbound request not found.</p>;

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <h1>Pickup Pass</h1>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', margin: '8px 0 16px' }}>
        <div>
          <QrCodeImage value={`${PICKUP_QR_PREFIX}${request.ROWID}`} size={140} />
          <div className="muted small">{PICKUP_QR_PREFIX}{request.ROWID}</div>
        </div>
        <div>
          <div className="muted small">PICKUP REFERENCE</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{request.outbound_reference || `#${request.ROWID}`}</div>
          <div className="muted small">Show this pass and photo ID at the gate.</div>
        </div>
      </div>

      <table className="print-table">
        <tbody>
          <tr>
            <td>Customer</td>
            <td>{request.customer_name}</td>
          </tr>
          <tr>
            <td>Customer reference</td>
            <td>{request.reference_number || '—'}</td>
          </tr>
          <tr>
            <td>Collect from</td>
            <td>
              {request.warehouse_name || '—'}
              {request.warehouse_address ? `, ${request.warehouse_address}` : ''}
            </td>
          </tr>
          <tr>
            <td>Pickup date</td>
            <td>{request.requested_date || '—'}</td>
          </tr>
          <tr>
            <td>Carrier</td>
            <td>{request.transporter_name || 'Not specified'}</td>
          </tr>
          <tr>
            <td>Goods</td>
            <td>
              {tasks.length} Handling Unit{tasks.length === 1 ? '' : 's'}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Goods to collect</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th>HU</th>
            <th>Description</th>
            <th>Type</th>
            <th>From inbound</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.ROWID}>
              <td>{t.cargo_hu_no || '—'}</td>
              <td>{t.cargo_description || '—'}</td>
              <td>{t.cargo_unit || '—'}</td>
              <td>{t.inbound_reference || '—'}</td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={4}>The goods will be confirmed at the warehouse.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="muted small" style={{ marginTop: 16 }}>
        The driver and vehicle are checked against this pass before loading. Goods are released only against this reference.
      </p>
    </div>
  );
}
