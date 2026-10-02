import { useEffect, useMemo, useState } from 'react';
import { listWarehouses, listCapacityLocations, listCapacityCargo, listCapacityOutboundCommitments, listPackageTypes } from '../../lib/api';
import { computeCapacity, projectAvailability } from '../../lib/capacity';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function CapacityDashboard() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [locations, setLocations] = useState([]);
  const [cargoRows, setCargoRows] = useState([]);
  const [outboundCommitments, setOutboundCommitments] = useState([]);
  const [packageTypes, setPackageTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeStart, setRangeStart] = useState(todayStr());
  const [rangeDays, setRangeDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    Promise.all([listWarehouses(), listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes()])
      .then(([w, l, c, o, p]) => {
        setWarehouses(w);
        setLocations(l);
        setCargoRows(c);
        setOutboundCommitments(o);
        setPackageTypes(p);
        if (!warehouseId && w.length) setWarehouseId(w[0].ROWID);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useMemo(
    () => computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId }),
    [locations, cargoRows, outboundCommitments, packageTypes, warehouseId]
  );

  // "Overall" = every warehouse combined (computeCapacity with no warehouseId
  // filter); "By Warehouse" re-runs the same exact math once per warehouse so
  // the two views can never drift out of sync with each other or the detail
  // section below.
  const overallSnapshot = useMemo(
    () => computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes }),
    [locations, cargoRows, outboundCommitments, packageTypes]
  );
  const perWarehouse = useMemo(
    () =>
      warehouses.map((w) => ({
        warehouse: w,
        locationCount: locations.filter((l) => String(l.warehouse_id) === String(w.ROWID)).length,
        snapshot: computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId: w.ROWID }),
      })),
    [warehouses, locations, cargoRows, outboundCommitments, packageTypes]
  );

  const dates = useMemo(() => Array.from({ length: Math.max(1, rangeDays) }, (_, i) => addDays(rangeStart, i)), [rangeStart, rangeDays]);
  const projection = useMemo(
    () => projectAvailability({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId, dates }),
    [locations, cargoRows, outboundCommitments, packageTypes, warehouseId, dates]
  );
  const projectionUnits = useMemo(() => {
    const units = new Set();
    projection.forEach((row) => row.byCapacityUnit.forEach((u) => units.add(u.capacityUnit)));
    return [...units].sort();
  }, [projection]);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Capacity Dashboard</h2>
          <p className="muted small" style={{ marginTop: -8 }}>
            Capacity-unit totals and row counts are exact; per-unit amounts depend on matching each item against Package Types. Weight
            and Space are computed straight from real weights/dimensions instead, but only count locations that have that data set.
          </p>
        </div>
        <div className="form-row" style={{ maxWidth: 260, marginBottom: 0 }}>
          <label>Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.ROWID} value={w.ROWID}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Overall — All Warehouses</h3>
          <div className="card-grid">
            <div className="card kpi-card">
              <h3>Warehouses</h3>
              <div className="kpi-value">{warehouses.length}</div>
              <p className="muted small">{locations.length} storage locations</p>
            </div>
            <div className="card kpi-card">
              <h3>Total Capacity</h3>
              <div className="kpi-value">{overallSnapshot.totals.total}</div>
              <p className="muted small">all capacity units</p>
            </div>
            <div className="card kpi-card">
              <h3>Physical Occupancy</h3>
              <div className="kpi-value">{overallSnapshot.totals.occupied}</div>
              <p className="muted small">capacity units currently consumed</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Put-away</h3>
              <div className="kpi-value">{overallSnapshot.pendingPutaway}</div>
              <p className="muted small">received, not yet shelved</p>
            </div>
            <div className="card kpi-card">
              <h3>Available</h3>
              <div className="kpi-value">{overallSnapshot.totals.available}</div>
              <p className="muted small">total − occupied − committed</p>
            </div>
            <div className="card kpi-card">
              <h3>Weight Available</h3>
              <div className="kpi-value">{overallSnapshot.weight.available.toFixed(0)} kg</div>
              <p className="muted small">of {overallSnapshot.weight.total.toFixed(0)} kg budgeted</p>
            </div>
            <div className="card kpi-card">
              <h3>Space Available</h3>
              <div className="kpi-value">{overallSnapshot.space.available.toFixed(1)} m³</div>
              <p className="muted small">of {overallSnapshot.space.total.toFixed(1)} m³ dimensioned</p>
            </div>
          </div>

          <h3>By Warehouse</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Locations</th>
                  <th>Total</th>
                  <th>Occupied</th>
                  <th>Pending Put-away</th>
                  <th>Committed (est.)</th>
                  <th>Available</th>
                  <th>Weight Avail. (kg)</th>
                  <th>Space Avail. (m³)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {perWarehouse.map(({ warehouse: w, locationCount, snapshot: s }) => (
                  <tr key={w.ROWID} className="clickable-row" onClick={() => setWarehouseId(w.ROWID)}>
                    <td>{w.name}</td>
                    <td>{locationCount}</td>
                    <td>{s.totals.total}</td>
                    <td>{s.totals.occupied}</td>
                    <td>{s.pendingPutaway}</td>
                    <td>{s.totals.committed}</td>
                    <td>{s.totals.available}</td>
                    <td>{s.weight.available.toFixed(0)}</td>
                    <td>{s.space.available.toFixed(1)}</td>
                    <td>
                      <span className="link-btn">{String(w.ROWID) === String(warehouseId) ? 'Viewing ↓' : 'View detail'}</span>
                    </td>
                  </tr>
                ))}
                {perWarehouse.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted">
                      No warehouses configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Warehouse Detail: {warehouses.find((w) => String(w.ROWID) === String(warehouseId))?.name || '—'}</h3>
          <div className="card-grid">
            <div className="card kpi-card">
              <h3>Total Capacity</h3>
              <div className="kpi-value">{snapshot.totals.total}</div>
              <p className="muted small">all capacity units</p>
            </div>
            <div className="card kpi-card">
              <h3>Physical Occupancy</h3>
              <div className="kpi-value">{snapshot.totals.occupied}</div>
              <p className="muted small">capacity units currently consumed</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Put-away</h3>
              <div className="kpi-value">{snapshot.pendingPutaway}</div>
              <p className="muted small">received, not yet shelved</p>
            </div>
            <div className="card kpi-card">
              <h3>Committed (est.)</h3>
              <div className="kpi-value">{snapshot.totals.committed}</div>
              <p className="muted small">accepted, not yet arrived</p>
            </div>
            <div className="card kpi-card">
              <h3>Available</h3>
              <div className="kpi-value">{snapshot.totals.available}</div>
              <p className="muted small">total − occupied − committed</p>
            </div>
            <div className="card kpi-card">
              <h3>Weight Available</h3>
              <div className="kpi-value">{snapshot.weight.available.toFixed(0)} kg</div>
              <p className="muted small">of {snapshot.weight.total.toFixed(0)} kg budgeted</p>
            </div>
            <div className="card kpi-card">
              <h3>Space Available</h3>
              <div className="kpi-value">{snapshot.space.available.toFixed(1)} m³</div>
              <p className="muted small">of {snapshot.space.total.toFixed(1)} m³ dimensioned</p>
            </div>
          </div>

          <h3>By Capacity Unit</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Capacity Unit</th>
                  <th>Total</th>
                  <th>Occupied</th>
                  <th>Committed (est.)</th>
                  <th>Available</th>
                  <th>Expected Release (est.)</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.byCapacityUnit.map((u) => (
                  <tr key={u.capacityUnit}>
                    <td>{u.capacityUnit}</td>
                    <td>{u.total}</td>
                    <td>{u.occupied}</td>
                    <td>{u.committed}</td>
                    <td>{u.available}</td>
                    <td>{snapshot.expectedReleaseByUnit.get(u.capacityUnit) || 0}</td>
                  </tr>
                ))}
                {snapshot.byCapacityUnit.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No storage locations configured for this warehouse yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Committed/Expected Release are grouped by matching each cargo line's package type against the Package Types master
            (Warehouse Management → Package Types); an unmatched type is grouped as "Ungrouped".
          </p>

          <h3>Projected Availability</h3>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="form-row" style={{ maxWidth: 180, marginBottom: 0 }}>
              <label>From date</label>
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div className="form-row" style={{ maxWidth: 140, marginBottom: 0 }}>
              <label>Days</label>
              <input type="number" min="1" max="60" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value) || 1)} />
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {projectionUnits.map((u) => (
                    <th key={u}>{u}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projection.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    {projectionUnits.map((u) => {
                      const entry = row.byCapacityUnit.find((e) => e.capacityUnit === u);
                      return <td key={u}>{entry ? entry.available : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
