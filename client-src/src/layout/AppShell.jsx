import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../lib/catalystClient';
import {
  IconGrid,
  IconUsers,
  IconWarehouse,
  IconInbound,
  IconBox,
  IconChecklist,
  IconLayers,
  IconOutbound,
  IconChart,
  IconGear,
  IconSettings,
  IconLogout,
} from './icons';

const NAV_GROUPS = [
  {
    label: null, // ungrouped, always first
    items: [{ to: '/', label: 'Dashboard', end: true, icon: IconGrid }],
  },
  {
    label: 'Operations',
    items: [
      { to: '/inbound', label: 'Inbound Operations', icon: IconInbound },
      { to: '/storage', label: 'Storage', icon: IconBox },
      { to: '/outbound', label: 'Outbound Operations', icon: IconOutbound },
      { to: '/tasks', label: 'Operational Tasks', icon: IconChecklist },
      { to: '/val', label: 'Value Added Logistics', icon: IconLayers },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/reports', label: 'Reports & Dashboards', icon: IconChart }],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin', label: 'System Administration', icon: IconGear },
      { to: '/settings', label: 'Settings', icon: IconSettings },
    ],
  },
  {
    label: 'Masters',
    items: [
      { to: '/customers', label: 'Customers', icon: IconUsers },
      { to: '/warehouse', label: 'Warehouses', icon: IconWarehouse },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function AppShell() {
  const { user, businessRole, clearSession } = useAuth();

  const handleSignOut = () => {
    clearSession(); // instant UI feedback, regardless of SDK behavior below
    signOut(window.location.origin + import.meta.env.BASE_URL + 'index.html');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">WOMS</div>
        <nav>
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label || 'root'}>
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                  >
                    <Icon className="nav-icon" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted small">{user?.email_id}</div>
          <div className="muted small">{businessRole}</div>
          <button className="link-btn sign-out-btn" onClick={handleSignOut}>
            <IconLogout width={14} height={14} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {ALL_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'bottom-nav-link' + (isActive ? ' active' : '')}
            >
              <Icon width={20} height={20} />
              <span>{item.label.split(' ')[0]}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
