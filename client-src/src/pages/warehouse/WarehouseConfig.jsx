import { useEffect, useState } from 'react';
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
  getWarehouseMap,
} from '../../lib/api';

const TABS = ['Warehouses', 'Zones', 'Aisles', 'Racks', 'Storage Locations', 'Package Types', 'Map'];
const CAPACITY_UNITS = ['Pallet Positions', 'Cartons', 'Crates', 'm²', 'm³', 'Other'];
const LOCATION_STATUSES = ['Available', 'Reserved', 'Blocked'];

function useList(loader, deps) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = () => {
    if (!loader) return;
    setLoading(true);
    loader()
      .then(setItems)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);

  return { items, loading, error, reload };
}

function WarehousesTab() {
  const { items, loading, error, reload } = useList(listWarehouses, []);
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

  return (
    <div>
      <form className="card" onSubmit={add}>
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
      </form>
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
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
            {items.map((w) =>
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
                    <button
                      className="link-btn"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeWarehouse(w.ROWID).then(reload)}
                    >
                      Delete
                    </button>
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
      )}
    </div>
  );
}

function ZonesTab() {
  const { items: warehouses } = useList(listWarehouses, []);
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
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((z) => (
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
      )}
    </div>
  );
}

function AislesTab() {
  const { items: warehouses } = useList(listWarehouses, []);
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
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
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
      )}
    </div>
  );
}

function RacksTab() {
  const { items: warehouses } = useList(listWarehouses, []);
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
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
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
      )}
    </div>
  );
}

function LocationsTab() {
  const { items: warehouses } = useList(listWarehouses, []);
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
      reload();
    });
  };

  const setStatus = (locationId, status) => editLocation({ ROWID: locationId, occupancy_status: status }).then(reload);

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
        <table>
          <thead>
            <tr>
              <th>Location Code</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Dimensions (L×W×H cm)</th>
              <th>Max Weight</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.location_code}</td>
                <td>{l.location_type || <span className="muted">—</span>}</td>
                <td>{l.capacity} {l.capacity_unit && <span className="muted small">{l.capacity_unit}</span>}</td>
                <td>{l.length_cm && l.width_cm && l.height_cm ? `${l.length_cm}×${l.width_cm}×${l.height_cm}` : <span className="muted">—</span>}</td>
                <td>{l.max_weight_kg ? `${l.max_weight_kg} kg` : <span className="muted">—</span>}</td>
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
                <td colSpan={7} className="muted">
                  No storage locations for this rack yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WarehouseMapTab() {
  const { items: warehouses } = useList(listWarehouses, []);
  const [warehouseId, setWarehouseId] = useState('');
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
                      {locations.map((loc) => (
                        <div
                          key={loc.ROWID}
                          className={'location-box' + (loc.occupied ? ' occupied' : ' empty')}
                          title={`${loc.location_code} - ${loc.occupied ? 'Occupied' : 'Empty'}`}
                        >
                          {loc.location_code}
                        </div>
                      ))}
                      {locations.length === 0 && <span className="muted small">No storage locations in this rack.</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function PackageTypesTab() {
  const { items, loading, error, reload } = useList(listPackageTypes, []);
  const [name, setName] = useState('');
  const [capacityUnit, setCapacityUnit] = useState(CAPACITY_UNITS[0]);
  const [unitsPerItem, setUnitsPerItem] = useState('1');

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    createPackageType({ name, capacity_unit: capacityUnit, units_per_item: Number(unitsPerItem) || 1, status: 'Active' }).then(() => {
      setName('');
      setUnitsPerItem('1');
      reload();
    });
  };

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
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
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
            {items.map((p) => (
              <tr key={p.ROWID}>
                <td>{p.name}</td>
                <td>{p.capacity_unit || <span className="muted">—</span>}</td>
                <td>{p.units_per_item ?? 1}</td>
                <td>
                  <span className="status-badge">{p.status}</span>
                </td>
                <td>
                  <button
                    className="link-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => removePackageType(p.ROWID).then(reload)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No package types configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function WarehouseConfig() {
  const [tab, setTab] = useState(TABS[0]);

  return (
    <div>
      <h2>Warehouse Management</h2>
      <div className="tabs">
        {TABS.map((t) => (
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
    </div>
  );
}
