import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getInboundAdviceById, listCargoByAdvice } from '../../lib/api';
import QrCodeImage from '../../components/QrCodeImage';

// One cuttable label per cargo item -- scan the QR on the warehouse floor to
// drive put-away (Storage page's "Scan QR") instead of typing a location.
export default function PutawayPrint() {
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

  const labeled = cargoRows.filter((c) => c.qr_code);

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
        {labeled.length < cargoRows.length && (
          <p className="muted small">
            {cargoRows.length - labeled.length} item(s) have no QR code yet -- generate it from the advice page first.
          </p>
        )}
      </div>

      <h1>Handling Unit Labels — {advice.inbound_reference || `Advice #${advice.ROWID}`}</h1>
      <div className="label-grid">
        {labeled.map((c) => (
          <div key={c.ROWID} className="label-card">
            <QrCodeImage value={c.qr_code} size={110} />
            <div className="label-desc">
              <strong>{advice.inbound_reference ? `${advice.inbound_reference}-${String(c.outer_package_no || '').padStart(3, '0')}` : c.outer_package_no}</strong>
            </div>
            <div className="small">{c.description}</div>
            <div className="muted small">{c.unit}</div>
            <div className="muted small">{c.qr_code}</div>
          </div>
        ))}
        {labeled.length === 0 && <p className="muted">No cargo with a generated QR code yet.</p>}
      </div>
    </div>
  );
}
