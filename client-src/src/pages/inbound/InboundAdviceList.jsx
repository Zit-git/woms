import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInboundAdvice, listCargoStatusForAllAdvices, listCustomers, startNewInboundAdvice } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';
import { useAuth } from '../../context/AuthContext';
import { FULFILLMENT_STATUSES, computeFulfillmentStatus, fulfillmentStatusClass } from '../../lib/fulfillmentStatus';

export default function InboundAdviceList() {
  const navigate = useNavigate();
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const [advices, setAdvices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([listInboundAdvice(viewer), listCargoStatusForAllAdvices(), listCustomers()])
      .then(([adviceRows, cargoStatusRows, customerRows]) => {
        const cargoByAdvice = new Map();
        cargoStatusRows.forEach((c) => {
          const key = String(c.inbound_advice_id);
          if (!cargoByAdvice.has(key)) cargoByAdvice.set(key, []);
          cargoByAdvice.get(key).push(c);
        });
        setAdvices(
          adviceRows.map((a) => ({
            ...a,
            fulfillment_status: computeFulfillmentStatus(a.expected_colli, cargoByAdvice.get(String(a.ROWID))),
          }))
        );
        setCustomers(customerRows);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () =>
      advices.filter((a) => {
        if (customerFilter && String(a.customer_id) !== customerFilter) return false;
        if (statusFilter && a.fulfillment_status !== statusFilter) return false;
        if (dateFrom && (!a.expected_date || a.expected_date < dateFrom)) return false;
        if (dateTo && (!a.expected_date || a.expected_date > dateTo)) return false;
        return true;
      }),
    [advices, customerFilter, statusFilter, dateFrom, dateTo]
  );
  const { sorted, toggleSort, arrowFor } = useSortableData(filtered);

  const startNew = () => {
    setCreating(true);
    setError('');
    startNewInboundAdvice(warehouseId)
      .then((created) => navigate(`/inbound/${created.ROWID}/wizard`))
      .catch((err) => {
        setError(err.message || String(err));
        setCreating(false);
      });
  };

  const clearFilters = () => {
    setCustomerFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
  };
  const filtersActive = customerFilter || statusFilter || dateFrom || dateTo;

  return (
    <div>
      <div className="toolbar">
        <h2>Inbound Operations</h2>
        <button className="btn" onClick={startNew} disabled={creating}>
          {creating ? 'Creating...' : '+ New Inbound'}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

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
        <div className="form-row">
          <label>Expected from</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Expected to</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
