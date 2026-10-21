import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOutboundRequests, listPickStatusForAllRequests, createOutboundRequest, listCustomers, listTransporters, listWarehouses } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';
import { useAuth } from '../../context/AuthContext';
import { accessibleWarehouses as scopeWarehouses } from '../../lib/access';
import { todayStr, addDays } from '../../lib/dates';
import { pickupRequestIdFromPass } from '../../lib/scanning';
import { OUTBOUND_FULFILLMENT_STATUSES, computeOutboundFulfillment, outboundStatusClass } from '../../lib/outboundStatus';

const QrScannerModal = lazy(() => import('../../components/QrScannerModal'));

export default function OutboundRequestList() {
  const navigate = useNavigate();
  const { viewer, activeWarehouseId } = useAuth();
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    transporter_id: '',
    warehouse_id: '',
    requested_date: '',
    reference_number: '',
  });
  const [saving, setSaving] = useState(false);
  // Pickups are planned by date, so the list opens on today's.
  const [dateMode, setDateMode] = useState('today'); // today | tomorrow | week | all | custom
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  // Gate lookup: type or scan the pickup reference printed on the driver's Pickup Pass.
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const range = (() => {
    const today = todayStr();
    if (dateMode === 'today') return [today, today];
    if (dateMode === 'tomorrow') return [addDays(today, 1), addDays(today, 1)];
    if (dateMode === 'week') return [today, addDays(today, 6)];
    if (dateMode === 'custom') return [customFrom || '0000-01-01', customTo || '9999-12-31'];
    return null;
  })();
  const day = (v) => (v ? String(v).slice(0, 10) : '');
  const query = search.trim().toLowerCase();
  const shown = requests.filter((r) => {
    if (query) {
      // Looking for a specific pass: ignore the date filter so a driver turning up on the wrong day is still found.
      return [r.outbound_reference, r.reference_number, r.customer_name, String(r.ROWID)].filter(Boolean).some((v) => String(v).toLowerCase().includes(query));
    }
    return (!range || (day(r.requested_date) >= range[0] && day(r.requested_date) <= range[1])) && (!statusFilter || r.fulfillment_status === statusFilter) && (!customerFilter || String(r.customer_id) === customerFilter);
  });
  const onScanned = (text) => {
    setScanning(false);
    const id = pickupRequestIdFromPass(text);
    if (id) navigate(`/outbound/${id}`);
    else setError(`"${text}" is not a Pickup Pass code.`);
  };
  const { sorted, toggleSort, arrowFor } = useSortableData(shown);

  const load = () => {
    setLoading(true);
    Promise.all([listOutboundRequests(viewer), listPickStatusForAllRequests(), listCustomers(), listTransporters(), listWarehouses()])
      .then(([r, picks, c, t, w]) => {
        const picksByRequest = new Map();
        picks.forEach((p) => {
          const key = String(p.outbound_request_id);
          if (!picksByRequest.has(key)) picksByRequest.set(key, []);
          picksByRequest.get(key).push(p);
        });
        setRequests(r.map((x) => ({ ...x, fulfillment_status: computeOutboundFulfillment(picksByRequest.get(String(x.ROWID))) })));
        setCustomers(c);
        setTransporters(t);
        // Only warehouses this user can see are offered for a new request.
        const mine = scopeWarehouses(viewer, w);
        setWarehouses(mine);
        if (!form.customer_id && c.length) setForm((f) => ({ ...f, customer_id: c[0].ROWID }));
        if (!form.warehouse_id && mine.length) {
          setForm((f) => ({ ...f, warehouse_id: mine[0].ROWID }));
        }
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // The request belongs to the warehouse chosen in the sidebar (or the user's only one).
  const chosenWarehouse =
    warehouses.find((w) => String(w.ROWID) === String(activeWarehouseId))?.ROWID || (warehouses.length === 1 ? warehouses[0].ROWID : '');

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createOutboundRequest({ ...form, warehouse_id: chosenWarehouse, transporter_id: form.transporter_id || undefined, status: 'Submitted' })
      .then(() => {
        setShowForm(false);
        setForm({
          customer_id: customers[0]?.ROWID || '',
          transporter_id: '',
          warehouse_id: warehouses[0]?.ROWID || '',
          requested_date: '',
          reference_number: '',
        });
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <div className="toolbar">
        <h2>Outbound Operations</h2>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!chosenWarehouse && <span className="muted small">Choose a warehouse at the bottom left first</span>}
            <button className="btn" onClick={() => setShowForm(true)} disabled={!chosenWarehouse}>
              + New Outbound Request
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3>New Outbound Request</h3>
          <div className="form-row">
            <label>Customer</label>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
              {customers.map((c) => (
                <option key={c.ROWID} value={c.ROWID}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Transporter</label>
            <select value={form.transporter_id} onChange={(e) => setForm({ ...form, transporter_id: e.target.value })}>
              <option value="">None</option>
              {transporters.map((t) => (
                <option key={t.ROWID} value={t.ROWID}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Reference number (customer's PO/order ref, optional)</label>
            <input
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Requested date</label>
            <input
              type="date"
              value={form.requested_date}
              onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving || !customers.length}>
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          {!customers.length && <p className="muted small">Add a customer first (Customer Management).</p>}
        </form>
      )}

      <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find by pickup reference, customer ref or customer"
          style={{ minWidth: 260 }}
        />
        <button className="btn secondary small-btn" onClick={() => setScanning(true)}>
          Scan pass
        </button>
        <strong>Pickups:</strong>
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
        <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} aria-label="Customer" style={{ marginLeft: 'auto' }}>
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.ROWID} value={c.ROWID}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {OUTBOUND_FULFILLMENT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <span className="muted small">
          {shown.length} of {requests.length} request{requests.length === 1 ? '' : 's'}
          {range && dateMode !== 'all' ? ` · ${range[0] === range[1] ? range[0] : `${range[0]} to ${range[1]}`}` : ''}
        </span>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Pickup ref" sortKey="outbound_reference" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Customer ref" sortKey="reference_number" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Customer" sortKey="customer_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Transporter" sortKey="transporter_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Requested date" sortKey="requested_date" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Fulfillment Status" sortKey="fulfillment_status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.ROWID} className="clickable-row" onClick={() => navigate(`/outbound/${r.ROWID}`)}>
                <td>{r.outbound_reference || <span className="muted">—</span>}</td>
                <td>{r.reference_number || <span className="muted">—</span>}</td>
                <td>{r.customer_name}</td>
                <td>{r.transporter_name || <span className="muted">—</span>}</td>
                <td>{r.requested_date}</td>
                <td>
                  <span className={`status-badge ${outboundStatusClass(r.fulfillment_status)}`}>{r.fulfillment_status}</span>
                </td>
                <td>
                  <span className="link-btn">Open</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  {requests.length ? 'No pickups for these dates. Try another day or "All dates".' : 'No outbound requests yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {scanning && (
        <Suspense fallback={null}>
          <QrScannerModal onDecode={onScanned} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}
