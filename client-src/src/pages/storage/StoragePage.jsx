import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { listCargoOutOfRack, listStoredCargo, listAllStorageLocations, recordScan } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const QrScannerModal = lazy(() => import('../../components/QrScannerModal'));

const TABS = [
  { key: 'stored', label: 'In Storage' },
  { key: 'putaway', label: 'Awaiting Put-away' },
  { key: 'retrieved', label: 'Retrieved' },
];

const statusClass = (status) => {
  if (status === 'Stored') return 'status-stored';
  if (status === 'Retrieved') return 'status-partial';
  return 'status-received';
};

export default function StoragePage() {
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const actor = user?.email_id || '';

  const [stored, setStored] = useState([]);
  const [outOfRack, setOutOfRack] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [tab, setTab] = useState('stored');
  const [customerFilter, setCustomerFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [selected, setSelected] = useState(() => new Set());

  const [action, setAction] = useState(null); // { mode: 'putaway' | 'relocate', ids: string[] }
  const [pickedLocation, setPickedLocation] = useState('');
  const [scanChoice, setScanChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const reload = useCallback(
    () =>
      Promise.all([listCargoOutOfRack(viewer), listStoredCargo(viewer), listAllStorageLocations()])
        .then(([o, s, l]) => {
          setOutOfRack(o);
          setStored(s);
          setLocations(l);
        })
        .catch((err) => setError(err.message || String(err))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const pending = useMemo(() => outOfRack.filter((c) => c.status !== 'Retrieved'), [outOfRack]);
  const retrieved = useMemo(() => outOfRack.filter((c) => c.status === 'Retrieved'), [outOfRack]);
  const locById = useMemo(() => new Map(locations.map((l) => [String(l.ROWID), l])), [locations]);
  const perLocation = useMemo(() => {
    const m = new Map();
    stored.forEach((c) => m.set(String(c.current_location_id), (m.get(String(c.current_location_id)) || 0) + 1));
    return m;
  }, [stored]);
  const customers = useMemo(
    () => [...new Set([...stored, ...outOfRack].map((c) => c.customer_name).filter(Boolean))].sort(),
    [stored, outOfRack]
  );

  const locCode = (id) => locById.get(String(id))?.location_code || '—';
  const locPath = (id) => locById.get(String(id))?.path || '';

  const rowsForTab = tab === 'stored' ? stored : tab === 'putaway' ? pending : retrieved;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsForTab.filter((c) => {
      if (customerFilter && c.customer_name !== customerFilter) return false;
      if (tab === 'stored' && locationFilter && String(c.current_location_id) !== locationFilter) return false;
      if (q) {
        const hay = [c.description, c.qr_code, c.customer_name, c.inbound_reference, c.outer_package_no, c.destination, locCode(c.current_location_id)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsForTab, customerFilter, locationFilter, search, tab, locById]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', title: null, subtitle: '', rows: filtered }];
    const map = new Map();
    filtered.forEach((c) => {
      const key = groupBy === 'location' ? String(c.current_location_id || 'none') : c.customer_name || 'No customer';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return [...map.entries()]
      .map(([key, rows]) => {
        if (groupBy === 'location') {
          return { key, title: key === 'none' ? 'Not in a location' : locCode(key), subtitle: key === 'none' ? '' : locPath(key), rows };
        }
        const spots = new Set(rows.map((r) => r.current_location_id).filter(Boolean));
        return { key, title: key, subtitle: tab === 'stored' ? `${spots.size} location${spots.size === 1 ? '' : 's'}` : '', rows };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, tab, locById]);

  const switchTab = (key) => {
    setTab(key);
    setSelected(new Set());
    setAction(null);
    setLocationFilter('');
    if (key !== 'stored' && groupBy === 'location') setGroupBy('none');
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(String(c.ROWID)));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((c) => String(c.ROWID))));

  const openPicker = (mode, ids) => {
    setAction({ mode, ids: ids.map(String) });
    setPickedLocation('');
    setScanChoice(null);
    setError('');
    setNotice('');
  };

  const run = async (ids, context, locationId, verb) => {
    setBusy(true);
    setError('');
    setNotice('');
    const results = await Promise.allSettled(ids.map((id) => recordScan(id, actor, context, locationId)));
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      setError(`${failed.length} of ${ids.length} failed: ${failed[0].reason?.message || failed[0].reason}`);
    } else {
      setNotice(`${verb} ${ids.length} package${ids.length === 1 ? '' : 's'}.`);
    }
    setSelected(new Set());
    setAction(null);
    setScanChoice(null);
    await reload();
    setBusy(false);
  };

  const confirmMove = () => {
    if (!action || !pickedLocation) return;
    const isPutaway = action.mode === 'putaway';
    run(action.ids, isPutaway ? 'storage' : 'relocation', pickedLocation, isPutaway ? 'Put away' : 'Relocated');
  };

  const handleScanned = useCallback(
    (code) => {
      setShowScanner(false);
      const out = outOfRack.find((c) => c.qr_code === code);
      if (out) return openPicker('putaway', [out.ROWID]);
      const inRack = stored.find((c) => c.qr_code === code);
      if (inRack) {
        setScanChoice(inRack);
        setAction(null);
        return;
      }
      setError(`No cargo matches scanned code "${code}"`);
    },
    [outOfRack, stored] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (loading) return <p className="muted">Loading...</p>;

  const isStoredTab = tab === 'stored';
  const columns = isStoredTab ? 8 : 7;

  const renderRow = (c) => (
    <tr key={c.ROWID}>
      <td className="checkbox-cell">
        <input type="checkbox" checked={selected.has(String(c.ROWID))} onChange={() => toggle(c.ROWID)} aria-label="Select package" />
      </td>
      <td>{c.customer_name || <span className="muted">—</span>}</td>
      <td>
        {c.description || <span className="muted">No description</span>}
        {c.outer_package_no && <span className="muted small"> · pkg {c.outer_package_no}</span>}
      </td>
      <td>
        {c.qty ? `${c.qty} ${c.unit || ''}` : c.unit || '—'}
        {c.weight ? <span className="muted small"> · {c.weight} kg</span> : null}
      </td>
      <td>
        {c.inbound_reference || <span className="muted">—</span>}
        {c.destination && <div className="muted small">→ {c.destination}</div>}
      </td>
      {isStoredTab && (
        <td>
          <strong>{locCode(c.current_location_id)}</strong>
          <div className="muted small">{locPath(c.current_location_id)}</div>
        </td>
      )}
      <td>
        <span className={`status-badge ${statusClass(c.status)}`}>{c.status}</span>
      </td>
      <td>
        {isStoredTab ? (
          <>
            <button className="link-btn" onClick={() => openPicker('relocate', [c.ROWID])}>
              Relocate
            </button>{' '}
            <button className="link-btn" onClick={() => run([c.ROWID], 'retrieval', null, 'Retrieved')} disabled={busy}>
              Retrieve
            </button>
          </>
        ) : (
          <button className="link-btn" onClick={() => openPicker('putaway', [c.ROWID])}>
            {tab === 'retrieved' ? 'Put back' : 'Put away'}
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Storage</h2>
          <p className="muted small">See what is stored where and for which customer. Put away, relocate and retrieve goods.</p>
        </div>
        <button className="btn secondary" onClick={() => setShowScanner(true)}>
          Scan QR
        </button>
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <QrScannerModal onDecode={handleScanned} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice-text">{notice}</div>}

      <div className="summary-strip">
        <div>
          <div className="muted small">In storage</div>
          <div className="summary-value">{stored.length}</div>
        </div>
        <div>
          <div className="muted small">Awaiting put-away</div>
          <div className="summary-value">{pending.length}</div>
        </div>
        <div>
          <div className="muted small">Retrieved</div>
          <div className="summary-value">{retrieved.length}</div>
        </div>
        <div>
          <div className="muted small">Customers</div>
          <div className="summary-value">{customers.length}</div>
        </div>
        <div>
          <div className="muted small">Locations in use</div>
          <div className="summary-value">{perLocation.size}</div>
        </div>
      </div>

      {scanChoice && (
        <div className="card">
          <h3>{scanChoice.description || `Package ${scanChoice.outer_package_no || ''}`}</h3>
          <p className="muted">
            {scanChoice.customer_name} · at <strong>{locCode(scanChoice.current_location_id)}</strong>
          </p>
          <div className="form-actions">
            <button className="btn" onClick={() => openPicker('relocate', [scanChoice.ROWID])}>
              Relocate
            </button>
            <button className="btn secondary" onClick={() => run([scanChoice.ROWID], 'retrieval', null, 'Retrieved')} disabled={busy}>
              Retrieve
            </button>
            <button className="btn secondary" onClick={() => setScanChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {action && (
        <div className="card">
          <h3>
            {action.mode === 'putaway' ? 'Put away' : 'Relocate'} {action.ids.length} package{action.ids.length === 1 ? '' : 's'}
          </h3>
          <div className="form-row">
            <label>Storage location</label>
            <select value={pickedLocation} onChange={(e) => setPickedLocation(e.target.value)}>
              <option value="">Select location...</option>
              {locations.map((l) => (
                <option key={l.ROWID} value={l.ROWID}>
                  {l.location_code} ({l.path}) — {perLocation.get(String(l.ROWID)) || 0} stored
                </option>
              ))}
            </select>
            {!locations.length && <p className="muted small">No storage locations yet. Add zones, racks and locations under Warehouses.</p>}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={confirmMove} disabled={busy || !pickedLocation}>
              {busy ? 'Saving...' : 'Confirm'}
            </button>
            <button className="btn secondary" onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
            {t.label} (
            {t.key === 'stored' ? stored.length : t.key === 'putaway' ? pending.length : retrieved.length})
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="form-row">
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Goods, customer, reference, QR, location" />
        </div>
        <div className="form-row">
          <label>Customer</label>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {isStoredTab && (
          <div className="form-row">
            <label>Location</label>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.ROWID} value={l.ROWID}>
                  {l.location_code}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-row">
          <label>Group by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">No grouping</option>
            {isStoredTab && <option value="location">Location</option>}
            <option value="customer">Customer</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-toolbar">
          <strong>{selected.size} selected</strong>
          {isStoredTab ? (
            <>
              <button className="btn secondary small-btn" onClick={() => openPicker('relocate', [...selected])}>
                Relocate
              </button>
              <button className="btn secondary small-btn" onClick={() => run([...selected], 'retrieval', null, 'Retrieved')} disabled={busy}>
                Retrieve
              </button>
            </>
          ) : (
            <button className="btn secondary small-btn" onClick={() => openPicker('putaway', [...selected])}>
              {tab === 'retrieved' ? 'Put back' : 'Put away'}
            </button>
          )}
          <button className="link-btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th className="checkbox-cell">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
            </th>
            <th>Customer</th>
            <th>Goods</th>
            <th>Qty / Weight</th>
            <th>Inbound</th>
            {isStoredTab && <th>Location</th>}
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key} group={g} columns={columns} renderRow={renderRow} />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                {rowsForTab.length === 0
                  ? tab === 'stored'
                    ? 'Nothing in storage yet.'
                    : tab === 'putaway'
                      ? 'Nothing waiting for put-away.'
                      : 'No retrieved goods.'
                  : 'No goods match the current filters.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, columns, renderRow }) {
  return (
    <>
      {group.title && (
        <tr className="group-heading">
          <td colSpan={columns}>
            <strong>{group.title}</strong>
            {group.subtitle && <span className="muted small"> · {group.subtitle}</span>}
            <span className="muted small"> · {group.rows.length} package{group.rows.length === 1 ? '' : 's'}</span>
          </td>
        </tr>
      )}
      {group.rows.map(renderRow)}
    </>
  );
}
