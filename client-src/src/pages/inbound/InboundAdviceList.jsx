import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInboundAdvice, createInboundAdvice, listCustomers, listTransporters, listWarehouses } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';
import { useAuth } from '../../context/AuthContext';

export default function InboundAdviceList() {
  const navigate = useNavigate();
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const [advices, setAdvices] = useState([]);
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
    expected_date: '',
    transport_details: '',
    reference_number: '',
  });
  const [saving, setSaving] = useState(false);
  const { sorted, toggleSort, arrowFor } = useSortableData(advices);

  const load = () => {
    setLoading(true);
    Promise.all([listInboundAdvice(viewer), listCustomers(), listTransporters(), listWarehouses()])
      .then(([a, c, t, w]) => {
        setAdvices(a);
        setCustomers(c);
        setTransporters(t);
        setWarehouses(w);
        if (!form.customer_id && c.length) setForm((f) => ({ ...f, customer_id: c[0].ROWID }));
        if (!form.warehouse_id && w.length) {
          setForm((f) => ({ ...f, warehouse_id: warehouseId || w[0].ROWID }));
        }
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createInboundAdvice({ ...form, transporter_id: form.transporter_id || undefined, status: 'Submitted' })
      .then(() => {
        setShowForm(false);
        setForm({
          customer_id: customers[0]?.ROWID || '',
          transporter_id: '',
          warehouse_id: warehouseId || warehouses[0]?.ROWID || '',
          expected_date: '',
          transport_details: '',
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
            <label>Warehouse</label>
            <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} required>
              {warehouses.map((w) => (
                <option key={w.ROWID} value={w.ROWID}>
                  {w.name}
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
              <SortableTh label="Ref #" sortKey="reference_number" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Customer" sortKey="customer_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Expected date" sortKey="expected_date" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Transporter" sortKey="transporter_name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Status" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.ROWID} className="clickable-row" onClick={() => navigate(`/inbound/${a.ROWID}`)}>
                <td>{a.reference_number || <span className="muted">—</span>}</td>
                <td>{a.customer_name}</td>
                <td>{a.expected_date}</td>
                <td>{a.transporter_name || <span className="muted">—</span>}</td>
                <td>
                  <span className="status-badge">{a.status}</span>
                </td>
                <td>
                  <span className="link-btn">Open</span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
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
