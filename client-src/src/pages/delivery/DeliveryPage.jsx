import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDeliveryGoods, markCargoDelivered } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { key: 'Dispatched', label: 'In Transit' },
  { key: 'Delivered', label: 'Delivered' },
];

const day = (value) => (value ? String(value).slice(0, 10) : '');

export default function DeliveryPage() {
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const actor = user?.email_id || '';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState('Dispatched');
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [selected, setSelected] = useState(() => new Set());

  const reload = useCallback(
    () =>
      listDeliveryGoods(viewer)
        .then((list) => {
          // One row per package even if its order has more than one dispatch record.
          const byId = new Map();
          list.forEach((r) => {
            if (!byId.has(String(r.ROWID))) byId.set(String(r.ROWID), r);
          });
          setRows([...byId.values()]);
        })
        .catch((err) => setError(err.message || String(err))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const inTransit = useMemo(() => rows.filter((r) => r.status === 'Dispatched'), [rows]);
  const delivered = useMemo(() => rows.filter((r) => r.status === 'Delivered'), [rows]);
  const customers = useMemo(() => [...new Set(rows.map((r) => r.customer_name).filter(Boolean))].sort(), [rows]);
  const orders = useMemo(() => new Set(rows.map((r) => r.outbound_request_id).filter(Boolean)), [rows]);

  const visible = tab === 'Dispatched' ? inTransit : delivered;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter((r) => {
      if (customerFilter && r.customer_name !== customerFilter) return false;
      const d = day(r.dispatch_date);
      if (dateFrom && (!d || d < dateFrom)) return false;
      if (dateTo && (!d || d > dateTo)) return false;
      if (q) {
        const hay = [r.description, r.customer_name, r.qr_code, r.inbound_reference, r.outbound_reference, r.outbound_request_id, r.vehicle_details]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visible, customerFilter, dateFrom, dateTo, search]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', title: null, rows: filtered }];
    const map = new Map();
    filtered.forEach((r) => {
      const key = groupBy === 'customer' ? r.customer_name || 'No customer' : r.outbound_request_id ? `Order #${r.outbound_request_id}` : 'No order';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].map(([key, list]) => ({ key, title: key, rows: list })).sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered, groupBy]);

  const switchTab = (key) => {
    setTab(key);
    setSelected(new Set());
  };
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const canSelect = tab === 'Dispatched';
  const allSelected = canSelect && filtered.length > 0 && filtered.every((r) => selected.has(String(r.ROWID)));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((r) => String(r.ROWID))));

  const markDelivered = async (ids) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await markCargoDelivered(ids.map(String), actor);
      setNotice(`Marked ${ids.length} package${ids.length === 1 ? '' : 's'} as delivered.`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading...</p>;

  const columns = canSelect ? 8 : 7;
  const renderRow = (r) => (
    <tr key={r.ROWID}>
      {canSelect && (
        <td className="checkbox-cell">
          <input type="checkbox" checked={selected.has(String(r.ROWID))} onChange={() => toggle(r.ROWID)} aria-label="Select package" />
        </td>
      )}
      <td>{r.customer_name || <span className="muted">—</span>}</td>
      <td>
        {r.description || <span className="muted">No description</span>}
        {r.outer_package_no && <span className="muted small"> · pkg {r.outer_package_no}</span>}
      </td>
      <td>
        {r.qty ? `${r.qty} ${r.unit || ''}` : r.unit || '—'}
        {r.weight ? <span className="muted small"> · {r.weight} kg</span> : null}
      </td>
      <td>
        {r.outbound_request_id ? (
          <Link to={`/outbound/${r.outbound_request_id}`}>#{r.outbound_reference || r.outbound_request_id}</Link>
        ) : (
          <span className="muted">—</span>
        )}
        {r.inbound_reference && <div className="muted small">from {r.inbound_reference}</div>}
      </td>
      <td>{r.vehicle_details || <span className="muted">—</span>}</td>
      <td>
        {day(r.dispatch_date) || <span className="muted">—</span>}
        {r.dispatched_by && <div className="muted small">{r.dispatched_by}</div>}
      </td>
      <td>
        <span className={`status-badge ${r.status === 'Delivered' ? 'status-stored' : 'status-sent'}`}>
          {r.status === 'Delivered' ? 'Delivered' : 'In transit'}
        </span>
        {r.status === 'Delivered' && day(r.MODIFIEDTIME) && <div className="muted small">{day(r.MODIFIEDTIME)}</div>}
      </td>
      {canSelect && (
        <td>
          <button className="link-btn" onClick={() => markDelivered([r.ROWID])} disabled={busy}>
            Mark delivered
          </button>
        </td>
      )}
    </tr>
  );

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Deliveries</h2>
          <p className="muted small">Goods that have left the warehouse: what is on its way, what has been delivered, for which customer and order.</p>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice-text">{notice}</div>}

      <div className="summary-strip">
        <div>
          <div className="muted small">In transit</div>
          <div className="summary-value">{inTransit.length}</div>
        </div>
        <div>
          <div className="muted small">Delivered</div>
          <div className="summary-value">{delivered.length}</div>
        </div>
        <div>
          <div className="muted small">Customers</div>
          <div className="summary-value">{customers.length}</div>
        </div>
        <div>
          <div className="muted small">Outbound orders</div>
          <div className="summary-value">{orders.size}</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
            {t.label} ({t.key === 'Dispatched' ? inTransit.length : delivered.length})
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="form-row">
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Goods, customer, order, vehicle, QR" />
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
        <div className="form-row">
          <label>Dispatched from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Dispatched to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Group by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="none">No grouping</option>
            <option value="customer">Customer</option>
            <option value="order">Outbound order</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-toolbar">
          <strong>{selected.size} selected</strong>
          <button className="btn secondary small-btn" onClick={() => markDelivered([...selected])} disabled={busy}>
            Mark delivered
          </button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            {canSelect && (
              <th className="checkbox-cell">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
            )}
            <th>Customer</th>
            <th>Goods</th>
            <th>Qty / Weight</th>
            <th>Order</th>
            <th>Vehicle</th>
            <th>Dispatched</th>
            <th>Status</th>
            {canSelect && <th></th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key} group={g} columns={columns} renderRow={renderRow} />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                {visible.length === 0
                  ? tab === 'Dispatched'
                    ? 'Nothing is in transit.'
                    : 'Nothing has been delivered yet.'
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
            <span className="muted small"> · {group.rows.length} package{group.rows.length === 1 ? '' : 's'}</span>
          </td>
        </tr>
      )}
      {group.rows.map(renderRow)}
    </>
  );
}
