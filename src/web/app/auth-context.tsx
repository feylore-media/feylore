import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, type SelfUserProfile, type User } from "./api";

interface AuthState {
  user: User | null;
  profile: SelfUserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [profile, setProfile] = useState<SelfUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = (next: User | null) => {
    setUserState(next);
    if (!next) setProfile(null);
  };

  const refresh = async () => {
    try {
      const res = await fetchMe();
      setUserState(res.data.user);
      setProfile(res.data.profile ?? null);
    } catch {
      setUserState(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function usePermission(permission: string): boolean {
  const { user } = useAuth();
  return user?.permissions.includes(permission) ?? false;
}

export function useAnyPermission(permissions: readonly string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return permissions.some((p) => user.permissions.includes(p));
}
