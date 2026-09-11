import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  initialized: boolean;
  /** Permissões do perfil do usuário logado. */
  permissions: string[];
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loadProfile = (userId: string) => {
      // Defer the client call out of the onAuthStateChange callback.
      setTimeout(() => {
        supabase
          .from("profiles")
          .select("id,email,name,role,role_id,active,user_roles(permissions)")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data }) => {
            const row = data as
              | (Partial<Profile> & {
                  user_roles?: { permissions?: unknown } | null;
                })
              | null;
            setProfile(
              row
                ? {
                    id: row.id ?? userId,
                    email: row.email ?? "",
                    name: row.name ?? "",
                    role: row.role ?? "operator",
                    role_id: row.role_id ?? null,
                    active: row.active ?? true,
                  }
                : null,
            );
            const perms = Array.isArray(row?.user_roles?.permissions)
              ? (row.user_roles!.permissions as unknown[])
                  .filter((p): p is string => typeof p === "string")
              : [];
            // Admin keeps full access regardless of stored permissions.
            setPermissions(
              row?.role === "admin"
                ? ["*"]
                : perms.length > 0
                  ? perms
                  : [],
            );
          });
      }, 0);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setInitialized(true);
        if (s?.user) loadProfile(s.user.id);
        else {
          setProfile(null);
          setPermissions([]);
        }
      },
    );

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setInitialized(true);
      if (data.session?.user) loadProfile(data.session.user.id);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    profile,
    initialized,
    permissions,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

/** Hook: verifica se o usuário tem uma permissão (admin tem "*" = todas). */
// eslint-disable-next-line react-refresh/only-export-components
export function usePermission(perm: string): boolean {
  const { permissions } = useAuth();
  return permissions.includes("*") || permissions.includes(perm);
}
