import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  IconTruck,
  IconLogout,
  IconMenu,
  IconClose,
  IconDots,
} from './icons';

const NAV_GROUPS = [
  {
    label: null, // ungrouped, always first
    items: [{ to: '/', label: 'Dashboard', end: true, icon: IconGrid }],
  },
  {
    label: 'Masters',
    items: [
      { to: '/customers', label: 'Customers', icon: IconUsers },
      { to: '/warehouse', label: 'Warehouses', icon: IconWarehouse },
      { to: '/transporters', label: 'Transporters', icon: IconTruck },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/inbound', label: 'Inbounds', icon: IconInbound },
      { to: '/storage', label: 'Storage', icon: IconBox },
      { to: '/outbound', label: 'Outbounds', icon: IconOutbound },
      { to: '/delivery', label: 'Deliveries', icon: IconTruck },
      { to: '/val', label: 'VAL', icon: IconLayers },
      { to: '/tasks', label: 'Tasks', icon: IconChecklist },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: IconChart }],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin', label: 'Users', icon: IconGear },
      { to: '/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

// Curated subset for the mobile bottom bar -- the everyday operational
// screens. Everything else (Masters, Insights, Administration, and the rest
// of Operations) is one tap away behind "More", which opens the same full
// nav as the desktop sidebar rather than hiding those sections entirely.
const BOTTOM_NAV_KEYS = ['/', '/inbound', '/storage', '/outbound'];
const BOTTOM_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items).filter((item) => BOTTOM_NAV_KEYS.includes(item.to));

export default function AppShell() {
  const { user, businessRole, clearSession } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleSignOut = () => {
    clearSession(); // instant UI feedback, regardless of SDK behavior below
    signOut(window.location.origin + import.meta.env.BASE_URL + 'index.html');
  };

  const nav = (
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
  );

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <IconMenu width={22} height={22} />
        </button>
        <span className="mobile-topbar-brand">
          <IconWarehouse width={18} height={18} />
          WOMS
        </span>
        <span style={{ width: 22 }} />
      </header>

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={'sidebar' + (menuOpen ? ' mobile-open' : '')}>
        <div className="sidebar-mobile-head">
          <button
            className="brand"
            onClick={() => {
              window.location.href = window.location.origin + import.meta.env.BASE_URL;
            }}
          >
            <IconWarehouse className="brand-icon" width={22} height={22} />
            <span>WOMS</span>
          </button>
          <button className="sidebar-close-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <IconClose width={20} height={20} />
          </button>
        </div>
        {nav}
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
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="bottom-nav">
        {BOTTOM_NAV_ITEMS.map((item) => {
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
        <button className="bottom-nav-link" onClick={() => setMenuOpen(true)}>
          <IconDots width={20} height={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
