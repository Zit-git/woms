import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getWarehouseMap, listWarehouses } from '../../lib/api';
import { locationQr } from '../../lib/labels';
import QrCodeImage from '../../components/QrCodeImage';

// QR labels for storage positions, to stick on the rack: the whole warehouse, one rack (?rack=) or one position
// (?position=). The code under the QR is what is typed when a label cannot be scanned.
export default function LocationLabels() {
  const [params] = useSearchParams();
  const warehouseId = params.get('warehouse');
  const rackOnly = params.get('rack');
  const positionOnly = params.get('position');
  const [labels, setLabels] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!warehouseId) {
      setError('No warehouse chosen.');
      return;
    }
    Promise.all([getWarehouseMap(warehouseId), listWarehouses()])
      .then(([zones, warehouses]) => {
        const name = warehouses.find((w) => String(w.ROWID) === String(warehouseId))?.name || '';
        setTitle(name);
        const out = [];
        zones.forEach(({ zone, aisles }) =>
          aisles.forEach(({ aisle, racks }) =>
            racks.forEach(({ rack, locations }) => {
              if (rackOnly && String(rack.ROWID) !== rackOnly) return;
              [...locations]
                .sort((a, b) => (Number(a.bay) || 0) - (Number(b.bay) || 0) || (Number(a.rack_level) || 0) - (Number(b.rack_level) || 0))
                .forEach((loc) => {
                  if (positionOnly && String(loc.ROWID) !== positionOnly) return;
                  out.push({ loc, path: `${zone.name} / ${aisle.name} / ${rack.code}` });
                });
            })
          )
        );
        setLabels(out);
      })
      .catch((err) => setError(err.message || String(err)));
  }, [warehouseId, rackOnly, positionOnly]);

  if (error) return <p className="error-text">{error}</p>;
  if (!labels) return <p className="muted">Loading...</p>;

  return (
    <div className="print-doc">
      <div className="no-print">
        <button className="btn" onClick={() => window.print()} disabled={!labels.length}>
          Print
        </button>
        <p className="muted small">{labels.length} position label{labels.length === 1 ? '' : 's'}. Stick each one on its rack position where it can be scanned.</p>
      </div>
      <h1>Position labels{title ? ` — ${title}` : ''}</h1>
      <div className="label-grid">
        {labels.map(({ loc, path }) => (
          <div key={loc.ROWID} className="label-card">
            <QrCodeImage value={locationQr(loc.ROWID)} size={110} />
            <div className="label-desc" style={{ fontSize: 15 }}>
              <strong>{loc.location_code}</strong>
            </div>
            <div className="small">{path}</div>
            <div className="muted small">
              {[loc.bay && `Bay ${loc.bay}`, loc.rack_level && `Level ${loc.rack_level}`].filter(Boolean).join(' · ')}
            </div>
            <div className="muted small">{locationQr(loc.ROWID)}</div>
          </div>
        ))}
        {labels.length === 0 && <p className="muted">Nothing to print.</p>}
      </div>
    </div>
  );
}
