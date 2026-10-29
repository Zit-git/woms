import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/Modal';
import { newestOnly } from '../../lib/latest';
import {
  listWarehouses,
  createWarehouse,
  editWarehouse,
  removeWarehouse,
  listZonesByWarehouse,
  createZone,
  removeZone,
  listAislesByZone,
  createAisle,
  removeAisle,
  listRacksByAisle,
  createRack,
  removeRack,
  listLocationsByRack,
  createLocation,
  editLocation,
  removeLocation,
  listPackageTypes,
  createPackageType,
  removePackageType,
  editPackageType,
  countPackageTypeUsage,
  getWarehouseMap,
  listHusInLocation,
  listCapacityLocations,
  listCapacityCargo,
  listCapacityOutboundCommitments,
} from '../../lib/api';
import { todayStr, addDays } from '../../lib/dates';
import { computeCapacity, projectAvailability } from '../../lib/capacity';
import { useAuth } from '../../context/AuthContext';
import { accessibleWarehouses, scopeByWarehouse } from '../../lib/access';
import { fixed2, decimal2 } from '../../lib/format';
import RackLevels from '../../components/RackLevels';
import { locationLabelsPath } from '../../lib/labels';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/usePagination';
import { CAPACITY_UNITS, validatePackageType } from '../../lib/packageTypes';

const TABS = ['Warehouses', 'Zones', 'Aisles', 'Racks', 'Storage Locations', 'Package Types', 'Map', 'Availability'];
const LOCATION_STATUSES = ['Available', 'Reserved', 'Blocked'];

function useList(loader, deps) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requests = useRef(newestOnly());

  // Only the newest request may fill the screen: when the choice changes (another warehouse) an older,
  // slower answer must not land afterwards and show the wrong warehouse's data under the right name.
  const reload = () => {
    if (!loader) return;
    const mine = requests.current.start();
    setLoading(true);
    setError('');
    loader()
      .then((rows) => requests.current.isNewest(mine) && setItems(rows))
      .catch((err) => requests.current.isNewest(mine) && setError(err.message || String(err)))
      .finally(() => requests.current.isNewest(mine) && setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);

  return { items, loading, error, reload };
}

// This module has its own warehouse choices, so the sidebar's working-warehouse
// selection is ignored here.
const ignoringSidebarChoice = (viewer) => ({ ...viewer, activeWarehouseId: '' });

// Warehouses the signed-in user may see (all of them for a System Administrator).
function useMyWarehouses() {
  const { viewer } = useAuth();
  return useList(() => listWarehouses().then((w) => accessibleWarehouses(ignoringSidebarChoice(viewer), w)), [viewer]);
}

function WarehousesTab() {
  const { isAdmin } = useAuth();
  const { items, loading, error, reload } = useMyWarehouses();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    createWarehouse({ name, address: address || undefined, status: 'Active' }).then(() => {
      setName('');
      setAddress('');
      reload();
    });
  };

  const startEdit = (w) => {
    setEditingId(w.ROWID);
    setEditForm({ name: w.name, address: w.address || '', status: w.status || 'Active' });
  };

  const saveEdit = () => {
    setBusyId(editingId);
    editWarehouse({ ROWID: editingId, ...editForm })
      .then(() => setEditingId(null))
      .finally(() => {
        setBusyId(null);
        reload();
      });
  };

  const pager = usePagination(items);

  return (
    <div>
      {isAdmin && <form className="card" onSubmit={add}>
        <h3>Add Warehouse</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ maxWidth: 300 }}>
            <label>Warehouse name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rotterdam DC" />
          </div>
          <div className="form-row" style={{ maxWidth: 300 }}>
            <label>Address (optional)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Havenweg 12, Rotterdam" />
          </div>
        </div>
        <button className="btn" type="submit">
          + Add Warehouse
        </button>
      </form>}
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((w) =>
              editingId === w.ROWID ? (
                <tr key={w.ROWID}>
                  <td>
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </td>
                  <td>
                    <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                  </td>
                  <td>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </td>
                  <td>
                    <button className="link-btn" onClick={saveEdit} disabled={busyId === w.ROWID}>
                      Save
                    </button>{' '}
                    <button className="link-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={w.ROWID}>
                  <td>{w.name}</td>
                  <td>{w.address}</td>
                  <td>
                    <span className="status-badge">{w.status}</span>
                  </td>
                  <td>
                    <button className="link-btn" onClick={() => startEdit(w)}>
                      Edit
                    </button>{' '}
                    {isAdmin && (
                      <button
                        className="link-btn"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => removeWarehouse(w.ROWID).then(reload)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No warehouses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}


// Capacity (the numbers configured on each Storage Location) is static
// warehouse setup; Availability is the live, time-dependent state computed
// from it -- "Today" is the real, exact current state; "Date range" projects
// that same math forward (lib/capacity.js's computeCapacity(asOfDate)), one
// control switching between the two rather than two disconnected sections.
function AvailabilityTab() {
  const { viewer } = useAuth();
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [viewMode, setViewMode] = useState('today'); // 'today' | 'range'
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
    Promise.all([listCapacityLocations(), listCapacityCargo(), listCapacityOutboundCommitments(), listPackageTypes()])
      .then(([l, c, o, p]) => {
        // Capacity is only ever shown for the user's own warehouses.
        setLocations(scopeByWarehouse(ignoringSidebarChoice(viewer), l));
        setCargoRows(scopeByWarehouse(ignoringSidebarChoice(viewer), c));
        setOutboundCommitments(scopeByWarehouse(ignoringSidebarChoice(viewer), o));
        setPackageTypes(p);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  // Today = the real, ground-truth state (no asOfDate -- exactly what's in
  // the database right now, not a simulation).
  const snapshot = useMemo(
    () => computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId }),
    [locations, cargoRows, outboundCommitments, packageTypes, warehouseId]
  );
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

  // Date range = the same math, simulated forward one day at a time.
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
        <p className="muted small" style={{ margin: 0 }}>
          Capacity-unit totals and row counts are exact; per-unit amounts depend on matching each item against Package Types. Weight
          and Space are computed straight from real weights/dimensions instead, but only count locations that have that data set.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>View</label>
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="today">Today</option>
              <option value="range">Date range</option>
            </select>
          </div>
          <div className="form-row" style={{ maxWidth: 260, marginBottom: 0 }}>
            <label>Warehouse</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">All warehouses (consolidated)</option>
              {warehouses.map((w) => (
                <option key={w.ROWID} value={w.ROWID}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'range' && (
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
      )}

      {error && <div className="error-text">{error}</div>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : viewMode === 'range' ? (
        <>
          <h3 style={{ marginTop: 0 }}>
            Projected Availability{warehouseId ? `: ${warehouses.find((w) => String(w.ROWID) === String(warehouseId))?.name || ''}` : ' — All Warehouses'}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {projectionUnits.map((u) => (
                    <th key={u}>{u} Avail.</th>
                  ))}
                  <th>Weight Avail. (kg)</th>
                  <th>Space Avail. (m³)</th>
                  <th>Unclaimed</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    {projectionUnits.map((u) => {
                      const entry = row.byCapacityUnit.find((e) => e.capacityUnit === u);
                      return <td key={u}>{entry ? fixed2(entry.available) : '—'}</td>;
                    })}
                    <td>{fixed2(row.weight.available)}</td>
                    <td>{fixed2(row.space.available)}</td>
                    <td>{fixed2(row.totals.unclaimedAvailable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            A committed inbound starts consuming capacity on its expected arrival date; a scheduled dispatch frees its capacity back up
            on its planned date. Pending Put-away isn't projected -- it depends on staff action, not a scheduled event.
          </p>
        </>
      ) : !warehouseId ? (
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
              <div className="kpi-value">{fixed2(overallSnapshot.totals.total)}</div>
              <p className="muted small">all capacity units</p>
            </div>
            <div className="card kpi-card">
              <h3>Physical Occupancy</h3>
              <div className="kpi-value">{fixed2(overallSnapshot.totals.occupied)}</div>
              <p className="muted small">capacity units currently consumed</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Put-away</h3>
              <div className="kpi-value">{overallSnapshot.pendingPutaway}</div>
              <p className="muted small">received, not yet shelved</p>
            </div>
            <div className="card kpi-card">
              <h3>Available</h3>
              <div className="kpi-value">{fixed2(overallSnapshot.totals.available)}</div>
              <p className="muted small">total − occupied − committed − on dock</p>
            </div>
            <div className="card kpi-card">
              <h3>Unclaimed</h3>
              <div className="kpi-value">{fixed2(overallSnapshot.totals.unclaimedAvailable)}</div>
              <p className="muted small">free and not dedicated to any customer</p>
            </div>
            <div className="card kpi-card">
              <h3>Weight Available</h3>
              <div className="kpi-value">{fixed2(overallSnapshot.weight.available)} kg</div>
              <p className="muted small">of {fixed2(overallSnapshot.weight.total)} kg budgeted</p>
            </div>
            <div className="card kpi-card">
              <h3>Space Available</h3>
              <div className="kpi-value">{fixed2(overallSnapshot.space.available)} m³</div>
              <p className="muted small">of {fixed2(overallSnapshot.space.total)} m³ dimensioned</p>
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
                  <th>Unclaimed</th>
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
                    <td>{fixed2(s.totals.total)}</td>
                    <td>{fixed2(s.totals.occupied)}</td>
                    <td>{s.pendingPutaway}</td>
                    <td>{fixed2(s.totals.committed)}</td>
                    <td>{fixed2(s.totals.available)}</td>
                    <td>{fixed2(s.totals.unclaimedAvailable)}</td>
                    <td>{fixed2(s.weight.available)}</td>
                    <td>{fixed2(s.space.available)}</td>
                    <td>
                      <span className="link-btn">View detail</span>
                    </td>
                  </tr>
                ))}
                {perWarehouse.length === 0 && (
                  <tr>
                    <td colSpan={11} className="muted">
                      No warehouses configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>Warehouse Detail: {warehouses.find((w) => String(w.ROWID) === String(warehouseId))?.name || '—'}</h3>
            <button className="link-btn" onClick={() => setWarehouseId('')}>
              &larr; All Warehouses
            </button>
          </div>
          <div className="card-grid">
            <div className="card kpi-card">
              <h3>Total Capacity</h3>
              <div className="kpi-value">{fixed2(snapshot.totals.total)}</div>
              <p className="muted small">all capacity units</p>
            </div>
            <div className="card kpi-card">
              <h3>Physical Occupancy</h3>
              <div className="kpi-value">{fixed2(snapshot.totals.occupied)}</div>
              <p className="muted small">capacity units currently consumed</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Put-away</h3>
              <div className="kpi-value">{snapshot.pendingPutaway}</div>
              <p className="muted small">received, not yet shelved</p>
            </div>
            <div className="card kpi-card">
              <h3>Committed (est.)</h3>
              <div className="kpi-value">{fixed2(snapshot.totals.committed)}</div>
              <p className="muted small">accepted, not yet arrived</p>
            </div>
            <div className="card kpi-card">
              <h3>Available</h3>
              <div className="kpi-value">{fixed2(snapshot.totals.available)}</div>
              <p className="muted small">total − occupied − committed − on dock</p>
            </div>
            <div className="card kpi-card">
              <h3>Unclaimed</h3>
              <div className="kpi-value">{fixed2(snapshot.totals.unclaimedAvailable)}</div>
              <p className="muted small">free and not dedicated to any customer</p>
            </div>
            <div className="card kpi-card">
              <h3>Weight Available</h3>
              <div className="kpi-value">{fixed2(snapshot.weight.available)} kg</div>
              <p className="muted small">of {fixed2(snapshot.weight.total)} kg budgeted</p>
            </div>
            <div className="card kpi-card">
              <h3>Space Available</h3>
              <div className="kpi-value">{fixed2(snapshot.space.available)} m³</div>
              <p className="muted small">of {fixed2(snapshot.space.total)} m³ dimensioned</p>
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
                  <th>Unclaimed</th>
                  <th>Expected Release (est.)</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.byCapacityUnit.map((u) => (
                  <tr key={u.capacityUnit}>
                    <td>{u.capacityUnit}</td>
                    <td>{fixed2(u.total)}</td>
                    <td>{fixed2(u.occupied)}</td>
                    <td>{fixed2(u.committed)}</td>
                    <td>{fixed2(u.available)}</td>
                    <td>{fixed2(u.unclaimedAvailable)}</td>
                    <td>{fixed2(snapshot.expectedReleaseByUnit.get(u.capacityUnit) || 0)}</td>
                  </tr>
                ))}
                {snapshot.byCapacityUnit.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No storage locations configured for this warehouse yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Committed/Expected Release are grouped by matching each cargo line's package type against the Package Types master
            (Package Types tab); an unmatched type is grouped as "Ungrouped". Unclaimed excludes any location already dedicated to a
            customer, even if it has room left. Switch the View dropdown above to "Date range" to project these same figures forward.
          </p>
        </>
      )}
    </div>
  );
}

function ZonesTab() {
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { items, loading, error, reload } = useList(
    warehouseId ? () => listZonesByWarehouse(warehouseId) : null,
    [warehouseId]
  );
  const [name, setName] = useState('');
  const [zoneType, setZoneType] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (e) => {
    e.preventDefault();
    if (!name.trim() || !warehouseId) return;
    createZone({ name, zone_type: zoneType, warehouse_id: warehouseId }).then(() => {
      setName('');
      setZoneType('');
      reload();
    });
  };

  const pager = usePagination(items);

  return (
    <div>
      <div className="form-row" style={{ maxWidth: 300 }}>
        <label>Warehouse</label>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.ROWID} value={w.ROWID}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <form className="card" onSubmit={add}>
        <h3>Add Zone</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Zone name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cold Storage" />
          </div>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Zone type</label>
            <input value={zoneType} onChange={(e) => setZoneType(e.target.value)} placeholder="e.g. Ambient" />
          </div>
        </div>
        <button className="btn" type="submit" disabled={!warehouseId}>
          + Add Zone
        </button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((z) => (
              <tr key={z.ROWID}>
                <td>{z.name}</td>
                <td>{z.zone_type}</td>
                <td>
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => removeZone(z.ROWID).then(reload)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No zones for this warehouse yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}

function AislesTab() {
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { items: zones } = useList(warehouseId ? () => listZonesByWarehouse(warehouseId) : null, [warehouseId]);
  const [zoneId, setZoneId] = useState('');
  const { items, loading, error, reload } = useList(zoneId ? () => listAislesByZone(zoneId) : null, [zoneId]);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setZoneId(zones[0]?.ROWID || '');
  }, [zones]);

  const add = (e) => {
    e.preventDefault();
    if (!name.trim() || !zoneId) return;
    createAisle({ name, zone_id: zoneId }).then(() => {
      setName('');
      reload();
    });
  };

  const pager = usePagination(items);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div className="form-row" style={{ maxWidth: 260 }}>
          <label>Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.ROWID} value={w.ROWID}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 260 }}>
          <label>Zone</label>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.ROWID} value={z.ROWID}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form className="card" onSubmit={add}>
        <h3>Add Aisle</h3>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Aisle name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aisle 1" />
        </div>
        <button className="btn" type="submit" disabled={!zoneId}>
          + Add Aisle
        </button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((a) => (
              <tr key={a.ROWID}>
                <td>{a.name}</td>
                <td>
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => removeAisle(a.ROWID).then(reload)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No aisles for this zone yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}

function RacksTab() {
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { items: zones } = useList(warehouseId ? () => listZonesByWarehouse(warehouseId) : null, [warehouseId]);
  const [zoneId, setZoneId] = useState('');
  const { items: aisles } = useList(zoneId ? () => listAislesByZone(zoneId) : null, [zoneId]);
  const [aisleId, setAisleId] = useState('');
  const { items, loading, error, reload } = useList(aisleId ? () => listRacksByAisle(aisleId) : null, [aisleId]);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setZoneId(zones[0]?.ROWID || '');
  }, [zones]);
  useEffect(() => {
    setAisleId(aisles[0]?.ROWID || '');
  }, [aisles]);

  const add = (e) => {
    e.preventDefault();
    if (!code.trim() || !aisleId) return;
    createRack({ code, aisle_id: aisleId }).then(() => {
      setCode('');
      reload();
    });
  };

  const pager = usePagination(items);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.ROWID} value={w.ROWID}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Zone</label>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.ROWID} value={z.ROWID}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Aisle</label>
          <select value={aisleId} onChange={(e) => setAisleId(e.target.value)}>
            {aisles.map((a) => (
              <option key={a.ROWID} value={a.ROWID}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form className="card" onSubmit={add}>
        <h3>Add Rack</h3>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Rack code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. A-01" />
        </div>
        <button className="btn" type="submit" disabled={!aisleId}>
          + Add Rack
        </button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((r) => (
              <tr key={r.ROWID}>
                <td>{r.code}</td>
                <td>
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => removeRack(r.ROWID).then(reload)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No racks for this zone yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}

function LocationsTab() {
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const { items: zones } = useList(warehouseId ? () => listZonesByWarehouse(warehouseId) : null, [warehouseId]);
  const [zoneId, setZoneId] = useState('');
  const { items: aisles } = useList(zoneId ? () => listAislesByZone(zoneId) : null, [zoneId]);
  const [aisleId, setAisleId] = useState('');
  const { items: racks } = useList(aisleId ? () => listRacksByAisle(aisleId) : null, [aisleId]);
  const [rackId, setRackId] = useState('');
  const { items, loading, error, reload } = useList(rackId ? () => listLocationsByRack(rackId) : null, [rackId]);
  const [locationCode, setLocationCode] = useState('');
  const [capacity, setCapacity] = useState('');
  const [capacityUnit, setCapacityUnit] = useState(CAPACITY_UNITS[0]);
  const [locationType, setLocationType] = useState('');
  const [maxWeightKg, setMaxWeightKg] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bay, setBay] = useState('');
  const [rackLevel, setRackLevel] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setZoneId(zones[0]?.ROWID || '');
  }, [zones]);
  useEffect(() => {
    setAisleId(aisles[0]?.ROWID || '');
  }, [aisles]);
  useEffect(() => {
    setRackId(racks[0]?.ROWID || '');
  }, [racks]);

  const add = (e) => {
    e.preventDefault();
    if (!locationCode.trim() || !rackId) return;
    createLocation({
      location_code: locationCode,
      capacity: capacity ? Number(capacity) : undefined,
      capacity_unit: capacityUnit,
      location_type: locationType || undefined,
      max_weight_kg: maxWeightKg ? Number(maxWeightKg) : undefined,
      length_cm: lengthCm ? Number(lengthCm) : undefined,
      width_cm: widthCm ? Number(widthCm) : undefined,
      height_cm: heightCm ? Number(heightCm) : undefined,
      bay: bay ? Number(bay) : undefined,
      rack_level: rackLevel ? Number(rackLevel) : undefined,
      occupancy_status: 'Available',
      rack_id: rackId,
    }).then(() => {
      setLocationCode('');
      setCapacity('');
      setLocationType('');
      setMaxWeightKg('');
      setLengthCm('');
      setWidthCm('');
      setHeightCm('');
      setBay('');
      setRackLevel('');
      reload();
    });
  };

  const setStatus = (locationId, status) => editLocation({ ROWID: locationId, occupancy_status: status }).then(reload);
  // Bay (position along the rack) and level (height; 1 = floor) are optional
  // and editable in place, so existing locations can be filled in over time.
  const setPosition = (locationId, field, value) =>
    editLocation({ ROWID: locationId, [field]: value === '' ? null : Number(value) }).then(reload);
  const byPosition = [...items].sort(
    (a, b) => (Number(a.bay) || 0) - (Number(b.bay) || 0) || (Number(a.rack_level) || 0) - (Number(b.rack_level) || 0) || String(a.location_code).localeCompare(String(b.location_code))
  );

  const pager = usePagination(byPosition);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="form-row" style={{ maxWidth: 200 }}>
          <label>Warehouse</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.ROWID} value={w.ROWID}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 200 }}>
          <label>Zone</label>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.ROWID} value={z.ROWID}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 200 }}>
          <label>Aisle</label>
          <select value={aisleId} onChange={(e) => setAisleId(e.target.value)}>
            {aisles.map((a) => (
              <option key={a.ROWID} value={a.ROWID}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ maxWidth: 200 }}>
          <label>Rack</label>
          <select value={rackId} onChange={(e) => setRackId(e.target.value)}>
            {racks.map((r) => (
              <option key={r.ROWID} value={r.ROWID}>
                {r.code}
              </option>
            ))}
          </select>
        </div>
        {warehouseId && (
          <div className="form-row" style={{ alignSelf: 'flex-end' }}>
            <a className="btn secondary" href={locationLabelsPath(import.meta.env.BASE_URL, { warehouse: warehouseId })} target="_blank" rel="noreferrer">
              Print position labels (warehouse)
            </a>{' '}
            {rackId && (
              <a className="link-btn" href={locationLabelsPath(import.meta.env.BASE_URL, { warehouse: warehouseId, rack: rackId })} target="_blank" rel="noreferrer">
                this rack only
              </a>
            )}
          </div>
        )}
      </div>

      <form className="card" onSubmit={add}>
        <h3>Add Storage Location</h3>
        <div className="form-grid-3">
          <div className="form-row">
            <label>Location code</label>
            <input value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="e.g. A-01-01" />
          </div>
          <div className="form-row">
            <label>Location type</label>
            <input value={locationType} onChange={(e) => setLocationType(e.target.value)} placeholder="e.g. Pallet Rack" />
          </div>
          <div className="form-row">
            <label>Capacity</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div className="form-row">
            <label>Capacity unit</label>
            <select value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)}>
              {CAPACITY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Bay (position along rack)</label>
            <input type="number" min="1" value={bay} onChange={(e) => setBay(e.target.value)} placeholder="Optional, e.g. 3" />
          </div>
          <div className="form-row">
            <label>Level (1 = floor)</label>
            <input type="number" min="1" value={rackLevel} onChange={(e) => setRackLevel(e.target.value)} placeholder="Optional, e.g. 2" />
          </div>
          <div className="form-row">
            <label>Max weight (kg)</label>
            <input type="number" value={maxWeightKg} onChange={(e) => setMaxWeightKg(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-row">
            <label>Length (cm)</label>
            <input type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-row">
            <label>Width (cm)</label>
            <input type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-row">
            <label>Height (cm)</label>
            <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <button className="btn" type="submit" disabled={!rackId}>
          + Add Location
        </button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
        <table>
          <thead>
            <tr>
              <th>Location Code</th>
              <th>Bay</th>
              <th>Level</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Dimensions (L×W×H cm)</th>
              <th>Max Weight</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.location_code}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    style={{ width: 60 }}
                    defaultValue={l.bay ?? ''}
                    key={`bay-${l.ROWID}-${l.bay}`}
                    onBlur={(e) => e.target.value !== String(l.bay ?? '') && setPosition(l.ROWID, 'bay', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    style={{ width: 60 }}
                    defaultValue={l.rack_level ?? ''}
                    key={`lvl-${l.ROWID}-${l.rack_level}`}
                    onBlur={(e) => e.target.value !== String(l.rack_level ?? '') && setPosition(l.ROWID, 'rack_level', e.target.value)}
                  />
                </td>
                <td>{l.location_type || <span className="muted">—</span>}</td>
                <td>{decimal2(l.capacity)} {l.capacity_unit && <span className="muted small">{l.capacity_unit}</span>}</td>
                <td>{l.length_cm && l.width_cm && l.height_cm ? `${l.length_cm}×${l.width_cm}×${l.height_cm}` : <span className="muted">—</span>}</td>
                <td>{l.max_weight_kg ? `${decimal2(l.max_weight_kg)} kg` : <span className="muted">—</span>}</td>
                <td>
                  <select value={LOCATION_STATUSES.includes(l.occupancy_status) ? l.occupancy_status : 'Available'} onChange={(e) => setStatus(l.ROWID, e.target.value)}>
                    {LOCATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="link-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => removeLocation(l.ROWID).then(reload)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No storage locations for this rack yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}

function WarehouseMapTab() {
  const { items: warehouses } = useMyWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [picked, setPicked] = useState(null); // { loc, path } of the position whose popup is open
  const { items: zoneMap, loading, error, reload } = useList(
    warehouseId ? () => getWarehouseMap(warehouseId) : null,
    [warehouseId]
  );

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLocations = zoneMap.reduce(
    (n, z) => n + z.aisles.reduce((an, a) => an + a.racks.reduce((rn, r) => rn + r.locations.length, 0), 0),
    0
  );
  const totalOccupied = zoneMap.reduce(
    (n, z) =>
      n + z.aisles.reduce((an, a) => an + a.racks.reduce((rn, r) => rn + r.locations.filter((l) => l.occupied).length, 0), 0),
    0
  );

  return (
    <div>
      <div className="form-row" style={{ maxWidth: 300 }}>
        <label>Warehouse</label>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.ROWID} value={w.ROWID}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar">
        <div className="warehouse-map-legend">
          <span>
            <i className="legend-swatch legend-empty" /> Empty
          </span>
          <span>
            <i className="legend-swatch legend-occupied" /> Occupied
          </span>
        </div>
        {!loading && <span className="muted small">{totalOccupied} of {totalLocations} locations occupied</span>}
        {warehouseId && (
          <a className="link-btn" href={locationLabelsPath(import.meta.env.BASE_URL, { warehouse: warehouseId })} target="_blank" rel="noreferrer">
            Print position labels
          </a>
        )}
        <button className="link-btn" onClick={reload}>
          Refresh
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : zoneMap.length === 0 ? (
        <p className="muted">No zones configured for this warehouse yet.</p>
      ) : (
        zoneMap.map(({ zone, aisles }) => (
          <div className="warehouse-zone" key={zone.ROWID}>
            <h3>
              {zone.name} {zone.zone_type && <span className="muted small">({zone.zone_type})</span>}
            </h3>
            {aisles.length === 0 && <p className="muted small">No aisles in this zone.</p>}
            {aisles.map(({ aisle, racks }) => (
              <div key={aisle.ROWID} style={{ marginBottom: 12 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>{aisle.name}</div>
                {racks.length === 0 && <p className="muted small">No racks in this aisle.</p>}
                {racks.map(({ rack, locations }) => (
                  <div className="warehouse-rack" key={rack.ROWID}>
                    <div className="warehouse-rack-label">{rack.code}</div>
                    <div className="warehouse-rack-locations">
                      <RackLevels locations={locations} onPick={(loc) => setPicked({ loc, path: `${zone.name} / ${aisle.name} / ${rack.code}` })} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
      {picked && <LocationPopup location={picked.loc} path={picked.path} warehouseId={warehouseId} onClose={() => setPicked(null)} />}
    </div>
  );
}

// What is in one position: the position itself, and each Handling Unit in it with its contents.
function LocationPopup({ location, path, warehouseId, onClose }) {
  const [hus, setHus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    listHusInLocation(location.ROWID)
      .then((rows) => live && setHus(rows))
      .catch((err) => live && setError(err.message || String(err)));
    return () => {
      live = false;
    };
  }, [location.ROWID]);
  const dims = (o) => (o.length_cm && o.width_cm && o.height_cm ? `${o.length_cm} × ${o.width_cm} × ${o.height_cm} cm` : null);
  const day = (v) => (v ? String(v).slice(0, 10) : null);

  return (
    <Modal title={`${location.location_code}`} onClose={onClose} wide>
      <p className="muted small" style={{ marginTop: -8 }}>
        {path}
        {location.bay ? ` · Bay ${location.bay}` : ''}
        {location.rack_level ? ` · Level ${location.rack_level}` : ''}
      </p>
      {warehouseId && (
        <p style={{ marginTop: -4 }}>
          <a className="link-btn" href={locationLabelsPath(import.meta.env.BASE_URL, { warehouse: warehouseId, position: location.ROWID })} target="_blank" rel="noreferrer">
            Print this position's label
          </a>
        </p>
      )}
      <div className="summary-strip">
        <div>
          <div className="muted small">Status</div>
          <div className="summary-value">{location.occupied ? 'Occupied' : 'Empty'}</div>
        </div>
        <div>
          <div className="muted small">Capacity</div>
          <div className="summary-value">
            {decimal2(location.capacity)} <span className="muted small">{location.capacity_unit || ''}</span>
          </div>
        </div>
        <div>
          <div className="muted small">Max weight</div>
          <div className="summary-value">{location.max_weight_kg ? `${decimal2(location.max_weight_kg)} kg` : '—'}</div>
        </div>
        <div>
          <div className="muted small">Size</div>
          <div className="summary-value small">{dims(location) || '—'}</div>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      <div className="form-section-title">Handling Units here</div>
      {!hus && !error && <p className="muted">Loading...</p>}
      {hus && hus.length === 0 && <p className="muted">Nothing is stored in this position.</p>}
      {(hus || []).map((h) => (
        <div className="card hu-card" key={h.ROWID}>
          <div className="toolbar" style={{ marginBottom: 6 }}>
            <strong>
              {h.outer_package_no ? `HU ${h.outer_package_no} · ` : ''}
              {h.description || 'Handling Unit'}
            </strong>
            <Link className="link-btn" to={`/cargo/${h.ROWID}`}>
              Open full record →
            </Link>
          </div>
          <div className="hu-facts">
            <span>
              <span className="muted small">Customer</span> {h.customer_name || '—'}
            </span>
            <span>
              <span className="muted small">Inbound</span> {h.inbound_reference || '—'}
            </span>
            <span>
              <span className="muted small">Type</span> {h.qty ? `${h.qty} ` : ''}
              {h.unit || '—'}
            </span>
            <span>
              <span className="muted small">Weight</span> {h.weight ? `${decimal2(h.weight)} kg` : '—'}
            </span>
            <span>
              <span className="muted small">Size</span> {dims(h) || '—'}
            </span>
            <span>
              <span className="muted small">Here since</span> {day(h.since) || '—'}
            </span>
            <span>
              <span className="muted small">Status</span> <span className="status-badge">{h.status}</span>
            </span>
            <span>
              <span className="muted small">QR</span> {h.qr_code || '—'}
            </span>
          </div>
          {h.contents.length > 0 && (
            <ul className="hu-contents">
              {h.contents.map((c, i) => (
                <li key={i}>
                  {c.qty} × {c.description || 'Line item'} {c.unit ? <span className="muted small">({c.unit})</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function PackageTypesTab() {
  const { items, loading, error, reload } = useList(listPackageTypes, []);
  const pager = usePagination(items);
  const [name, setName] = useState('');
  const [capacityUnit, setCapacityUnit] = useState(CAPACITY_UNITS[0]);
  const [unitsPerItem, setUnitsPerItem] = useState('1');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [usage, setUsage] = useState(null); // { hus, lines, total } for the type being edited; null while it is being counted
  const [busyId, setBusyId] = useState(null);

  const add = (e) => {
    e.preventDefault();
    const problem = validatePackageType({ name, units_per_item: unitsPerItem }, items);
    setFormError(problem);
    if (problem) return;
    createPackageType({ name: name.trim(), capacity_unit: capacityUnit, units_per_item: Number(unitsPerItem), status: 'Active' })
      .then(() => {
        setName('');
        setUnitsPerItem('1');
        reload();
      })
      .catch((err) => setFormError(err.message || String(err)));
  };

  const startEdit = (p) => {
    setFormError('');
    setEditingId(p.ROWID);
    setEditForm({ name: p.name || '', capacity_unit: p.capacity_unit || CAPACITY_UNITS[0], units_per_item: String(p.units_per_item ?? 1), status: p.status || 'Active' });
    setUsage(null);
    countPackageTypeUsage(p.name)
      .then(setUsage)
      .catch(() => setUsage({ hus: 0, lines: 0, total: 0, unknown: true }));
  };

  const stopEdit = () => {
    setEditingId(null);
    setFormError('');
  };

  const saveEdit = () => {
    const problem = validatePackageType(editForm, items, editingId);
    setFormError(problem);
    if (problem) return;
    setBusyId(editingId);
    editPackageType({
      ROWID: editingId,
      name: editForm.name.trim(),
      capacity_unit: editForm.capacity_unit,
      units_per_item: Number(editForm.units_per_item),
      status: editForm.status,
    })
      .then(() => {
        stopEdit();
        reload();
      })
      .catch((err) => setFormError(err.message || String(err)))
      .finally(() => setBusyId(null));
  };

  // The name is how goods find their type, so it is fixed while goods carry it (and until that count is known).
  const nameLocked = !usage || usage.total > 0 || usage.unknown;
  const unitOptions = (current) => (CAPACITY_UNITS.includes(current) || !current ? CAPACITY_UNITS : [...CAPACITY_UNITS, current]);

  return (
    <div>
      <form className="card" onSubmit={add}>
        <h3>Add Package / Handling-Unit Type</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pallet" />
          </div>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Consumes capacity unit</label>
            <select value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)}>
              {CAPACITY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row" style={{ maxWidth: 160 }}>
            <label>Units per item</label>
            <input type="number" min="0" step="0.01" value={unitsPerItem} onChange={(e) => setUnitsPerItem(e.target.value)} />
          </div>
        </div>
        <button className="btn" type="submit">
          + Add Type
        </button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {formError && (
        <div className="error-text" role="alert">
          {formError}
        </div>
      )}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Capacity Unit</th>
                <th>Units / Item</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((p) =>
                editingId === p.ROWID ? (
                  <tr key={p.ROWID}>
                    <td>
                      <input
                        aria-label="Name"
                        value={editForm.name}
                        disabled={nameLocked}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                      {usage && usage.total > 0 && (
                        <div className="muted small">
                          In use by {usage.hus} Handling Unit{usage.hus === 1 ? '' : 's'} and {usage.lines} line item{usage.lines === 1 ? '' : 's'}, so the name stays as it is. Goods are matched to their type by name.
                        </div>
                      )}
                      {usage && usage.unknown && <div className="muted small">Could not check where this type is used, so the name stays as it is.</div>}
                      {!usage && <div className="muted small">Checking where this type is used...</div>}
                    </td>
                    <td>
                      <select aria-label="Capacity unit" value={editForm.capacity_unit} onChange={(e) => setEditForm({ ...editForm, capacity_unit: e.target.value })}>
                        {unitOptions(editForm.capacity_unit).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label="Units per item"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.units_per_item}
                        onChange={(e) => setEditForm({ ...editForm, units_per_item: e.target.value })}
                      />
                      {usage && usage.total > 0 && <div className="muted small">Changes the capacity used by goods already in the warehouse.</div>}
                    </td>
                    <td>
                      <select aria-label="Status" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                    <td>
                      <button className="link-btn" onClick={saveEdit} disabled={busyId === p.ROWID}>
                        Save
                      </button>{' '}
                      <button className="link-btn" onClick={stopEdit}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.ROWID}>
                    <td>{p.name}</td>
                    <td>{p.capacity_unit || <span className="muted">—</span>}</td>
                    <td>{decimal2(p.units_per_item ?? 1)}</td>
                    <td>
                      <span className="status-badge">{p.status}</span>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => startEdit(p)}>
                        Edit
                      </button>{' '}
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => removePackageType(p.ROWID).then(reload)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No package types configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination pager={pager} />
        </>
      )}
    </div>
  );
}

export default function WarehouseConfig() {
  const { isAdmin } = useAuth();
  // Only a System Administrator configures the warehouse structure; everyone else with
  // access to this module just sees Availability for their own warehouses.
  const tabs = isAdmin ? TABS : ['Availability'];
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div>
      <h2>Warehouse Management</h2>
      <div className="tabs">
        {tabs.map((t) => (
          <div key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>
      {tab === 'Warehouses' && <WarehousesTab />}
      {tab === 'Zones' && <ZonesTab />}
      {tab === 'Aisles' && <AislesTab />}
      {tab === 'Racks' && <RacksTab />}
      {tab === 'Storage Locations' && <LocationsTab />}
      {tab === 'Package Types' && <PackageTypesTab />}
      {tab === 'Map' && <WarehouseMapTab />}
      {tab === 'Availability' && <AvailabilityTab />}
    </div>
  );
}
