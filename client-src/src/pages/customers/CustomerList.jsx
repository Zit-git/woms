import { useEffect, useState } from 'react';
import { listCustomers, createCustomer, editCustomer, removeCustomer } from '../../lib/api';
import CustomerForm from './CustomerForm';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = (form) => {
    setSaving(true);
    const action = editing === 'new' ? createCustomer(form) : editCustomer({ ...form, ROWID: editing.ROWID });
    action
      .then(() => {
        setEditing(null);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const handleDelete = (rowId) => {
    if (!window.confirm('Delete this customer?')) return;
    removeCustomer(rowId)
      .then(load)
      .catch((err) => setError(err.message || String(err)));
  };

  return (
    <div>
      <div className="toolbar">
        <h2>Customer Management</h2>
        {editing === null && (
          <button className="btn" onClick={() => setEditing('new')}>
            + New Customer
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {editing && (
        <CustomerForm
          initial={editing === 'new' ? null : editing}
          saving={saving}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.ROWID}>
                <td>{c.name}</td>
                <td>{c.contact_person}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>
                  <span className="status-badge">{c.status}</span>
                </td>
                <td>
                  <button className="link-btn" onClick={() => setEditing(c)}>
                    Edit
                  </button>{' '}
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.ROWID)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
