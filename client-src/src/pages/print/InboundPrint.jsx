import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getInboundAdviceById, listCargoByAdvice } from '../../lib/api';
import QrCodeImage from '../../components/QrCodeImage';

export default function InboundPrint() {
  const { adviceId } = useParams();
  const [advice, setAdvice] = useState(null);
  const [cargoRows, setCargoRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getInboundAdviceById(adviceId), listCargoByAdvice(adviceId)]).then(([a, c]) => {
      setAdvice(a);
      setCargoRows(c);
      setLoading(false);
    });
  }, [adviceId]);

  if (loading) return <p className="muted">Loading...</p>;
  if (!advice) return <p className="error-text">Inbound advice not found.</p>;

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <h1>Inbound Receiving Advice</h1>
      <table className="print-meta">
        <tbody>
          <tr>
            <td>Reference</td>
            <td>{advice.reference_number || '—'}</td>
            <td>Advice #</td>
            <td>{advice.ROWID}</td>
          </tr>
          <tr>
            <td>Customer</td>
            <td>{advice.customer_name}</td>
            <td>Transporter</td>
            <td>{advice.transporter_name || '—'}</td>
          </tr>
          <tr>
            <td>Expected date</td>
            <td>{advice.expected_date}</td>
            <td>Status</td>
            <td>{advice.status}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">Transport details: {advice.transport_details || '—'}</p>

      <h2>Cargo Items</h2>
      <table className="print-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Weight</th>
            <th>QR Code</th>
          </tr>
        </thead>
        <tbody>
          {cargoRows.map((c) => (
            <tr key={c.ROWID}>
              <td>{c.description}</td>
              <td>
                {c.qty} {c.unit}
              </td>
              <td>{c.weight ? `${c.weight} kg` : '—'}</td>
              <td>
                {c.qr_code ? <QrCodeImage value={c.qr_code} size={80} /> : <span className="muted">Not generated</span>}
              </td>
            </tr>
          ))}
          {cargoRows.length === 0 && (
            <tr>
              <td colSpan={4}>No cargo recorded.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="print-sign-row">
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Received by (name &amp; signature)</p>
        </div>
        <div>
          <div className="print-sign-line" />
          <p className="muted small">Date</p>
        </div>
      </div>
    </div>
  );
}
