import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import RackLevels from './RackLevels';
import { getWarehouseMap, listWarehouses } from '../lib/api';
import { locationFit } from '../lib/allocation';
import { findLocationByCode } from '../lib/labels';

const QrScannerModal = lazy(() => import('./QrScannerModal'));

// Choose where Handling Units go by clicking a position on the warehouse map. Positions that can take the
// unit(s) right now are green (the suggested one is outlined), the rest are grey and say why on hover.
// `cargos` are the units being placed together; `otherPlacements` are units already chosen in the same sitting.
export default function LocationMapPicker({ warehouseId, cargos, allCargo, packageTypes, customerId, otherPlacements, excludeCargoIds, suggestedId, value, onPick, onClose, title }) {
  const [maps, setMaps] = useState(null); // [{ warehouse, zones }]
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  // The unit's warehouse; units from old data have none recorded, and then every warehouse is shown.
  useEffect(() => {
    let current = true;
    listWarehouses()
      .then((all) => (warehouseId ? all.filter((w) => String(w.ROWID) === String(warehouseId)) : all))
      .then((list) => Promise.all(list.map((warehouse) => getWarehouseMap(warehouse.ROWID).then((zones) => ({ warehouse, zones })))))
      .then((result) => current && setMaps(result))
      .catch((err) => current && setError(err.message || String(err)));
    return () => {
      current = false;
    };
  }, [warehouseId]);

  const zones = useMemo(() => (maps || []).flatMap((m) => m.zones), [maps]);

  const classify = useMemo(() => {
    const cache = new Map();
    return (loc) => {
      const key = String(loc.ROWID);
      if (!cache.has(key)) {
        const fit = locationFit({ cargos, location: loc, allCargo, packageTypes, customerId, otherPlacements, excludeCargoIds });
        if (!fit.ok) cache.set(key, { state: 'unavailable', reason: fit.reason });
        else if (key === String(value || '')) cache.set(key, { state: 'selected' });
        else if (key === String(suggestedId || '')) cache.set(key, { state: 'suggested' });
        else cache.set(key, { state: 'available' });
      }
      return cache.get(key);
    };
  }, [cargos, allCargo, packageTypes, customerId, otherPlacements, excludeCargoIds, suggestedId, value]);

  // Scan the position label on the rack (or type its code): an available position is chosen, any other says why not.
  const onScanned = (text) => {
    const all = zones.flatMap((z) => z.aisles.flatMap((a) => a.racks.flatMap((r) => r.locations)));
    const loc = findLocationByCode(all, text);
    setScanning(false);
    if (!loc) {
      setScanMessage(`"${text}" is not a position label of ${warehouseId ? 'this warehouse' : 'these warehouses'}.`);
      return;
    }
    const state = classify(loc);
    if (state.state === 'unavailable') {
      setScanMessage(`${loc.location_code} cannot take it: ${state.reason}.`);
      return;
    }
    setScanMessage('');
    onPick(String(loc.ROWID), loc);
  };

  const counts = useMemo(() => {
    let usable = 0;
    let all = 0;
    (zones || []).forEach((z) => z.aisles.forEach((a) => a.racks.forEach((r) => r.locations.forEach((l) => {
      all += 1;
      if (classify(l).state !== 'unavailable') usable += 1;
    }))));
    return { usable, all };
  }, [zones, classify]);

  return (
    <Modal title={title || 'Choose a position on the map'} onClose={onClose} wide>
      <div className="toolbar">
        <div className="warehouse-map-legend">
          <span><i className="legend-swatch legend-available" /> Can take it</span>
          {suggestedId && <span><i className="legend-swatch legend-suggested" /> Suggested</span>}
          {value && <span><i className="legend-swatch legend-selected" /> Chosen</span>}
          <span><i className="legend-swatch legend-unavailable" /> Not available (hover for why)</span>
        </div>
        {maps && <span className="muted small">{counts.usable} of {counts.all} positions can take it</span>}
      </div>
      {error && <div className="error-text">{error}</div>}
      {scanMessage && <div className="error-text">{scanMessage}</div>}
      {maps && (
        <p style={{ margin: '4px 0 8px' }}>
          <button type="button" className="btn secondary" onClick={() => setScanning(true)}>
            Scan the position label
          </button>
        </p>
      )}
      {scanning && (
        <Suspense fallback={null}>
          <QrScannerModal title="Scan the position label" onDecode={onScanned} onClose={() => setScanning(false)} />
        </Suspense>
      )}
      {!maps && !error && <p className="muted">Loading the warehouse map...</p>}
      {maps && zones.length === 0 && <p className="muted">No zones are set up for this warehouse yet.</p>}
      {!warehouseId && maps && <p className="muted small">This unit has no warehouse recorded, so every warehouse is shown.</p>}
      {(maps || []).flatMap(({ warehouse, zones: list }) => list.map((z) => ({ ...z, warehouse }))).map(({ zone, aisles, warehouse }) => (
        <div className="warehouse-zone" key={zone.ROWID}>
          <h3>
            {!warehouseId && <span className="muted small">{warehouse.name} / </span>}
            {zone.name} {zone.zone_type && <span className="muted small">({zone.zone_type})</span>}
          </h3>
          {aisles.map(({ aisle, racks }) => (
            <div key={aisle.ROWID} style={{ marginBottom: 12 }}>
              <div className="muted small" style={{ marginBottom: 4 }}>{aisle.name}</div>
              {racks.map(({ rack, locations }) => (
                <div className="warehouse-rack" key={rack.ROWID}>
                  <div className="warehouse-rack-label">{rack.code}</div>
                  <div className="warehouse-rack-locations">
                    <RackLevels locations={locations} classify={classify} onPick={(loc) => onPick(String(loc.ROWID), loc)} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        {suggestedId ? (
          <button type="button" className="btn secondary" onClick={() => onPick(String(suggestedId))}>
            Use the suggested position
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
