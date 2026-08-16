import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInboundAdvice, createInboundAdvice, listCustomers } from '../../lib/api';

export default function InboundAdviceList() {
  const [advices, setAdvices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', expected_date: '', transport_details: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listInboundAdvice(), listCustomers()])
      .then(([a, c]) => {
        setAdvices(a);
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
    createInboundAdvice({ ...form, status: 'Submitted' })
      .then(() => {
        setShowForm(false);
        setForm({ customer_id: customers[0]?.ROWID || '', expected_date: '', transport_details: '' });
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <div className="toolbar">
        <h2>Inbound Operations</h2>
        {!showForm && (
          <button className="btn" onClick={() => setShowForm(true)}>
            + New Inbound Advice
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3>New Inbound Advice</h3>
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
            <label>Expected date</label>
            <input
              type="date"
              value={form.expected_date}
              onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Transport details</label>
            <textarea
              rows={2}
              value={form.transport_details}
              onChange={(e) => setForm({ ...form, transport_details: e.target.value })}
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
              <th>Expected date</th>
              <th>Transport</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {advices.map((a) => (
              <tr key={a.ROWID}>
                <td>{a.customer_name}</td>
                <td>{a.expected_date}</td>
                <td>{a.transport_details}</td>
                <td>
                  <span className="status-badge">{a.status}</span>
                </td>
                <td>
                  <Link className="link-btn" to={`/inbound/${a.ROWID}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {advices.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No inbound advices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
