import { signOut } from '@vybora/api';
import { useCallback, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { AppLockProvider, useAppLock } from './AppLockProvider';
import { LockScreen } from './LockScreen';

/** Keeps the workspace mounted (drafts survive) but hidden and inert while locked. */
export function AppLockCover({ children }: { children: ReactNode }) {
  const lock = useAppLock();
  return (
    <>
      <div
        className={lock.locked ? 'invisible contents' : 'contents'}
        inert={lock.locked || undefined}
        aria-hidden={lock.locked || undefined}
        data-testid="applock-content"
      >
        {children}
      </div>
      {lock.locked && (
        <LockScreen
          waitMs={lock.waitMs}
          offerSignOut={lock.offerSignOut}
          hasBiometric={lock.hasBiometric}
          onPasscode={lock.unlock}
          onBiometric={lock.unlockBiometric}
          onSignOut={() => void lock.signOutDevice()}
        />
      )}
    </>
  );
}

/** Route element inside RequireAuth: the device lock around everything signed in. */
export function AppLockGate() {
  const { userId, profile, session } = useAuth();
  const out = useCallback(async () => {
    await signOut(supabase);
  }, []);
  if (!userId) return <Outlet />;
  return (
    <AppLockProvider
      key={userId}
      userId={userId}
      userName={profile?.username ?? session?.user.email ?? 'VYBORA'}
      signOut={out}
    >
      <AppLockCover>
        <Outlet />
      </AppLockCover>
    </AppLockProvider>
  );
}
