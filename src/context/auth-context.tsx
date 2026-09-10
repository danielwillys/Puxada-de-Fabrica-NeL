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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loadProfile = (userId: string) => {
      // Defer the client call out of the onAuthStateChange callback.
      setTimeout(() => {
        supabase
          .from("profiles")
          .select("id,email,name,role")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data }) => {
            setProfile((data as unknown as Profile) ?? null);
          });
      }, 0);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setInitialized(true);
        if (s?.user) loadProfile(s.user.id);
        else setProfile(null);
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
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    },
    signUp: async (email, password, name) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/`,
        },
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
