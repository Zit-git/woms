import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCustomers, createCustomer, editCustomer, removeCustomer, removeCustomers } from '../../lib/api';
import CustomerForm from './CustomerForm';
import SortableTh from '../../components/SortableTh';
import { useSortableData } from '../../lib/useSortableData';

export default function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { sorted, sortKey, toggleSort, arrowFor } = useSortableData(customers, 'name');

  const load = () => {
    setLoading(true);
    listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
    setSelected(new Set());
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

  const toggleSelected = (rowId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === sorted.length ? new Set() : new Set(sorted.map((c) => c.ROWID))));
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selected.size} selected customer(s)?`)) return;
    setBulkBusy(true);
    removeCustomers([...selected])
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBulkBusy(false));
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

      {selected.size > 0 && (
        <div className="bulk-toolbar">
          <span>{selected.size} selected</span>
          <button className="link-btn" style={{ color: 'var(--danger)' }} disabled={bulkBusy} onClick={handleBulkDelete}>
            {bulkBusy ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button className="link-btn" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="checkbox-cell">
                <input type="checkbox" checked={selected.size === sorted.length && sorted.length > 0} onChange={toggleSelectAll} />
              </th>
              <SortableTh label="Name" sortKey="name" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Contact" sortKey="contact_person" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Email" sortKey="email" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Phone" sortKey="phone" onSort={toggleSort} arrowFor={arrowFor} />
              <SortableTh label="Status" sortKey="status" onSort={toggleSort} arrowFor={arrowFor} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.ROWID} className="clickable-row" onClick={() => navigate(`/customers/${c.ROWID}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(c.ROWID)} onChange={() => toggleSelected(c.ROWID)} />
                </td>
                <td>{c.name}</td>
                <td>{c.contact_person}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>
                  <span className="status-badge">{c.status}</span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="link-btn" onClick={() => setEditing(c)}>
                    Edit
                  </button>{' '}
                  <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.ROWID)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
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
