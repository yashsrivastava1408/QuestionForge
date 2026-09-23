import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string, orgSlug: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('qf_token') ?? (import.meta.env.DEV ? 'mock-token' : null);
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('qf_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fall through
      }
    }
    return import.meta.env.DEV
      ? { id: 'mock-id', email: 'admin@demo.com', name: 'Admin Demo', role: 'ADMIN' }
      : null;
  });

  // Keep Axios Authorization header synced with token
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string, organizationSlug: string) => {
    const res = await axios.post('/api/auth/login', {
      email,
      password,
      organizationSlug,
    });

    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('qf_token', newToken);
    localStorage.setItem('qf_user', JSON.stringify(newUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token && token !== 'mock-token') {
        await axios.post('/api/auth/logout');
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('qf_token');
      localStorage.removeItem('qf_user');
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
