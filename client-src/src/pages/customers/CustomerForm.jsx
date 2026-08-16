import { useState } from 'react';

const EMPTY = { name: '', contact_person: '', email: '', phone: '', address: '', status: 'Active' };

export default function CustomerForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <h3>{initial ? 'Edit Customer' : 'New Customer'}</h3>
      <div className="form-row">
        <label>Name *</label>
        <input value={form.name} onChange={set('name')} required />
      </div>
      <div className="form-row">
        <label>Contact person</label>
        <input value={form.contact_person} onChange={set('contact_person')} />
      </div>
      <div className="form-row">
        <label>Email</label>
        <input type="email" value={form.email} onChange={set('email')} />
      </div>
      <div className="form-row">
        <label>Phone</label>
        <input value={form.phone} onChange={set('phone')} />
      </div>
      <div className="form-row">
        <label>Address</label>
        <textarea value={form.address} onChange={set('address')} rows={2} />
      </div>
      <div className="form-row">
        <label>Status</label>
        <select value={form.status} onChange={set('status')}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>
      <div className="form-actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
