import { Icon } from '@/components/Icon';
import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/Text';
import { useConnect } from './ConnectProvider';
import { useCc, ConnectEmpty, PrimaryButton } from './ui/primitives';

/** Shows Connect content only once the secure engine is ready. App lock: `AppLockShell`. */
export function ConnectGate({ children }: { children: ReactNode }) {
  const cc = useCc();
  const { status, error, retry } = useConnect();
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
  if (status !== 'ready') {
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
