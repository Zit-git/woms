import { useEffect, useState } from 'react';
import { listContactsByCustomer, createContact, editContact, removeContact, setPrimaryContact } from '../lib/api';

const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Other'];
const EMPTY = { salutation: 'Mr.', first_name: '', last_name: '', email: '', phone: '' };

// A customer can have several contacts; the primary one is what other
// modules (e.g. the Inbound confirmation email) default to.
export default function ContactList({ customerId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    listContactsByCustomer(customerId)
      .then(setContacts)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [customerId]);

  const isPrimary = (c) => c.is_primary === true || c.is_primary === 'true';

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createContact({ ...form, customer_id: customerId, is_primary: contacts.length === 0 })
      .then(() => {
        setShowForm(false);
        setForm(EMPTY);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const startEdit = (c) => {
    setEditingId(c.ROWID);
    setEditForm({ salutation: c.salutation || 'Mr.', first_name: c.first_name, last_name: c.last_name, email: c.email || '', phone: c.phone || '' });
  };

  const saveEdit = () => {
    setBusyId(editingId);
    editContact({ ROWID: editingId, ...editForm })
      .then(() => {
        setEditingId(null);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyId(null));
  };

  const makePrimary = (contactId) => {
    setBusyId(contactId);
    setPrimaryContact(customerId, contactId)
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyId(null));
  };

  const remove = (contactId) => {
    setBusyId(contactId);
    removeContact(contactId)
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="card">
      <div className="toolbar">
        <h3>Contacts</h3>
        {!showForm && (
          <button className="btn secondary" onClick={() => setShowForm(true)}>
            + Add Contact
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form onSubmit={submit} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row" style={{ width: 90 }}>
              <label>Title</label>
              <select value={form.salutation} onChange={(e) => setForm({ ...form, salutation: e.target.value })}>
                {SALUTATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
            </div>
            <div className="form-row">
              <label>Last Name *</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted small">Loading...</p>
      ) : contacts.length === 0 ? (
        <p className="muted small">No contacts added yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) =>
              editingId === c.ROWID ? (
                <tr key={c.ROWID}>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <select
                      style={{ width: 70 }}
                      value={editForm.salutation}
                      onChange={(e) => setEditForm({ ...editForm, salutation: e.target.value })}
                    >
                      {SALUTATIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      style={{ width: 100 }}
                      value={editForm.first_name}
                      onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    />
                    <input
                      style={{ width: 100 }}
                      value={editForm.last_name}
                      onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  </td>
                  <td>
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  </td>
                  <td>
                    <button className="link-btn" onClick={saveEdit} disabled={busyId === c.ROWID}>
                      Save
                    </button>{' '}
                    <button className="link-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={c.ROWID}>
                  <td>
                    {c.salutation} {c.first_name} {c.last_name}
                    {isPrimary(c) && (
                      <span className="status-badge" style={{ marginLeft: 8 }}>
                        Primary
                      </span>
                    )}
                  </td>
                  <td>{c.email || <span className="muted">—</span>}</td>
                  <td>{c.phone || <span className="muted">—</span>}</td>
                  <td>
                    <button className="link-btn" onClick={() => startEdit(c)}>
                      Edit
                    </button>{' '}
                    {!isPrimary(c) && (
                      <button className="link-btn" onClick={() => makePrimary(c.ROWID)} disabled={busyId === c.ROWID}>
                        Set Primary
                      </button>
                    )}{' '}
                    <button className="link-btn" onClick={() => remove(c.ROWID)} disabled={busyId === c.ROWID}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
