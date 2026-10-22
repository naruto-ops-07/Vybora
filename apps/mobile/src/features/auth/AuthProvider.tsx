import type { Session } from '@supabase/supabase-js';
import { clearSignedUrlCache, fetchMyProfile, qk } from '@vybora/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { clearAppLock } from '@/lib/connect/appLock';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null | undefined;
  userId: string | null;
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_path: string | null;
    is_private: boolean;
    bio: string;
    website: string | null;
  } | null;
}

const Ctx = createContext<AuthState>({ session: undefined, userId: null, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const qc = useQueryClient();
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) lastUser.current = data.session.user.id;
      setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user.id) lastUser.current = next.user.id;
      if (event === 'SIGNED_OUT') {
        // Signing out clears this user's app lock (the forgotten-passcode path, as on web).
        if (lastUser.current) void clearAppLock(lastUser.current).catch(() => undefined);
        lastUser.current = null;
        clearSignedUrlCache();
        qc.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id ?? null;
  const profile = useQuery({
    queryKey: userId ? qk.me(userId) : ['me', 'anon'],
    queryFn: () => fetchMyProfile(supabase, userId!),
    enabled: !!userId,
  });

  return (
    <Ctx.Provider
      value={{ session, userId, profile: (profile.data as AuthState['profile']) ?? null }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export function useMe() {
  const { userId, profile } = useAuth();
  if (!userId) throw new Error('useMe used outside authenticated screens');
  return { userId, profile };
}
