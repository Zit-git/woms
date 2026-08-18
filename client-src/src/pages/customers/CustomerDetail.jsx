import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCustomerById, getCustomerActivity, editCustomer } from '../../lib/api';
import CustomerForm from './CustomerForm';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [activity, setActivity] = useState({ inbound: [], outbound: [], cargo: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getCustomerById(customerId), getCustomerActivity(customerId)])
      .then(([c, a]) => {
        setCustomer(c);
        setActivity(a);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [customerId]);

  const handleSave = (form) => {
    setSaving(true);
    editCustomer({ ...form, ROWID: customerId })
      .then(() => {
        setEditing(false);
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  if (loading) return <p className="muted">Loading...</p>;
  if (!customer) return <p className="error-text">Customer not found.</p>;

  return (
    <div>
      <button className="link-btn" onClick={() => navigate('/customers')}>
        &larr; Back to Customers
      </button>
      <div className="toolbar">
        <h2>{customer.name}</h2>
        {!editing && (
          <button className="btn secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {editing ? (
        <CustomerForm initial={customer} saving={saving} onSave={handleSave} onCancel={() => setEditing(false)} />
      ) : (
        <div className="card">
          <p>
            <strong>Contact person:</strong> {customer.contact_person || <span className="muted">—</span>}
          </p>
          <p>
            <strong>Email:</strong> {customer.email || <span className="muted">—</span>}
          </p>
          <p>
            <strong>Phone:</strong> {customer.phone || <span className="muted">—</span>}
          </p>
          <p>
            <strong>Address:</strong> {customer.address || <span className="muted">—</span>}
          </p>
          <p>
            <strong>Operational preferences:</strong> {customer.operational_preferences || <span className="muted">—</span>}
          </p>
          <p>
            <strong>Status:</strong> <span className="status-badge">{customer.status}</span>
          </p>
        </div>
      )}

      <h3>Inbound Advices ({activity.inbound.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Expected date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {activity.inbound.map((i) => (
            <tr key={i.ROWID}>
              <td>{i.expected_date}</td>
              <td>
                <span className="status-badge">{i.status}</span>
              </td>
              <td>
                <Link className="link-btn" to={`/inbound/${i.ROWID}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {activity.inbound.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No inbound advices yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Outbound Requests ({activity.outbound.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Requested date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {activity.outbound.map((o) => (
            <tr key={o.ROWID}>
              <td>{o.requested_date}</td>
              <td>
                <span className="status-badge">{o.status}</span>
              </td>
              <td>
                <Link className="link-btn" to={`/outbound/${o.ROWID}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {activity.outbound.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No outbound requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Cargo ({activity.cargo.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {activity.cargo.map((c) => (
            <tr key={c.ROWID}>
              <td>{c.description}</td>
              <td>
                {c.qty} {c.unit}
              </td>
              <td>
                <span className="status-badge">{c.status}</span>
              </td>
            </tr>
          ))}
          {activity.cargo.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No cargo on record.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
