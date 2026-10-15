import type { Session } from '@supabase/supabase-js';
import { clearSignedUrlCache, fetchMyProfile, getMyRoles, qk } from '@vybora/api';
import { isAdmin, isStaff } from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface MyProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  website: string | null;
  avatar_path: string | null;
  is_private: boolean;
  status: string;
}

interface AuthState {
  /** undefined while the stored session is being restored */
  session: Session | null | undefined;
  userId: string | null;
  profile: MyProfile | null;
  profileLoading: boolean;
  roles: string[];
  rolesLoading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') {
        clearSignedUrlCache();
        qc.clear();
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const userId = session?.user.id ?? null;

  const profileQuery = useQuery({
    queryKey: userId ? qk.me(userId) : ['me', 'anon'],
    queryFn: () => fetchMyProfile(supabase, userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Roles are read from the server-enforced user_roles table. They only
  // decide which UI is shown; every privileged RPC re-checks server-side.
  const rolesQuery = useQuery({
    queryKey: userId ? qk.roles(userId) : ['roles', 'anon'],
    queryFn: () => getMyRoles(supabase, userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthState>(() => {
    const roles = rolesQuery.data ?? [];
    return {
      session,
      userId,
      profile: (profileQuery.data as MyProfile | undefined) ?? null,
      profileLoading: !!userId && profileQuery.isPending,
      roles,
      rolesLoading: !!userId && rolesQuery.isPending,
      isStaff: isStaff(roles),
      isAdmin: isAdmin(roles),
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery(false),
    };
  }, [
    session,
    userId,
    profileQuery.data,
    profileQuery.isPending,
    rolesQuery.data,
    rolesQuery.isPending,
    passwordRecovery,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** For components rendered only inside RequireAuth. */
export function useMe() {
  const { userId, profile } = useAuth();
  if (!userId) throw new Error('useMe used outside an authenticated route');
  return { userId, profile };
}
