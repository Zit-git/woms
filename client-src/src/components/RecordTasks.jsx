import { useEffect, useState } from 'react';
import { listTasksForRecord, createTask, editTask, notifyEvent } from '../lib/api';

const PRIORITIES = ['Low', 'Medium', 'High'];

// moduleRef/recordRefId: what this task set is scoped to (e.g. "Inbound
// Operations" / the InboundAdvice ROWID) -- matches Tasks.module_ref /
// record_ref_id, already on the table for exactly this purpose.
export default function RecordTasks({ moduleRef, recordRefId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ task_type: '', assigned_to: '', priority: 'Medium', due_date: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listTasksForRecord(moduleRef, recordRefId)
      .then(setTasks)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [moduleRef, recordRefId]);

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createTask({ ...form, module_ref: moduleRef, record_ref_id: String(recordRefId), status: 'Assigned' })
      .then(() => {
        if (form.assigned_to) {
          notifyEvent(
            'TASK_ASSIGNMENT',
            form.assigned_to,
            String(recordRefId),
            `New task assigned: ${form.task_type}`,
            moduleRef
          ).catch(() => null); // notification failure shouldn't block task creation
        }
      })
      .then(() => {
        setShowForm(false);
        setForm({ task_type: '', assigned_to: '', priority: 'Medium', due_date: '' });
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const advance = (task) => {
    const next = task.status === 'Assigned' ? 'In Progress' : 'Completed';
    editTask({ ROWID: task.ROWID, status: next })
      .then(load)
      .catch((err) => setError(err.message || String(err)));
  };

  return (
    <div className="card">
      <div className="toolbar">
        <h3>Tasks</h3>
        {!showForm && (
          <button className="btn secondary" onClick={() => setShowForm(true)}>
            + New Task
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form onSubmit={submit} style={{ marginBottom: 12 }}>
          <div className="form-row">
            <label>Task</label>
            <input value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} required />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Assigned to (email)</label>
              <input
                type="email"
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Due date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted small">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="muted small">No tasks linked to this record yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Assigned to</th>
              <th>Priority</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.ROWID}>
                <td>{t.task_type}</td>
                <td>{t.assigned_to}</td>
                <td>{t.priority}</td>
                <td>
                  <span className="status-badge">{t.status}</span>
                </td>
                <td>
                  {t.status !== 'Completed' && (
                    <button className="link-btn" onClick={() => advance(t)}>
                      {t.status === 'Assigned' ? 'Start' : 'Complete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
