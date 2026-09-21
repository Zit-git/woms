import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats } from '../lib/api';
import { IconInbound, IconOutbound, IconBox, IconChecklist, IconLayers, IconUsers, IconWarehouse } from '../layout/icons';

const CARDS = [
  { key: 'todaysInbound', title: "Today's Inbound", suffix: 'advices', to: '/inbound', icon: IconInbound, tone: 'teal' },
  { key: 'todaysOutbound', title: "Today's Outbound", suffix: 'requests', to: '/outbound', icon: IconOutbound, tone: 'violet' },
  { key: 'activeCargo', title: 'Cargo In Warehouse', suffix: 'items', to: '/reports', icon: IconBox, tone: 'amber' },
  { key: 'pendingTasks', title: 'Pending Tasks', suffix: 'open', to: '/tasks', icon: IconChecklist, tone: 'rose' },
  { key: 'pendingVal', title: 'Pending VAL', suffix: 'open', to: '/val', icon: IconLayers, tone: 'indigo' },
  { key: 'totalCustomers', title: 'Customers', suffix: 'total', to: '/customers', icon: IconUsers, tone: 'green' },
];

export default function DashboardHome() {
  const { user, businessRole, canAccessPath } = useAuth();
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
          <div className="kpi-icon tone-blue">
            <IconWarehouse width={20} height={20} />
          </div>
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

        {CARDS.filter((c) => canAccessPath(c.to)).map((c) => {
          const Icon = c.icon;
          return (
            <Link className="card kpi-card" key={c.key} to={c.to}>
              <div className={`kpi-icon tone-${c.tone}`}>
                <Icon width={20} height={20} />
              </div>
              <h3>{c.title}</h3>
              <div className="kpi-value">{stats ? stats[c.key] : '—'}</div>
              <p className="muted small">{c.suffix}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
