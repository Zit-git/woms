import { useAuth } from '../context/AuthContext';

export default function DashboardHome() {
  const { user, businessRole } = useAuth();

  return (
    <div>
      <h2>Welcome{user ? `, ${user.first_name || user.email_id}` : ''}</h2>
      {businessRole && <p className="muted">Role: {businessRole}</p>}
      <div className="card-grid">
        {['Warehouse Overview', "Today's Inbound", "Today's Outbound", 'Warehouse Occupancy', 'Pending VAL', 'Pending Tasks'].map(
          (title) => (
            <div className="card" key={title}>
              <h3>{title}</h3>
              <p className="muted">Coming soon (Reports & Dashboards module)</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
