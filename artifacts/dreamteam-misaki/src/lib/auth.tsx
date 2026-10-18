import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

export type AuthUser = { username?: string; global_name?: string; displayName?: string; role?: string; avatarUrl?: string; id?: string; discordId?: string };

function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/user', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setUser(null);
        else setFailed(true);
      } else {
        const result: unknown = await response.json();
        const candidate = result && typeof result === 'object' && 'user' in result
          ? (result as { user?: AuthUser }).user
          : result as AuthUser;
        setUser(candidate && typeof candidate === 'object' ? candidate : null);
      }
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return { user, loading, failed, reload: load };
}

export type AuthState = ReturnType<typeof useCurrentUser>;
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useCurrentUser();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider manquant');
  return value;
}
