import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOutboundRequests, createOutboundRequest, listCustomers } from '../../lib/api';

export default function OutboundRequestList() {
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', requested_date: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listOutboundRequests(), listCustomers()])
      .then(([r, c]) => {
        setRequests(r);
        setCustomers(c);
        if (!form.customer_id && c.length) setForm((f) => ({ ...f, customer_id: c[0].ROWID }));
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createOutboundRequest({ ...form, status: 'Submitted' })
      .then(() => {
        setShowForm(false);
        setForm({ customer_id: customers[0]?.ROWID || '', requested_date: '' });
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
              <th>Customer</th>
              <th>Requested date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.ROWID}>
                <td>{r.customer_name}</td>
                <td>{r.requested_date}</td>
                <td>
                  <span className="status-badge">{r.status}</span>
                </td>
                <td>
                  <Link className="link-btn" to={`/outbound/${r.ROWID}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
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
