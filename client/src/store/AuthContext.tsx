import { createContext, useContext, useState, ReactNode } from 'react';
import type { User } from '../types/api';
import api from '../lib/axios';

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: User, token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('lms_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState<string | null>(
    () => localStorage.getItem('lms_access_token'),
  );
  const [isLoading, setIsLoading] = useState(false);

  function setAuth(u: User, token: string) {
    setUser(u);
    setAccessToken(token);
    localStorage.setItem('lms_user', JSON.stringify(u));
    localStorage.setItem('lms_access_token', token);
  }

  function clearAuth() {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('lms_user');
    localStorage.removeItem('lms_access_token');
    localStorage.removeItem('lms_refresh_token');
  }

  async function login(email: string, password: string) {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { user: u, accessToken: token, refreshToken } = data.data;
      localStorage.setItem('lms_refresh_token', refreshToken);
      setAuth(u, token);
    } finally {
      setIsLoading(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/register', { name, email, password, role: 'STUDENT' });
      const { user: u, accessToken: token, refreshToken } = data.data;
      localStorage.setItem('lms_refresh_token', refreshToken);
      setAuth(u, token);
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // ignore
    } finally {
      clearAuth();
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        register,
        logout,
        setAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
