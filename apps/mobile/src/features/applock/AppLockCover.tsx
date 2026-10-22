import { useSegments } from 'expo-router';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  appLockEnabledNow,
  authenticate,
  isUnlockedNow,
  noteActive,
  noteBackground,
  setAppLockUser,
  subscribeAppLock,
} from '@/lib/connect/appLock';
import { useTheme } from '@/lib/theme';
import { LockScreen } from './LockScreen';

/** Re-renders on every lock event and reads the synchronous snapshot. */
function useUnlockedNow(): boolean | null {
  return useSyncExternalStore(subscribeAppLock, isUnlockedNow, isUnlockedNow);
}

/**
 * The one app lock gate, around the whole navigation stack.
 * - Every `messages/*` route is covered by the lock screen while locked (and by a blank
 *   page while the user's setting is still loading), so no chat screen can skip it.
 * - App-switcher cover: while the lock is on and the app is inactive or in the
 *   background, a lock screen without a button covers everything for the OS snapshot.
 * - On return, `noteActive` locks first and the snapshot is read in the same render, so
 *   chats never flash between `active` and the lock.
 * Whatever sits under a cover is hidden from screen readers.
 */
export function AppLockShell({ children }: { children: ReactNode }) {
  const t = useTheme();
  const { userId } = useAuth();
  const segments = useSegments();
  const unlocked = useUnlockedNow();
  const [away, setAway] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => void setAppLockUser(userId).catch(() => undefined), [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        noteActive();
        setAway(false);
        return;
      }
      if (s === 'background') noteBackground();
      if (appLockEnabledNow()) setAway(true);
    });
    return () => sub.remove();
  }, []);

  const inMessages = segments[0] === 'messages';
  const locked = inMessages && unlocked === false;
  const loading = inMessages && !!userId && unlocked === null;
  const covered = away || locked || loading;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {away ? (
        <LockScreen testID="app-lock-cover" />
      ) : locked ? (
        <LockScreen
          busy={unlocking}
          onUnlock={() => {
            setUnlocking(true);
            void authenticate().finally(() => setUnlocking(false));
          }}
        />
      ) : loading ? (
        <View
          testID="app-lock-loading"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.bg,
          }}
        />
      ) : null}
    </View>
  );
}
