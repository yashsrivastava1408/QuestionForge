import React, { createContext, useContext, useState, useCallback } from 'react';
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('qf_token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = localStorage.getItem('qf_user');
    return u ? JSON.parse(u) : null;
  });

  const login = useCallback(async (email: string, password: string, orgSlug: string) => {
    const res = await axios.post('/api/auth/login', { email, password, organizationSlug: orgSlug });
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('qf_token', newToken);
    localStorage.setItem('qf_user', JSON.stringify(newUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('qf_token');
    localStorage.removeItem('qf_user');
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  // Set token on page refresh
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

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
