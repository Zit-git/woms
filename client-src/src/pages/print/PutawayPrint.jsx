import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getInboundAdviceById, listCargoByAdvice } from '../../lib/api';
import HuLabel from '../../components/HuLabel';
import { huNumber, idsFromQuery } from '../../lib/labels';

// One cuttable label per cargo item -- scan the QR on the warehouse floor to
// drive put-away (Storage page's "Scan QR") instead of typing a location.
export default function PutawayPrint() {
  const { adviceId } = useParams();
  const [params] = useSearchParams();
  const only = params.get('ids') ? new Set(idsFromQuery(params.get('ids'))) : null; // ?ids=: just these units
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

  const labeled = cargoRows.filter((c) => c.qr_code && (!only || only.has(String(c.ROWID))));

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()}>
          Print
        </button>
        {!only && labeled.length < cargoRows.length && (
          <p className="muted small">
            {cargoRows.length - labeled.length} item(s) have no QR code yet -- generate it from the advice page first.
          </p>
        )}
      </div>

      <h1>Handling Unit Labels — {advice.inbound_reference || `Advice #${advice.ROWID}`}</h1>
      <div className="label-grid">
        {labeled.map((c) => (
          <HuLabel
            key={c.ROWID}
            number={huNumber(advice.inbound_reference, c.outer_package_no)}
            description={c.description}
            quantity={c.qty}
            unit={c.unit}
            code={c.qr_code}
          />
        ))}
        {labeled.length === 0 && <p className="muted">No cargo with a generated QR code yet.</p>}
      </div>
    </div>
  );
}
