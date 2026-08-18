import { useEffect, useState } from 'react';
import { listAppUsers, listRolePermissions } from '../../lib/api';

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

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listAppUsers(), listRolePermissions()])
      .then(([u, p]) => {
        setUsers(u);
        setPermissions(p);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, []);

  const roles = [...new Set(permissions.map((p) => p.role))];
  const hasAccess = (role, module) => permissions.some((p) => p.role === role && p.module === module);

  return (
    <div>
      <h2>System Administration</h2>
      <p className="muted small">
        User accounts are provisioned via Catalyst Authentication; this page manages business roles and shows what each role
        can access.
      </p>

      {error && <div className="error-text">{error}</div>}
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
