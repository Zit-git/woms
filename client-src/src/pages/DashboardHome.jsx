import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../lib/api';

const CARDS = [
  { key: 'todaysInbound', title: "Today's Inbound", suffix: 'advices', to: '/inbound' },
  { key: 'todaysOutbound', title: "Today's Outbound", suffix: 'requests', to: '/outbound' },
  { key: 'activeCargo', title: 'Cargo In Warehouse', suffix: 'items', to: '/reports' },
  { key: 'pendingTasks', title: 'Pending Tasks', suffix: 'open', to: '/tasks' },
  { key: 'pendingVal', title: 'Pending VAL', suffix: 'open', to: '/val' },
  { key: 'totalCustomers', title: 'Customers', suffix: 'total', to: '/customers' },
];

export default function DashboardHome() {
  const { user, businessRole } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setError(err.message || String(err)));
  }, []);

  const occupancyPct =
    stats && stats.totalLocations > 0 ? Math.round((stats.occupiedLocations / stats.totalLocations) * 100) : null;

  return (
    <div>
      <h2>Welcome{user ? `, ${user.first_name || user.email_id}` : ''}</h2>
      {businessRole && <p className="muted">Role: {businessRole}</p>}

      {error && <div className="error-text">{error}</div>}

      <div className="card-grid">
        <div className="card kpi-card">
          <h3>Warehouse Occupancy</h3>
          {stats ? (
            <>
              <div className="kpi-value">{occupancyPct === null ? '—' : `${occupancyPct}%`}</div>
              <p className="muted small">
                {stats.occupiedLocations} of {stats.totalLocations} locations in use
              </p>
            </>
          ) : (
            <p className="muted">Loading...</p>
          )}
        </div>

        {CARDS.map((c) => (
          <Link className="card kpi-card" key={c.key} to={c.to}>
            <h3>{c.title}</h3>
            <div className="kpi-value">{stats ? stats[c.key] : '—'}</div>
            <p className="muted small">{c.suffix}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
