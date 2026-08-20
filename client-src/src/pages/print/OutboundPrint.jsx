import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getOutboundRequestById, listPickTasksByRequest } from '../../lib/api';
import QrCodeImage from '../../components/QrCodeImage';

export default function OutboundPrint() {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [pickTasks, setPickTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOutboundRequestById(requestId), listPickTasksByRequest(requestId)]).then(([r, t]) => {
      setRequest(r);
      setPickTasks(t);
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

      <h1>Outbound Dispatch Note</h1>
      <table className="print-meta">
        <tbody>
          <tr>
            <td>Reference</td>
            <td>{request.reference_number || '—'}</td>
            <td>Request #</td>
            <td>{request.ROWID}</td>
          </tr>
          <tr>
            <td>Customer</td>
            <td>{request.customer_name}</td>
            <td>Transporter</td>
            <td>{request.transporter_name || '—'}</td>
          </tr>
          <tr>
            <td>Requested date</td>
            <td>{request.requested_date}</td>
            <td>Status</td>
            <td>{request.status}</td>
          </tr>
        </tbody>
      </table>

      <h2>Pick List</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Pick Status</th>
            <th>QR Code</th>
          </tr>
        </thead>
        <tbody>
          {pickTasks.map((t) => (
            <tr key={t.ROWID}>
              <td>{t.cargo_description}</td>
              <td>
                {t.cargo_qty} {t.cargo_unit}
              </td>
              <td>{t.status}</td>
              <td>
                {t.cargo_qr_code ? (
                  <QrCodeImage value={t.cargo_qr_code} size={80} />
                ) : (
                  <span className="muted">Not generated</span>
                )}
              </td>
            </tr>
          ))}
          {pickTasks.length === 0 && (
            <tr>
              <td colSpan={4}>No pick lines recorded.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="print-sign-row">
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Handed over by (warehouse)</p>
        </div>
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Received by (driver / transporter)</p>
        </div>
      </div>
    </div>
  );
}
