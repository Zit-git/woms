import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOutboundRequests, createOutboundRequest, listCustomers, listTransporters } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';

export default function OutboundRequestList() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', transporter_id: '', requested_date: '' });
  const [saving, setSaving] = useState(false);
  const { sorted, toggleSort, arrowFor } = useSortableData(requests);

  const load = () => {
    setLoading(true);
    Promise.all([listOutboundRequests(), listCustomers(), listTransporters()])
      .then(([r, c, t]) => {
        setRequests(r);
        setCustomers(c);
        setTransporters(t);
        if (!form.customer_id && c.length) setForm((f) => ({ ...f, customer_id: c[0].ROWID }));
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createOutboundRequest({ ...form, transporter_id: form.transporter_id || undefined, status: 'Submitted' })
      .then(() => {
        setShowForm(false);
        setForm({ customer_id: customers[0]?.ROWID || '', transporter_id: '', requested_date: '' });
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
          <button className="btn" onClick={() => setShowForm(true)}>
            + New Outbound Request
          </button>
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

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Customer" sortKey="customer_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Transporter" sortKey="transporter_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Requested date" sortKey="requested_date" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Status" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.ROWID} className="clickable-row" onClick={() => navigate(`/outbound/${r.ROWID}`)}>
                <td>{r.customer_name}</td>
                <td>{r.transporter_name || <span className="muted">—</span>}</td>
                <td>{r.requested_date}</td>
                <td>
                  <span className="status-badge">{r.status}</span>
                </td>
                <td>
                  <span className="link-btn">Open</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No outbound requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
