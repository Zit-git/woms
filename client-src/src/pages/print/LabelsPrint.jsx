import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listHuLabelsByIds } from '../../lib/api';
import { huNumber, idsFromQuery } from '../../lib/labels';
import { decimal2 } from '../../lib/format';
import HuLabel from '../../components/HuLabel';

// Labels for the Handling Units named in the link (?ids=...), from any inbound: used by the Storage page to
// reprint a damaged or missing label, or to print a chosen few.
export default function LabelsPrint() {
  const [params] = useSearchParams();
  const ids = idsFromQuery(params.get('ids'));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listHuLabelsByIds(ids)
      .then(setRows)
      .catch((err) => setError(err.message || String(err)));
  }, [params.get('ids')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="error-text">{error}</p>;
  if (!rows) return <p className="muted">Loading...</p>;

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()} disabled={!rows.length}>
          Print
        </button>
        {rows.length < ids.length && (
          <p className="muted small">{ids.length - rows.length} unit(s) were not found or have no QR code, so they have no label.</p>
        )}
      </div>
      <h1>Handling Unit Labels</h1>
      <div className="label-grid">
        {rows.map((c) => (
          <HuLabel
            key={c.ROWID}
            number={huNumber(c.inbound_reference, c.outer_package_no)}
            description={c.description}
            quantity={c.qty}
            unit={c.unit}
            weight={c.weight ? decimal2(c.weight) : ''}
            customer={c.customer_name}
            location={c.location_code}
            code={c.qr_code}
          />
        ))}
        {rows.length === 0 && <p className="muted">Nothing to print.</p>}
      </div>
    </div>
  );
}
