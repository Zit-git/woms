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

  const value = {
    user,
    businessRole: appUser?.business_role || null,
    loading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
