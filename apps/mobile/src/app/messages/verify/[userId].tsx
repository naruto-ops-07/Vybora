import { Icon } from '@/components/Icon';
import { qk } from '@vybora/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { shadowStyle, useTheme } from '@/lib/theme';
import { useConnect } from '@/features/connect/ConnectProvider';
import { ConnectGate } from '@/features/connect/ConnectGate';
import { useConversation, useNicknames } from '@/features/connect/hooks';
import { useCc, PrimaryButton, Row, SectionCard } from '@/features/connect/ui/primitives';

function Verify() {
  const t = useTheme();
  const { radii } = t;
  const cc = useCc();
  const { userId = '', conversationId = '' } = useLocalSearchParams<{
    userId: string;
    conversationId: string;
  }>();
  const { engine } = useConnect();
  const qc = useQueryClient();
  const conv = useConversation(conversationId).data;
  const nicknames = useNicknames();
  const member = conv?.members.find((m) => m.id === userId);
  const name =
    nicknames.data?.[userId] ?? member?.display_name ?? member?.username ?? 'this contact';
  const number = useQuery({
    queryKey: qk.connect.safety(userId),
    enabled: !!engine,
    queryFn: () => engine!.safetyNumberWith(userId),
  });
  const status = useQuery({
    queryKey: qk.connect.keys(userId),
    enabled: !!engine,
    queryFn: () => engine!.checkContactKeys(userId),
  });
  const groups = number.data?.split(' ') ?? [];

  const trust = async (verified: boolean) => {
    await engine!.trustContactKeys(userId, verified);
    await qc.invalidateQueries({ queryKey: qk.connect.keys(userId) });
    if (verified) router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cc.night }}
      contentContainerStyle={{ padding: 20, gap: 22 }}
    >
      <Stack.Screen
        options={{
          title: 'Safety number',
          headerStyle: { backgroundColor: cc.night },
          headerTintColor: cc.text,
        }}
      />
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Icon
          name={
            status.data?.verified
              ? 'check-circle'
              : status.data?.status === 'changed'
                ? 'alert-triangle'
                : 'shield'
          }
          size={40}
          color={
            status.data?.verified
              ? cc.success
              : status.data?.status === 'changed'
                ? cc.warning
                : cc.accent
          }
        />
        <Text
          display
          accessibilityRole="header"
          style={{
            color: cc.text,
            fontSize: 24,
            fontWeight: '600',
            letterSpacing: -0.3,
            textAlign: 'center',
          }}
        >
          {status.data?.verified
            ? `You verified ${name}`
            : status.data?.status === 'changed'
              ? `${name}’s safety number changed`
              : `Verify ${name}`}
        </Text>
        <Text style={{ color: cc.textMuted, textAlign: 'center', lineHeight: 20 }}>
          Compare these numbers with {name} in person or on a call you trust. If they match, your
          messages can only be read by your two accounts’ devices.
        </Text>
      </View>
      <View
        style={[
          {
            backgroundColor: cc.panel,
            borderRadius: radii.lg,
            padding: 20,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.highContrast ? cc.lineStrong : cc.line,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            rowGap: 14,
          },
          shadowStyle(1, t),
        ]}
        accessibilityLabel={`Safety number ${number.data ?? ''}`}
      >
        {groups.map((g, i) => (
          <Text
            key={i}
            mono
            style={{
              color: cc.text,
              fontSize: 20,
              fontWeight: '500',
              letterSpacing: 1.5,
              width: '30%',
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
            }}
          >
            {g}
          </Text>
        ))}
      </View>
      <SectionCard>
        <Row
          icon="copy"
          label="Copy safety number"
          onPress={() => void Clipboard.setStringAsync(number.data ?? '')}
        />
      </SectionCard>
      {status.data?.status === 'changed' && !status.data.verified && (
        <Text style={{ color: cc.warning, fontSize: 13, lineHeight: 19 }}>
          This usually means {name} added or reinstalled a device. If you didn’t expect this,
          confirm with them before sharing anything sensitive.
        </Text>
      )}
      <PrimaryButton
        title={status.data?.verified ? 'Verified' : 'Mark as verified'}
        icon="check"
        disabled={status.data?.verified}
        onPress={() => void trust(true)}
      />
      {status.data?.status === 'changed' && (
        <Pressable
          onPress={() => void trust(false)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: 'center',
            borderRadius: radii.md,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: cc.textMuted, textAlign: 'center', fontWeight: '500' }}>
            Accept new number without verifying
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

export default function VerifyScreen() {
  return (
    <ConnectGate>
      <Verify />
    </ConnectGate>
  );
}
