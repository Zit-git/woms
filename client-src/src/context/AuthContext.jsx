import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../lib/catalystClient';
import { getAppUserByEmail, listRolePermissions, listUserWarehouseRoles, listWarehouses } from '../lib/api';
import { ADMIN_ROLE, canApproveIn, canApproveAnywhere, canAccessWarehouse, roleIn, describeAccess } from '../lib/access';
import { moduleForPath } from '../lib/permissions';

const AuthContext = createContext(null);

// The last verified session, kept so a reload can paint the app straight away
// instead of waiting ~2-3 sequential Catalyst round trips (~0.8 s each) for the
// sign-in bootstrap. It is only a UI hint: it's re-verified in the background on
// every load, replaced if the signed-in user differs, and wiped on sign-out
// (signOut clears localStorage). Catalyst still enforces access server-side.
const SNAPSHOT_KEY = 'woms.authSnapshot';
const readSnapshot = () => {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)) || null;
  } catch {
    return null;
  }
};
const writeSnapshot = (snap) => {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // just means the next load takes the slower path
  }
};
const clearSnapshot = () => {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // nothing to clear
  }
};

// Module access is the union of what each role the user holds grants.
function modulesFor(row, assignments, perms) {
  const roles = row?.business_role === ADMIN_ROLE ? [ADMIN_ROLE] : [...new Set(assignments.map((a) => a.role))];
  return new Set(perms.filter((p) => roles.includes(p.role)).map((p) => p.module));
}

export function AuthProvider({ children }) {
  const [snapshot] = useState(readSnapshot);
  const [user, setUser] = useState(snapshot?.user || null);
  const [appUser, setAppUser] = useState(snapshot?.appUser || null);
  const [assignments, setAssignments] = useState(snapshot?.assignments || []); // [{ warehouseId, role }]
  const [warehouseNames, setWarehouseNames] = useState(snapshot?.warehouses || []);
  const [activeWarehouseId, setActiveWarehouseIdState] = useState(() => {
    try {
      return localStorage.getItem('woms.activeWarehouse') || '';
    } catch {
      return '';
    }
  });
  const [allowedModules, setAllowedModules] = useState(() =>
    snapshot ? modulesFor(snapshot.appUser, snapshot.assignments || [], snapshot.perms || []) : new Set()
  );
  const [loading, setLoading] = useState(!snapshot);

  useEffect(() => {
    let cancelled = false;
    // Neither of these depends on who is signed in, so they start now, alongside
    // the session check, instead of after it.
    const permsP = listRolePermissions();
    const warehousesP = listWarehouses();
    permsP.catch(() => {});
    warehousesP.catch(() => {});

    getCurrentUser().then((currentUser) => {
      if (cancelled) return;
      if (!currentUser) {
        clearSnapshot();
        setUser(null);
        setAppUser(null);
        setAssignments([]);
        setAllowedModules(new Set());
        setLoading(false);
        return;
      }
      setUser(currentUser);
      // The remembered session belonged to someone else: don't show their access.
      if (snapshot && snapshot.user?.email_id !== currentUser.email_id) {
        clearSnapshot();
        setAppUser(null);
        setAssignments([]);
        setAllowedModules(new Set());
        setLoading(true);
      }
      Promise.all([getAppUserByEmail(currentUser.email_id), permsP, warehousesP])
        .then(async ([row, perms, warehouses]) => {
          if (cancelled) return;
          const rows = row && row.business_role !== ADMIN_ROLE ? await listUserWarehouseRoles(row.ROWID) : [];
          if (cancelled) return;
          const mine = rows.map((r) => ({ warehouseId: String(r.warehouse_id), role: r.business_role }));
          setAppUser(row);
          setAssignments(mine);
          setWarehouseNames(warehouses);
          setAllowedModules(modulesFor(row, mine, perms));
          writeSnapshot({ user: currentUser, appUser: row, assignments: mine, warehouses, perms });
        })
        .catch(() => {
          // A *failed* lookup (network error, a half-cleared session right
          // after sign-out, ...) is not the same thing as "this account
          // genuinely has no role" -- treating them the same showed a
          // confusing "no role" screen to people whose session had simply
          // gone stale. Fall back to signed-out instead: safe (still fails
          // closed) and correct (Login is the honest state here).
          if (!cancelled) {
            clearSnapshot();
            setUser(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clears our own app-level session state immediately, independent of
  // whatever the Catalyst SDK's signOut() does server-side (its behavior
  // is inconsistent across auth protocols -- see catalystClient.js). The
  // route gate in App.jsx reacts to `user` becoming null and swaps to the
  // Login screen instantly, no page reload required.
  const clearSession = () => {
    clearSnapshot();
    setUser(null);
    setAppUser(null);
    setAssignments([]);
    setAllowedModules(new Set());
  };

  const isAdmin = appUser?.business_role === ADMIN_ROLE && appUser.user_status !== 'Inactive';
  // Admins have access everywhere; everyone else needs at least one warehouse assignment (fail closed).
  const hasActiveRole = !!appUser && appUser.user_status !== 'Inactive' && (isAdmin || assignments.length > 0);
  const canAccessModule = (module) => hasActiveRole && (!module || allowedModules.has(module));
  const canAccessPath = (pathname) => canAccessModule(moduleForPath(pathname));

  const setActiveWarehouseId = (id) => {
    setActiveWarehouseIdState(id || '');
    try {
      if (id) localStorage.setItem('woms.activeWarehouse', id);
      else localStorage.removeItem('woms.activeWarehouse');
    } catch {
      // the selector just won't be remembered
    }
  };

  // What lib/api.js uses to scope every list to the viewer's warehouses.
  const viewer = useMemo(
    () => ({
      isAdmin,
      email: user?.email_id || '',
      assignments,
      // A remembered selection that no longer applies (access removed) is ignored.
      activeWarehouseId: activeWarehouseId && (isAdmin || assignments.some((a) => a.warehouseId === activeWarehouseId)) ? activeWarehouseId : '',
    }),
    [isAdmin, user, assignments, activeWarehouseId]
  );

  const value = {
    user,
    viewer,
    isAdmin,
    assignments,
    businessRole: appUser ? describeAccess(viewer, warehouseNames) || null : null,
    // Role in a specific warehouse, and what that role may do there.
    roleIn: (warehouseId) => roleIn(viewer, warehouseId),
    canAccessWarehouse: (warehouseId) => canAccessWarehouse(viewer, warehouseId),
    canApproveIn: (warehouseId) => canApproveIn(viewer, warehouseId),
    canApproveAnywhere: canApproveAnywhere(viewer),
    activeWarehouseId: viewer.activeWarehouseId,
    setActiveWarehouseId,
    accessibleWarehouses: warehouseNames.filter((w) => isAdmin || assignments.some((a) => a.warehouseId === String(w.ROWID))),
    loading,
    isAuthenticated: !!user,
    hasActiveRole,
    canAccessModule,
    canAccessPath,
    clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
