import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, recordAuthIssue, readAuthIssue, clearAuthIssue } from '../lib/catalystClient';
import { getAppUserByEmail, listRolePermissions, listUserWarehouseRoles, listWarehouses, listAppSettings, saveAppSetting } from '../lib/api';
import { resolveFeatures } from '../lib/features';
import { ADMIN_ROLE, canApproveIn, canApproveAnywhere, canAccessWarehouse, roleIn, describeAccess } from '../lib/access';
import { moduleForPath } from '../lib/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [assignments, setAssignments] = useState([]); // [{ warehouseId, role }]
  const [warehouseNames, setWarehouseNames] = useState([]);
  const [activeWarehouseId, setActiveWarehouseIdState] = useState(() => {
    try {
      return localStorage.getItem('woms.activeWarehouse') || '';
    } catch {
      return '';
    }
  });
  const [settingRows, setSettingRows] = useState([]);
  const [allowedModules, setAllowedModules] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  // Why the sign-in was refused after Catalyst accepted it (shown on the login screen).
  const [authError, setAuthError] = useState(() => readAuthIssue());

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((currentUser) => {
      if (cancelled) return;
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
        return;
      }
      // Fetched together rather than one after the other: listRolePermissions
      // doesn't depend on the AppUsers lookup, and chaining them cost an extra
      // full network round trip on every page load.
      Promise.all([getAppUserByEmail(currentUser.email_id), listRolePermissions(), listWarehouses().catch(() => []), listAppSettings().catch(() => [])])
        .then(async ([row, perms, warehouses, settings]) => {
          if (cancelled) return;
          const rows = row && row.business_role !== ADMIN_ROLE ? await listUserWarehouseRoles(row.ROWID) : [];
          if (cancelled) return;
          const mine = rows.map((r) => ({ warehouseId: String(r.warehouse_id), role: r.business_role }));
          clearAuthIssue();
          setAuthError('');
          setAppUser(row);
          setAssignments(mine);
          setWarehouseNames(warehouses);
          setSettingRows(settings);
          // Module access is the union of what each role the user holds grants.
          const roles = row?.business_role === ADMIN_ROLE ? [ADMIN_ROLE] : [...new Set(mine.map((a) => a.role))];
          setAllowedModules(new Set(perms.filter((p) => roles.includes(p.role)).map((p) => p.module)));
        })
        .catch((err) => {
          const reason = `Your access could not be loaded after sign-in: ${err?.message || err?.error || JSON.stringify(err)}`;
          recordAuthIssue(reason);
          if (!cancelled) setAuthError(reason);
          // A *failed* lookup (network error, a half-cleared session right
          // after sign-out, ...) is not the same thing as "this account
          // genuinely has no role" -- treating them the same showed a
          // confusing "no role" screen to people whose session had simply
          // gone stale. Fall back to signed-out instead: safe (still fails
          // closed) and correct (Login is the honest state here).
          if (!cancelled) setUser(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Clears our own app-level session state immediately, independent of
  // whatever the Catalyst SDK's signOut() does server-side (its behavior
  // is inconsistent across auth protocols -- see catalystClient.js). The
  // route gate in App.jsx reacts to `user` becoming null and swaps to the
  // Login screen instantly, no page reload required.
  const clearSession = () => {
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

  const features = useMemo(() => resolveFeatures(settingRows), [settingRows]);
  const setFeature = async (key, on) => {
    const existing = settingRows.find((r) => r.setting_key === key);
    const saved = await saveAppSetting(existing?.ROWID, key, on);
    setSettingRows((rows) => (existing ? rows.map((r) => (r.setting_key === key ? { ...r, setting_value: String(on) } : r)) : [...rows, saved]));
  };

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
    authError,
    viewer,
    features,
    setFeature,
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
