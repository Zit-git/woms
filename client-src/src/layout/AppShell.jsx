import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../lib/catalystClient';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Customer Management' },
  { to: '/warehouse', label: 'Warehouse Management' },
  { to: '/inbound', label: 'Inbound Operations' },
  { to: '/cargo-storage', label: 'Cargo & Storage Management' },
  { to: '/qr-labels', label: 'QR Code & Label Management' },
  { to: '/tasks', label: 'Operational Task Management' },
  { to: '/val', label: 'Value Added Logistics' },
  { to: '/outbound', label: 'Outbound Operations' },
  { to: '/reports', label: 'Reports & Dashboards' },
  { to: '/admin', label: 'System Administration' },
];

export default function AppShell() {
  const { user, businessRole } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">WOMS</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted small">{user?.email_id}</div>
          <div className="muted small">{businessRole}</div>
          <button className="link-btn" onClick={() => signOut(window.location.origin + import.meta.env.BASE_URL + 'index.html')}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 'bottom-nav-link' + (isActive ? ' active' : '')}
          >
            {item.label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
