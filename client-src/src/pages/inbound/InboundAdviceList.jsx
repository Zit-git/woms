import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInboundAdvice, listCargoStatusForAllAdvices, listLineTotalsForAllAdvices, listCustomers, startNewInboundAdvice } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';
import { useAuth } from '../../context/AuthContext';
import { FULFILLMENT_STATUSES, computeFulfillmentStatus, fulfillmentStatusClass } from '../../lib/fulfillmentStatus';
import { warehousesWhereCanApprove } from '../../lib/access';
import { todayStr, addDays } from '../../lib/dates';

export default function InboundAdviceList() {
  const navigate = useNavigate();
  const { viewer, accessibleWarehouses, activeWarehouseId } = useAuth();
  // The warehouse a new inbound will belong to: only ones where this user can approve.
  const creatableWarehouses = warehousesWhereCanApprove(viewer, accessibleWarehouses);
  const [advices, setAdvices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Arrivals are planned by day: today / tomorrow / next 7 days, or a custom range.
  const [dateMode, setDateMode] = useState('all'); // today | tomorrow | week | all | custom
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());

  const load = () => {
    setLoading(true);
    Promise.all([listInboundAdvice(viewer), listCargoStatusForAllAdvices(), listLineTotalsForAllAdvices(), listCustomers()])
      .then(([adviceRows, cargoStatusRows, lineRows, customerRows]) => {
        const totalsByAdvice = new Map();
        lineRows.forEach((l) => {
          const key = String(l.inbound_advice_id);
          const t = totalsByAdvice.get(key) || { planned: 0, received: 0 };
          t.planned += Number(l.qty) || 0;
          t.received += Number(l.received_qty) || 0;
          totalsByAdvice.set(key, t);
        });
        const cargoByAdvice = new Map();
        cargoStatusRows.forEach((c) => {
          const key = String(c.inbound_advice_id);
          if (!cargoByAdvice.has(key)) cargoByAdvice.set(key, []);
          cargoByAdvice.get(key).push(c);
        });
        setAdvices(
          adviceRows.map((a) => ({
            ...a,
            fulfillment_status: computeFulfillmentStatus(totalsByAdvice.get(String(a.ROWID)), cargoByAdvice.get(String(a.ROWID))),
          }))
        );
        setCustomers(customerRows);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const range = (() => {
    const today = todayStr();
    if (dateMode === 'today') return [today, today];
    if (dateMode === 'tomorrow') return [addDays(today, 1), addDays(today, 1)];
    if (dateMode === 'week') return [today, addDays(today, 6)];
    if (dateMode === 'custom') return [customFrom || '0000-01-01', customTo || '9999-12-31'];
    return null;
  })();

  const filtered = useMemo(
    () =>
      advices.filter((a) => {
        if (customerFilter && String(a.customer_id) !== customerFilter) return false;
        if (statusFilter && a.fulfillment_status !== statusFilter) return false;
        if (range) {
          const d = a.expected_date ? String(a.expected_date).slice(0, 10) : '';
          if (!d || d < range[0] || d > range[1]) return false;
        }
        return true;
      }),
    [advices, customerFilter, statusFilter, dateMode, customFrom, customTo]
  );
  const { sorted, toggleSort, arrowFor } = useSortableData(filtered);

  const canCreate = creatableWarehouses.length > 0;
  // A new inbound belongs to the warehouse chosen in the sidebar (or the user's only one).
  // With a warehouse selected it must be one the user can create in: never quietly use another one.
  const chosenWarehouse = activeWarehouseId
    ? creatableWarehouses.find((w) => String(w.ROWID) === String(activeWarehouseId))?.ROWID || ''
    : creatableWarehouses.length === 1
      ? creatableWarehouses[0].ROWID
      : '';
  const activeNotCreatable = Boolean(activeWarehouseId) && !chosenWarehouse;

  const startNew = () => {
    setCreating(true);
    setError('');
    startNewInboundAdvice(chosenWarehouse)
      .then((created) => navigate(`/inbound/${created.ROWID}`, { state: { openRequest: true } }))
      .catch((err) => {
        setError(err.message || String(err));
        setCreating(false);
      });
  };

  const clearFilters = () => {
    setCustomerFilter('');
    setStatusFilter('');
    setDateMode('all');
  };
  const filtersActive = customerFilter || statusFilter || dateMode !== 'all';

  return (
    <div>
      <div className="toolbar">
        <h2>Inbound Operations</h2>
        {canCreate && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!chosenWarehouse && (
              <span className="muted small">
                {activeNotCreatable ? "Your role in this warehouse can't create inbounds. Choose another warehouse at the bottom left." : 'Choose a warehouse at the bottom left first'}
              </span>
            )}
            <button className="btn" onClick={startNew} disabled={creating || !chosenWarehouse}>
              {creating ? 'Creating...' : '+ New Inbound'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Arriving:</strong>
        {[
          ['today', 'Today'],
          ['tomorrow', 'Tomorrow'],
          ['week', 'Next 7 days'],
          ['all', 'All dates'],
          ['custom', 'Pick dates'],
        ].map(([key, label]) => (
          <button key={key} className={dateMode === key ? 'btn small-btn' : 'btn secondary small-btn'} onClick={() => setDateMode(key)}>
            {label}
          </button>
        ))}
        {dateMode === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From" />
            <span className="muted small">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="To" />
          </>
        )}
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {advices.length} inbound{advices.length === 1 ? '' : 's'}
          {range ? ` · ${range[0] === range[1] ? range[0] : `${range[0]} to ${range[1]}`}` : ''}
        </span>
      </div>

      <div className="filter-bar">
        <div className="form-row">
          <label>Customer</label>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.ROWID} value={c.ROWID}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <button type="button" className="btn secondary" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Reference" sortKey="inbound_reference" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Customer" sortKey="customer_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Destination" sortKey="destination" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Expected date" sortKey="expected_date" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Transporter" sortKey="transporter_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Stage" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Fulfillment Status" sortKey="fulfillment_status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.ROWID} className="clickable-row" onClick={() => navigate(`/inbound/${a.ROWID}`)}>
                <td>{a.inbound_reference || a.reference_number || <span className="muted">—</span>}</td>
                <td>{a.customer_name}</td>
                <td>{a.destination || <span className="muted">—</span>}</td>
                <td>{a.expected_date}</td>
                <td>{a.transporter_name || <span className="muted">—</span>}</td>
                <td>
                  <span className="status-badge">{a.status}</span>
                </td>
                <td>
                  <span className={`status-badge ${fulfillmentStatusClass(a.fulfillment_status)}`}>{a.fulfillment_status}</span>
                </td>
                <td>
                  <span className="link-btn">Open</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {advices.length === 0 ? 'No inbounds yet.' : 'No inbounds match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
