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
            Physical occupancy is exact; Committed and Expected Release are estimates (see note below).
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
          <div className="card-grid">
            <div className="card kpi-card">
              <h3>Total Capacity</h3>
              <div className="kpi-value">{snapshot.totals.total}</div>
              <p className="muted small">all capacity units</p>
            </div>
            <div className="card kpi-card">
              <h3>Physical Occupancy</h3>
              <div className="kpi-value">{snapshot.totals.occupied}</div>
              <p className="muted small">locations currently occupied</p>
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
