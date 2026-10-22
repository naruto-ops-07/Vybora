import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  appLockEnabledNow,
  getAppLockAway,
  isAppLockEnabled,
  noteActive,
  noteBackground,
} from '@/lib/connect/appLock';
import { LockScreen } from './LockScreen';

/**
 * App-switcher privacy cover. While app lock is on and the app is inactive or in the
 * background, a lock screen covers everything, so the OS snapshot shows no chats. It
 * also runs the away clock: on return, `noteActive` locks Messages first (gates hear it
 * synchronously), then the cover drops, so chats never flash before the lock.
 */
export function AppLockCover() {
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    void isAppLockEnabled().catch(() => undefined);
    void getAppLockAway().catch(() => undefined);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        noteActive();
        setCovered(false);
        return;
      }
      if (s === 'background') noteBackground();
      if (appLockEnabledNow()) setCovered(true);
    });
    return () => sub.remove();
  }, []);

  return covered ? <LockScreen testID="app-lock-cover" /> : null;
}
