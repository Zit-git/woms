import { useEffect, useState } from 'react';
import { listAuditLogForModule } from '../lib/api';

// modules: one module name or an array of related module tags (e.g. a
// record's own module plus its "... Photos" upload tag). recordId: if set,
// scopes to that record; otherwise shows the module's most recent activity.
export default function AuditTrail({ modules, recordId, title = 'Audit Trail' }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    listAuditLogForModule(modules, recordId)
      .then(setLog)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(modules), recordId]);

  return (
    <div className="card">
      <h3>{title}</h3>
      {error && <div className="error-text">{error}</div>}
      {loading ? (
        <p className="muted small">Loading...</p>
      ) : log.length === 0 ? (
        <p className="muted small">No audit entries yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.ROWID}>
                <td>{l.event_timestamp}</td>
                <td>{l.user_id || <span className="muted">—</span>}</td>
                <td>{l.action_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
