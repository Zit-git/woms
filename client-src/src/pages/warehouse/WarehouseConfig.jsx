import { useEffect, useState } from 'react';
import {
  listWarehouses,
  createWarehouse,
  removeWarehouse,
  listZonesByWarehouse,
  createZone,
  removeZone,
  listRacksByZone,
  createRack,
  removeRack,
  listLocationsByRack,
  createLocation,
  removeLocation,
  getWarehouseMap,
} from '../../lib/api';

const TABS = ['Warehouses', 'Zones', 'Racks', 'Storage Locations', 'Map'];

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

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    createWarehouse({ name, status: 'Active' }).then(() => {
      setName('');
      reload();
    });
  };

  return (
    <div>
      <form className="card" onSubmit={add}>
        <h3>Add Warehouse</h3>
        <div className="form-row" style={{ maxWidth: 300 }}>
          <label>Warehouse name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rotterdam DC" />
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
            {items.map((w) => (
              <tr key={w.ROWID}>
                <td>{w.name}</td>
                <td>{w.address}</td>
                <td>
                  <span className="status-badge">{w.status}</span>
                </td>
                <td>
                  <button
                    className="link-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => removeWarehouse(w.ROWID).then(reload)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
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

function RacksTab() {
  const { items: warehouses } = useList(listWarehouses, []);
  const [warehouseId, setWarehouseId] = useState('');
  const { items: zones } = useList(warehouseId ? () => listZonesByWarehouse(warehouseId) : null, [warehouseId]);
  const [zoneId, setZoneId] = useState('');
  const { items, loading, error, reload } = useList(zoneId ? () => listRacksByZone(zoneId) : null, [zoneId]);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setZoneId(zones[0]?.ROWID || '');
  }, [zones]);

  const add = (e) => {
    e.preventDefault();
    if (!code.trim() || !zoneId) return;
    createRack({ code, zone_id: zoneId }).then(() => {
      setCode('');
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
        <h3>Add Rack</h3>
        <div className="form-row" style={{ maxWidth: 220 }}>
          <label>Rack code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. A-01" />
        </div>
        <button className="btn" type="submit" disabled={!zoneId}>
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
  const { items: racks } = useList(zoneId ? () => listRacksByZone(zoneId) : null, [zoneId]);
  const [rackId, setRackId] = useState('');
  const { items, loading, error, reload } = useList(rackId ? () => listLocationsByRack(rackId) : null, [rackId]);
  const [locationCode, setLocationCode] = useState('');
  const [capacity, setCapacity] = useState('');

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].ROWID);
  }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setZoneId(zones[0]?.ROWID || '');
  }, [zones]);
  useEffect(() => {
    setRackId(racks[0]?.ROWID || '');
  }, [racks]);

  const add = (e) => {
    e.preventDefault();
    if (!locationCode.trim() || !rackId) return;
    createLocation({
      location_code: locationCode,
      capacity: capacity ? Number(capacity) : undefined,
      occupancy_status: 'Empty',
      rack_id: rackId,
    }).then(() => {
      setLocationCode('');
      setCapacity('');
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
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Location code</label>
            <input value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="e.g. A-01-01" />
          </div>
          <div className="form-row" style={{ maxWidth: 140 }}>
            <label>Capacity</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 10" />
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
              <th>Capacity</th>
              <th>Occupancy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.location_code}</td>
                <td>{l.capacity}</td>
                <td>
                  <span className="status-badge">{l.occupancy_status}</span>
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
                <td colSpan={4} className="muted">
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

  const totalLocations = zoneMap.reduce((n, z) => n + z.racks.reduce((rn, r) => rn + r.locations.length, 0), 0);
  const totalOccupied = zoneMap.reduce(
    (n, z) => n + z.racks.reduce((rn, r) => rn + r.locations.filter((l) => l.occupied).length, 0),
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
        zoneMap.map(({ zone, racks }) => (
          <div className="warehouse-zone" key={zone.ROWID}>
            <h3>
              {zone.name} {zone.zone_type && <span className="muted small">({zone.zone_type})</span>}
            </h3>
            {racks.length === 0 && <p className="muted small">No racks in this zone.</p>}
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
        ))
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
      {tab === 'Racks' && <RacksTab />}
      {tab === 'Storage Locations' && <LocationsTab />}
      {tab === 'Map' && <WarehouseMapTab />}
    </div>
  );
}
