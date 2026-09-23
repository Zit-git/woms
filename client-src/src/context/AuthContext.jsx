import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../lib/catalystClient';
import { getAppUserByEmail, listRolePermissions } from '../lib/api';
import { moduleForPath } from '../lib/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [allowedModules, setAllowedModules] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

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
      Promise.all([getAppUserByEmail(currentUser.email_id), listRolePermissions()])
        .then(([row, perms]) => {
          if (cancelled) return;
          setAppUser(row);
          if (row?.business_role) {
            setAllowedModules(new Set(perms.filter((p) => p.role === row.business_role).map((p) => p.module)));
          }
        })
        .catch(() => null)
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
    setAllowedModules(new Set());
  };

  // A signed-in user with no active app role gets no access at all (fail closed);
  // the dashboard is open to any active role, every other page needs its module.
  const hasActiveRole = !!appUser?.business_role && appUser.user_status !== 'Inactive';
  const canAccessModule = (module) => hasActiveRole && (!module || allowedModules.has(module));
  const canAccessPath = (pathname) => canAccessModule(moduleForPath(pathname));

  const value = {
    user,
    businessRole: appUser?.business_role || null,
    warehouseId: appUser?.warehouse_id || null,
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
