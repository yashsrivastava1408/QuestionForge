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
  const [token, setToken] = useState<string | null>(() => 'mock-token');
  const [user, setUser] = useState<AuthUser | null>(() => ({
    id: 'mock-id',
    email: 'admin@demo.com',
    name: 'Admin Demo',
    role: 'ADMIN'
  }));

  const login = useCallback(async (email: string, _password: string, _orgSlug: string) => {
    // Mock login bypass
    const newToken = 'mock-token';
    const newUser = { id: 'mock-id', email, name: 'Admin Demo', role: 'ADMIN' };
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
