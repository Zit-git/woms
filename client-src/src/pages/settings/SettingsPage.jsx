import { useEffect, useState } from 'react';
import { listRecentAuditLog } from '../../lib/api';

export default function SettingsPage() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listRecentAuditLog(100)
      .then(setLog)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2>Settings</h2>

      <div className="card">
        <h3>Application</h3>
        <p>
          <strong>System:</strong> Warehouse Operations Management System (WOMS)
        </p>
        <p>
          <strong>Platform:</strong> Zoho Catalyst (Slate)
        </p>
      </div>

      <div className="toolbar">
        <h3>Audit Trail</h3>
      </div>
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Module</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.event_timestamp}</td>
                <td>{l.user_id || <span className="muted">—</span>}</td>
                <td>{l.action_type}</td>
                <td>{l.module}</td>
                <td>{l.record_id || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
