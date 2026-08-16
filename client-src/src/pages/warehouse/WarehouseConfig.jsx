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
} from '../../lib/api';

const TABS = ['Warehouses', 'Zones', 'Racks', 'Storage Locations'];

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
      <form className="toolbar" onSubmit={add}>
        <input placeholder="New warehouse name" value={name} onChange={(e) => setName(e.target.value)} />
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

      <form className="toolbar" onSubmit={add}>
        <input placeholder="Zone name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Zone type (e.g. Ambient)" value={zoneType} onChange={(e) => setZoneType(e.target.value)} />
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

      <form className="toolbar" onSubmit={add}>
        <input placeholder="Rack code (e.g. A-01)" value={code} onChange={(e) => setCode(e.target.value)} />
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

      <form className="toolbar" onSubmit={add}>
        <input placeholder="Location code (e.g. A-01-01)" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} />
        <input placeholder="Capacity" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ width: 100 }} />
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
    </div>
  );
}
