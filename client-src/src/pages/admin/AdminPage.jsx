import { useEffect, useState } from 'react';
import { listAppUsers, listRolePermissions, inviteUser } from '../../lib/api';

const MODULE_ORDER = [
  'Customer Management',
  'Warehouse Management',
  'Inbound Operations',
  'Cargo & Storage Management',
  'QR Code & Label Management',
  'Operational Task Management',
  'Value Added Logistics',
  'Outbound Operations',
  'Reports & Dashboards',
  'System Administration',
];

const BUSINESS_ROLES = ['System Administrator', 'Warehouse Manager', 'Warehouse Supervisor', 'Warehouse Operator'];

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', businessRole: BUSINESS_ROLES[3] });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([listAppUsers(), listRolePermissions()])
      .then(([u, p]) => {
        setUsers(u);
        setPermissions(p);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const roles = [...new Set(permissions.map((p) => p.role))];
  const hasAccess = (role, module) => permissions.some((p) => p.role === role && p.module === module);

  const submitInvite = (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    const redirectUrl = window.location.origin + import.meta.env.BASE_URL + 'index.html';
    inviteUser(form.firstName, form.lastName, form.email, form.businessRole, redirectUrl)
      .then((res) => {
        setInviteResult({ ok: true, email: res.email });
        setForm({ firstName: '', lastName: '', email: '', businessRole: BUSINESS_ROLES[3] });
        setShowInvite(false);
        load();
      })
      .catch((err) => setInviteResult({ ok: false, message: err.error || err.message || String(err) }))
      .finally(() => setInviting(false));
  };

  return (
    <div>
      <div className="toolbar">
        <h2>System Administration</h2>
        {!showInvite && (
          <button className="btn" onClick={() => setShowInvite(true)}>
            + Invite User
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}
      {inviteResult && !inviteResult.ok && <div className="error-text">{inviteResult.message}</div>}
      {inviteResult && inviteResult.ok && (
        <div className="card">
          Invitation sent to <strong>{inviteResult.email}</strong>. They'll receive an email to set a password and sign in.
        </div>
      )}

      {showInvite && (
        <form className="card" onSubmit={submitInvite}>
          <h3>Invite User</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="form-row">
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-row">
            <label>Business role</label>
            <select value={form.businessRole} onChange={(e) => setForm({ ...form, businessRole: e.target.value })}>
              {BUSINESS_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={inviting}>
              {inviting ? 'Sending invite...' : 'Send Invite'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowInvite(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="muted">Loading...</p>}

      {!loading && (
        <>
          <h3>Users</h3>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Business Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.ROWID}>
                  <td>{u.email}</td>
                  <td>
                    <span className="status-badge">{u.business_role}</span>
                  </td>
                  <td>{u.user_status}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No app users registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>Role Permissions</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  {roles.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_ORDER.map((m) => (
                  <tr key={m}>
                    <td>{m}</td>
                    {roles.map((r) => (
                      <td key={r} style={{ textAlign: 'center' }}>
                        {hasAccess(r, m) ? '✓' : <span className="muted">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
