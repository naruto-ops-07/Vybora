import { Icon } from '@/components/Icon';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Text } from '@/components/Text';
import { authenticate, isUnlocked, subscribeAppLock } from '@/lib/connect/appLock';
import { LockScreen } from '@/features/applock/LockScreen';
import { useConnect } from './ConnectProvider';
import { useCc, ConnectEmpty, PrimaryButton } from './ui/primitives';

/** Shows Connect content only once the secure engine is ready and app lock (if on) is satisfied. */
export function ConnectGate({ children }: { children: ReactNode }) {
  const cc = useCc();
  const { status, error, retry } = useConnect();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => void isUnlocked().then((u) => alive && setUnlocked(u));
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    const unsub = subscribeAppLock(check);
    return () => {
      alive = false;
      sub.remove();
      unsub();
    };
  }, []);

  if (unlocked === false) {
    return (
      <View style={{ flex: 1 }}>
        <LockScreen
          busy={unlocking}
          onUnlock={() => {
            setUnlocking(true);
            void authenticate()
              .then(setUnlocked)
              .finally(() => setUnlocking(false));
          }}
        />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: cc.night, justifyContent: 'center' }}>
        <ConnectEmpty
          icon="wifi-off"
          title="Secure messaging couldn’t start"
          body={error ?? 'Check your connection and try again.'}
          action={<PrimaryButton title="Try again" icon="rotate-cw" onPress={retry} />}
        />
      </View>
    );
  }
  if (status !== 'ready' || unlocked === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: cc.night,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <ActivityIndicator color={cc.accent} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={13} color={cc.textSubtle} />
          <Text style={{ color: cc.textSubtle, fontSize: 13 }}>
            Preparing end-to-end encryption…
          </Text>
        </View>
      </View>
    );
  }
  return <>{children}</>;
}
