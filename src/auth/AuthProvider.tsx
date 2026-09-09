import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, AUTH_CHANGE_EVENT, getCurrentUserId, setSessionIdentity } from './client';
import type { Session } from './types';
import '../auth.css';

export interface AuthState {
  enabled: boolean;
  session: Session | null;
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  error: string | null;
  canWrite: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  developmentLogin: (userId: string) => Promise<void>;
}
const disabledAuth: AuthState = {
  enabled: false, session: null, status: 'authenticated', error: null, canWrite: true, isAdmin: false,
  refresh: async () => {}, logout: async () => {}, developmentLogin: async () => {},
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>(enabled ? 'loading' : 'authenticated');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (pending.current) return pending.current;
    const requestGeneration = generation.current;
    const request = (async () => {
      try {
        const next = await apiRequest<Session>('/session', { notifyAuth: false });
        if (requestGeneration !== generation.current) return;
        if (!next?.user?.userId || !['reader', 'editor', 'admin'].includes(next.role) || !Array.isArray(next.capabilities) || !next.csrfToken) {
          throw new ApiError(503, 'INVALID_SESSION', '登录服务返回的信息不完整，请联系管理员');
        }
        setSessionIdentity(next.user.userId, next.csrfToken);
        setSession(next);
        setStatus('authenticated');
        setError(null);
      } catch (failure) {
        if (requestGeneration !== generation.current) return;
        if (failure instanceof ApiError && failure.status === 401) {
          // Keep the editor's in-memory data mounted; no authenticated writes are allowed.
          window.dispatchEvent(new Event('bochupath:auth-expiring'));
          setSessionIdentity(null, null);
          setSession(null);
          setStatus('anonymous');
          setError(null);
        } else {
          window.dispatchEvent(new Event('bochupath:auth-expiring'));
          setSessionIdentity(null, null);
          setSession(null);
          setStatus('error');
          setError(failure instanceof Error ? failure.message : '无法确认登录状态，请重试');
        }
      }
    })();
    pending.current = request;
    try { await request; } finally { if (pending.current === request) pending.current = null; }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setSessionIdentity(null, null); return; }
    void refresh();
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const authChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ status: number }>).detail;
      if (detail?.status === 401) {
        generation.current += 1;
        pending.current = null;
        setSessionIdentity(null, null);
        setSession(null);
        setStatus('anonymous');
        setError(null);
      } else {
        // A denied write invalidates any older session refresh immediately.
        window.dispatchEvent(new Event('bochupath:auth-expiring'));
        generation.current += 1;
        pending.current = null;
        setSessionIdentity(getCurrentUserId(), null);
        setStatus('loading');
        void refresh();
      }
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener(AUTH_CHANGE_EVENT, authChanged);
    const interval = window.setInterval(refreshVisible, 30_000);
    return () => {
      generation.current += 1;
      pending.current = null;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener(AUTH_CHANGE_EVENT, authChanged);
    };
  }, [enabled, refresh]);

  const logout = useCallback(async () => {
    generation.current += 1;
    pending.current = null;
    await apiRequest('/auth/logout', { method: 'POST', body: '{}', notifyAuth: false });
    window.dispatchEvent(new Event('bochupath:auth-expiring'));
    generation.current += 1;
    pending.current = null;
    setSessionIdentity(null, null);
    setSession(null);
    setStatus('anonymous');
    setError(null);
  }, []);
  const developmentLogin = useCallback(async (userId: string) => {
    generation.current += 1;
    pending.current = null;
    await apiRequest('/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId }), notifyAuth: false });
    await refresh();
  }, [refresh]);
  const value = useMemo<AuthState>(() => enabled ? {
    enabled, session, status, error, refresh, logout, developmentLogin,
    canWrite: status === 'authenticated' && !!session && (session.role === 'editor' || session.role === 'admin'),
    isAdmin: status === 'authenticated' && session?.role === 'admin',
  } : disabledAuth, [enabled, session, status, error, refresh, logout, developmentLogin]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('账号组件必须挂载在 AuthProvider 内');
  return value;
}
