import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * supabase-js surfaces an unreachable project as a bare "Failed to fetch",
 * which reads like a bug in the app rather than a dead/paused project. Name the
 * real cause — `bin/check-supabase` diagnoses it properly.
 */
function describe(message: string | undefined): string | null {
  if (!message) return null;
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return `Can't reach ${import.meta.env.VITE_SUPABASE_URL || 'Supabase'}. The project may be paused or deleted — run bin/check-supabase.`;
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: describe(error?.message) };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    // With email autoconfirm enabled on the project, signUp returns a live
    // session and the user is already in. Telling them to go check their
    // email for a confirmation that will never arrive is the worst possible
    // first thirty seconds of a user test.
    return {
      error: describe(error?.message),
      needsEmailConfirmation: !error && !data.session,
    };
  };

  const signOut = () => supabase.auth.signOut().then(() => {});

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
