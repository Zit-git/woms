import { Fragment, useEffect, useState } from 'react';
import {
  listAppUsers,
  listRolePermissions,
  inviteUser,
  listWarehouses,
  listAllUserWarehouseRoles,
  createUserWarehouseRole,
  editUserWarehouseRole,
  removeUserWarehouseRole,
} from '../../lib/api';
import { ADMIN_ROLE, STAFF_LEVEL, WAREHOUSE_ROLES } from '../../lib/access';
import { authRedirectUrl } from '../../lib/catalystClient';
import AuditTrail from '../../components/AuditTrail';

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
  const [access, setAccess] = useState([]); // UserWarehouseRole rows
  const [permissions, setPermissions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const blankRow = (w = warehouses) => ({ warehouseId: w[0]?.ROWID || '', role: WAREHOUSE_ROLES[2] });
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', level: STAFF_LEVEL, rows: [] });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [managingId, setManagingId] = useState(null); // AppUsers ROWID whose access is being edited
  const [newRow, setNewRow] = useState({ warehouseId: '', role: WAREHOUSE_ROLES[2] });
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([listAppUsers(), listRolePermissions(), listWarehouses(), listAllUserWarehouseRoles()])
      .then(([u, p, w, a]) => {
        setUsers(u);
        setPermissions(p);
        setWarehouses(w);
        setAccess(a);
        setForm((f) => (f.rows.length ? f : { ...f, rows: [blankRow(w)] }));
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const warehouseName = (id) => warehouses.find((w) => String(w.ROWID) === String(id))?.name || 'Unknown warehouse';
  const roles = [...new Set(permissions.map((p) => p.role))];
  const hasAccess = (role, module) => permissions.some((p) => p.role === role && p.module === module);
  const accessOf = (userId) => access.filter((a) => String(a.app_user_id) === String(userId));

  const setRow = (i, patch) => setForm((f) => ({ ...f, rows: f.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));

  const submitInvite = (e) => {
    e.preventDefault();
    const rows = form.level === ADMIN_ROLE ? [] : form.rows;
    if (form.level !== ADMIN_ROLE) {
      if (!rows.length || rows.some((r) => !r.warehouseId)) return setInviteResult({ ok: false, message: 'Give the user access to at least one warehouse.' });
      if (new Set(rows.map((r) => String(r.warehouseId))).size !== rows.length) {
        return setInviteResult({ ok: false, message: 'Each warehouse can only appear once per user.' });
      }
    }
    setInviting(true);
    setInviteResult(null);
    const assignments = rows.map((r) => ({ warehouseId: String(r.warehouseId), role: r.role }));
    inviteUser(form.firstName, form.lastName, form.email, form.level, authRedirectUrl(), assignments)
      .then((res) => {
        setInviteResult({ ok: true, email: res.email });
        setForm({ firstName: '', lastName: '', email: '', level: STAFF_LEVEL, rows: [blankRow()] });
        setShowInvite(false);
        load();
      })
      .catch((err) => setInviteResult({ ok: false, message: err.error || err.message || String(err) }))
      .finally(() => setInviting(false));
  };

  const run = (fn) => {
    setBusy(true);
    setError('');
    return fn()
      .then(load)
      .catch((err) => setError(err.error || err.message || String(err)))
      .finally(() => setBusy(false));
  };
  const addAccess = (userId) => {
    if (!newRow.warehouseId) return;
    if (accessOf(userId).some((a) => String(a.warehouse_id) === String(newRow.warehouseId))) {
      return setError('This user already has a role in that warehouse. Change it instead.');
    }
    run(() => createUserWarehouseRole({ app_user_id: userId, warehouse_id: newRow.warehouseId, business_role: newRow.role }));
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
            <label>Access level</label>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value={STAFF_LEVEL}>Warehouse staff (role per warehouse)</option>
              <option value={ADMIN_ROLE}>System Administrator (all warehouses)</option>
            </select>
          </div>
          {form.level !== ADMIN_ROLE && (
            <div className="form-row">
              <label>Warehouses and roles</label>
              {form.rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <select value={r.warehouseId} onChange={(e) => setRow(i, { warehouseId: e.target.value })} required>
                    {warehouses.map((w) => (
                      <option key={w.ROWID} value={w.ROWID}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <select value={r.role} onChange={(e) => setRow(i, { role: e.target.value })}>
                    {WAREHOUSE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  {form.rows.length > 1 && (
                    <button type="button" className="link-btn" onClick={() => setForm((f) => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="link-btn" onClick={() => setForm((f) => ({ ...f, rows: [...f.rows, blankRow()] }))}>
                + Add another warehouse
              </button>
              {!warehouses.length && <p className="muted small">Add a warehouse first (Warehouse Management).</p>}
            </div>
          )}
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
                <th>Access</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdminUser = u.business_role === ADMIN_ROLE;
                const mine = accessOf(u.ROWID);
                return (
                  <Fragment key={u.ROWID}>
                    <tr>
                      <td>{u.email}</td>
                      <td>
                        {isAdminUser ? (
                          <span className="status-badge">System Administrator · all warehouses</span>
                        ) : mine.length ? (
                          mine.map((a) => (
                            <div key={a.ROWID}>
                              <span className="status-badge">{a.business_role}</span> {warehouseName(a.warehouse_id)}
                            </div>
                          ))
                        ) : (
                          <span className="muted">No warehouse access</span>
                        )}
                      </td>
                      <td>{u.user_status}</td>
                      <td>
                        {!isAdminUser && (
                          <button className="link-btn" onClick={() => setManagingId(managingId === u.ROWID ? null : u.ROWID)}>
                            {managingId === u.ROWID ? 'Close' : 'Manage access'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {managingId === u.ROWID && (
                      <tr key={`${u.ROWID}-manage`}>
                        <td colSpan={4}>
                          {mine.map((a) => (
                            <div key={a.ROWID} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                              <strong style={{ minWidth: 160 }}>{warehouseName(a.warehouse_id)}</strong>
                              <select
                                value={a.business_role}
                                disabled={busy}
                                onChange={(e) => run(() => editUserWarehouseRole({ ROWID: a.ROWID, business_role: e.target.value }))}
                              >
                                {WAREHOUSE_ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                              <button className="link-btn" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => run(() => removeUserWarehouseRole(a.ROWID))}>
                                Remove access
                              </button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <select value={newRow.warehouseId} onChange={(e) => setNewRow({ ...newRow, warehouseId: e.target.value })}>
                              <option value="">Add warehouse...</option>
                              {warehouses
                                .filter((w) => !mine.some((a) => String(a.warehouse_id) === String(w.ROWID)))
                                .map((w) => (
                                  <option key={w.ROWID} value={w.ROWID}>
                                    {w.name}
                                  </option>
                                ))}
                            </select>
                            <select value={newRow.role} onChange={(e) => setNewRow({ ...newRow, role: e.target.value })}>
                              {WAREHOUSE_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            <button className="btn secondary" disabled={busy || !newRow.warehouseId} onClick={() => addAccess(u.ROWID)}>
                              Add
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
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

          <AuditTrail modules="System Administration" />
        </>
      )}
    </div>
  );
}
