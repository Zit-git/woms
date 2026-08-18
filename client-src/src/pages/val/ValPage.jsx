import { useEffect, useState } from 'react';
import {
  listValRequests,
  createValRequest,
  editValRequest,
  listValTasksByRequest,
  createValTask,
  editValTask,
  listCustomers,
  listCargoForCustomer,
} from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const SERVICE_TYPES = ['Inspection', 'Repacking', 'Relabelling', 'Kitting', 'Quality Check'];

export default function ValPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerCargo, setCustomerCargo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', cargo_id: '', service_type: SERVICE_TYPES[0], requested_date: '' });
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([listValRequests(), listCustomers()])
      .then(([r, c]) => {
        setRequests(r);
        setCustomers(c);
        if (!form.customer_id && c.length) setForm((f) => ({ ...f, customer_id: c[0].ROWID }));
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!form.customer_id) return;
    listCargoForCustomer(form.customer_id).then((cargo) => {
      setCustomerCargo(cargo);
      setForm((f) => ({ ...f, cargo_id: cargo[0]?.ROWID || '' }));
    });
  }, [form.customer_id]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.cargo_id) return;
    setSaving(true);
    createValRequest({
      customer_id: form.customer_id,
      cargo_id: form.cargo_id,
      service_type: form.service_type,
      requested_date: form.requested_date,
      status: 'Submitted',
    })
      .then(() => {
        setShowForm(false);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const advance = (reqRow) => {
    setBusyRow(reqRow.ROWID);
    const chain =
      reqRow.status === 'Submitted'
        ? listValTasksByRequest(reqRow.ROWID)
            .then((tasks) =>
              tasks.length
                ? tasks[0]
                : createValTask({ val_request_id: reqRow.ROWID, assigned_to: user?.email_id || '', status: 'Assigned' })
            )
            .then(() => editValRequest({ ROWID: reqRow.ROWID, status: 'Assigned' }))
        : reqRow.status === 'Assigned'
        ? editValRequest({ ROWID: reqRow.ROWID, status: 'In Progress' })
        : editValRequest({ ROWID: reqRow.ROWID, status: 'Completed' });

    chain
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  const nextActionLabel = { Submitted: 'Assign', Assigned: 'Start', 'In Progress': 'Complete' };

  return (
    <div>
      <div className="toolbar">
        <h2>Value Added Logistics</h2>
        {!showForm && (
          <button className="btn" onClick={() => setShowForm(true)}>
            + New VAL Request
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3>New VAL Request</h3>
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
            <label>Cargo</label>
            <select value={form.cargo_id} onChange={(e) => setForm({ ...form, cargo_id: e.target.value })} required>
              <option value="">Select cargo...</option>
              {customerCargo.map((c) => (
                <option key={c.ROWID} value={c.ROWID}>
                  {c.description} ({c.qty} {c.unit}) - {c.status}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Service type</label>
              <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving || !customerCargo.length}>
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          {!customerCargo.length && <p className="muted small">This customer has no cargo on record yet.</p>}
        </form>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Cargo</th>
              <th>Service</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.ROWID}>
                <td>{r.customer_name}</td>
                <td>{r.cargo_description}</td>
                <td>{r.service_type}</td>
                <td>
                  <span className="status-badge">{r.status}</span>
                </td>
                <td>
                  {r.status !== 'Completed' && (
                    <button className="link-btn" disabled={busyRow === r.ROWID} onClick={() => advance(r)}>
                      {busyRow === r.ROWID ? 'Saving...' : nextActionLabel[r.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No VAL requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
