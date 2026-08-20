import { useEffect, useState } from 'react';
import { listTasks, createTask, editTask } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const STATUSES = ['Assigned', 'In Progress', 'Completed'];
const PRIORITIES = ['Low', 'Medium', 'High'];

export default function TasksPage() {
  const { businessRole, warehouseId, user } = useAuth();
  const viewer = { businessRole, warehouseId, email: user?.email_id };
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ task_type: '', assigned_to: '', task_priority: 'Medium', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('open'); // 'open' | 'all'
  const [busyRow, setBusyRow] = useState(null);

  const load = () => {
    setLoading(true);
    listTasks(viewer)
      .then(setTasks)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = (e) => {
    e.preventDefault();
    setSaving(true);
    createTask({ ...form, status: 'Assigned' })
      .then(() => {
        setShowForm(false);
        setForm({ task_type: '', assigned_to: '', task_priority: 'Medium', due_date: '' });
        load();
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setSaving(false));
  };

  const advanceStatus = (task) => {
    const next = task.status === 'Assigned' ? 'In Progress' : 'Completed';
    setBusyRow(task.ROWID);
    editTask({ ROWID: task.ROWID, status: next })
      .then(load)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusyRow(null));
  };

  const visible = filter === 'open' ? tasks.filter((t) => t.status !== 'Completed') : tasks;

  return (
    <div>
      <div className="toolbar">
        <h2>Operational Task Management</h2>
        {!showForm && (
          <button className="btn" onClick={() => setShowForm(true)}>
            + New Task
          </button>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={submit}>
          <h3>New Task</h3>
          <div className="form-row">
            <label>Task type / description</label>
            <input value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} required />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-row">
              <label>Assigned to</label>
              <input
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                placeholder={user?.email_id}
              />
            </div>
            <div className="form-row">
              <label>Priority</label>
              <select value={form.task_priority} onChange={(e) => setForm({ ...form, task_priority: e.target.value })}>
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

      <div className="tabs">
        <div className={'tab' + (filter === 'open' ? ' active' : '')} onClick={() => setFilter('open')}>
          Open
        </div>
        <div className={'tab' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
          All
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Assigned to</th>
              <th>Priority</th>
              <th>Due date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.ROWID}>
                <td>{t.task_type}</td>
                <td>{t.assigned_to}</td>
                <td>{t.task_priority}</td>
                <td>{t.due_date}</td>
                <td>
                  <span className="status-badge">{t.status}</span>
                </td>
                <td>
                  {t.status !== 'Completed' && (
                    <button className="link-btn" disabled={busyRow === t.ROWID} onClick={() => advanceStatus(t)}>
                      {busyRow === t.ROWID ? 'Saving...' : t.status === 'Assigned' ? 'Start' : 'Complete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No tasks to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
