import { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../lib/catalystClient';
import { getAppUserByEmail } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
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
      getAppUserByEmail(currentUser.email_id)
        .then((row) => {
          if (!cancelled) setAppUser(row);
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
  };

  const value = {
    user,
    businessRole: appUser?.business_role || null,
    loading,
    isAuthenticated: !!user,
    clearSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
