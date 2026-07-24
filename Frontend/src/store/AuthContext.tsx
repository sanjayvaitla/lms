import { createContext, useCallback, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '../types/api';
import api, { tabSlot } from '../lib/axios';

/**
 * Multi-portal session design
 * localStorage  → lms_*_student | lms_*_staff
 * sessionStorage → lms_tab_slot = student | staff (this tab)
 * Fallback: if tab slot missing, prefer last-used slot, then any slot with tokens.
 */

function roleSlot(role?: string): 'student' | 'staff' {
  return (role === 'STUDENT' || role === 'INTERN') ? 'student' : 'staff';
}

export { roleSlot };

function slotKeys(slot: string) {
  return {
    user: `lms_user_${slot}`,
    access: `lms_access_token_${slot}`,
    refresh: `lms_refresh_token_${slot}`,
  };
}

function lastUsedSlot(): 'student' | 'staff' | null {
  const v = localStorage.getItem('lms_last_slot');
  return v === 'student' || v === 'staff' ? v : null;
}

function resolveTabSlot(): 'student' | 'staff' {
  const existing = sessionStorage.getItem('lms_tab_slot') as 'student' | 'staff' | null;
  if (existing) return existing;

  const last = lastUsedSlot();
  if (last && localStorage.getItem(slotKeys(last).access)) {
    sessionStorage.setItem('lms_tab_slot', last);
    return last;
  }

  // Prefer student if that session exists (learners open new tabs most often)
  for (const slot of ['student', 'staff'] as const) {
    if (localStorage.getItem(slotKeys(slot).access)) {
      sessionStorage.setItem('lms_tab_slot', slot);
      return slot;
    }
  }

  return 'staff';
}

function readStoredSession(slot: 'student' | 'staff') {
  const k = slotKeys(slot);
  try {
    const storedUser = localStorage.getItem(k.user);
    const user = storedUser ? JSON.parse(storedUser) as User : null;
    const accessToken = localStorage.getItem(k.access);
    return { user, accessToken };
  } catch {
    return { user: null, accessToken: null };
  }
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: User, token: string, refreshToken?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const initialSlot = resolveTabSlot();
  const initialSession = readStoredSession(initialSlot);

  // Optimistic: sync storage is enough to paint; /auth/me revalidates in background
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [accessToken, setAccessToken] = useState<string | null>(initialSession.accessToken);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(true);

  useEffect(() => {
    const slot = resolveTabSlot();
    const { user: storedUser, accessToken: token } = readStoredSession(slot);

    if (!storedUser || !token) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        const me = data.data as User;
        if (cancelled) return;

        const expectedSlot = roleSlot(me.role);
        if (expectedSlot !== slot) {
          const k = slotKeys(slot);
          localStorage.removeItem(k.user);
          localStorage.removeItem(k.access);
          localStorage.removeItem(k.refresh);
          setUser(null);
          setAccessToken(null);
          return;
        }

        localStorage.setItem(slotKeys(slot).user, JSON.stringify(me));
        setUser(me);
        setAccessToken(token);
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response?.status;
        const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
        // Only wipe on auth/inactive failures — keep session across network/5xx
        const shouldClear =
          status === 401 ||
          code === 'ACCOUNT_PENDING' ||
          code === 'ACCOUNT_REJECTED' ||
          code === 'ACCOUNT_BLOCKED' ||
          code === 'ACCOUNT_EXPIRED' ||
          code === 'UNAUTHORIZED';

        if (shouldClear) {
          const k = slotKeys(slot);
          localStorage.removeItem(k.user);
          localStorage.removeItem(k.access);
          localStorage.removeItem(k.refresh);
          setUser(null);
          setAccessToken(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const setAuth = useCallback((u: User, token: string, refreshToken?: string) => {
    if (!token) return;
    const slot = roleSlot(u.role);
    sessionStorage.setItem('lms_tab_slot', slot);
    localStorage.setItem('lms_last_slot', slot);
    const k = slotKeys(slot);
    localStorage.setItem(k.user, JSON.stringify(u));
    localStorage.setItem(k.access, token);
    if (refreshToken) localStorage.setItem(k.refresh, refreshToken);
    setUser(u);
    setAccessToken(token);
  }, []);

  const clearAuth = useCallback(() => {
    qc.clear();
    const slot = tabSlot();
    const k = slotKeys(slot);
    localStorage.removeItem(k.user);
    localStorage.removeItem(k.access);
    localStorage.removeItem(k.refresh);
    sessionStorage.removeItem('lms_tab_slot');
    setUser(null);
    setAccessToken(null);
  }, [qc]);

  // Cross-tab logout: axios BroadcastChannel clears storage; also clear React state
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('lms_auth');
      ch.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'logout' && msg.slot === tabSlot()) {
          qc.clear();
          setUser(null);
          setAccessToken(null);
          setSessionChecked(true);
          setIsLoading(false);
        }
      };
    } catch {
      /* unsupported */
    }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [qc]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    // Do NOT flip global isLoading — that stalls ProtectedRoute with a full-page splash.
    const { data } = await api.post('/auth/login', { email, password });
    const { user: u, accessToken: token, refreshToken } = data.data;
    // Drop previous user's React Query cache so dashboards never show stale data
    qc.clear();
    setAuth(u, token, refreshToken);
    setSessionChecked(true);
    setIsLoading(false);
    return u as User;
  }, [qc, setAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await api.post('/auth/register', { name, email, password, role: 'STUDENT' });
    const payload = data.data ?? {};
    if (payload.requiresApproval || !payload.accessToken) return;
    qc.clear();
    setAuth(payload.user, payload.accessToken, payload.refreshToken);
    setSessionChecked(true);
    setIsLoading(false);
  }, [qc, setAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: sessionChecked && !!user && !!accessToken,
      isLoading,
      login,
      register,
      logout,
      setAuth,
    }),
    [user, accessToken, sessionChecked, isLoading, login, register, logout, setAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
