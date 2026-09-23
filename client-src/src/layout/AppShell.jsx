import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { moduleForPath } from '../lib/permissions';
import { useAuth } from '../context/AuthContext';
import { signOut, authRedirectUrl } from '../lib/catalystClient';
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

export default function AppShell() {
  const { user, businessRole, clearSession, canAccessPath } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Only show what this role may open; drop groups that end up empty.
  const visibleGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => canAccessPath(item.to)) })).filter(
    (g) => g.items.length > 0
  );
  const BOTTOM_NAV_ITEMS = visibleGroups.flatMap((g) => g.items).filter((item) => BOTTOM_NAV_KEYS.includes(item.to));
  const pageAllowed = canAccessPath(location.pathname);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleSignOut = () => {
    clearSession(); // instant UI feedback, regardless of SDK behavior below
    signOut(authRedirectUrl());
  };

  const nav = (
    <nav>
      {visibleGroups.map((group) => (
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
        {pageAllowed ? (
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        ) : (
          <div className="card" style={{ maxWidth: 520 }}>
            <h2>No access</h2>
            <p className="muted">Your role does not include this area. Ask an administrator if you need it.</p>
          </div>
        )}
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
