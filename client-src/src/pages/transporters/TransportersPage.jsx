import { useEffect, useState } from 'react';
import { listTransporters, createTransporter, editTransporter, removeTransporter } from '../../lib/api';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';

const EMPTY = { name: '', contact_person: '', phone: '', vehicle_registration: '' };

export default function TransportersPage() {
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { sorted, toggleSort, arrowFor } = useSortableData(transporters, 'name');

  const load = () => {
    setLoading(true);
    listTransporters()
      .then(setTransporters)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (row) => {
    setEditing(row === 'new' ? 'new' : row.ROWID);
    setForm(row === 'new' ? EMPTY : { ...row });
  };

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    const action =
      editing === 'new' ? createTransporter({ ...form, status: 'Active' }) : editTransporter({ ...form, ROWID: editing });
    action
      .then(() => {
        setEditing(null);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const handleDelete = (rowId) => {
    if (!window.confirm('Delete this transporter?')) return;
    removeTransporter(rowId)
      .then(load)
      .catch((err) => setError(err.message || String(err)));
  };

  return (
    <div>
      <div className="toolbar">
        <h2>Transporters</h2>
        {editing === null && (
          <button className="btn" onClick={() => startEdit('new')}>
            + New Transporter
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {editing !== null && (
        <form className="card" onSubmit={submit}>
          <h3>{editing === 'new' ? 'New Transporter' : 'Edit Transporter'}</h3>
          <div className="form-row">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Contact person</label>
              <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Vehicle registration</label>
              <input
                value={form.vehicle_registration}
                onChange={(e) => setForm({ ...form, vehicle_registration: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Name" sortKey="name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Contact" sortKey="contact_person" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Phone" sortKey="phone" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Vehicle reg." sortKey="vehicle_registration" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Status" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.ROWID}>
                <td>{t.name}</td>
                <td>{t.contact_person}</td>
                <td>{t.phone}</td>
                <td>{t.vehicle_registration}</td>
                <td>
                  <span className="status-badge">{t.status}</span>
                </td>
                <td>
                  <button className="link-btn" onClick={() => startEdit(t)}>
                    Edit
                  </button>{' '}
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(t.ROWID)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No transporters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
