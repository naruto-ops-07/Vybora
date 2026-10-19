import {
  GET_STARTED_STEPS,
  getStartedProgress,
  type GetStartedProgress,
  type GetStartedStep,
} from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Button, IconButton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSecureInbox } from '@/features/connect/hooks';
import { cardStyle, useCc } from '@/features/connect/ui/primitives';
import { HandleCard } from '@/features/friends/HandleCard';
import { useFriendRequests, useFriends } from '@/features/friends/hooks';
import { useTheme } from '@/lib/theme';
import { addFriend } from './EmptyStates';
import { allSetThisSession, useOnboarding } from './store';

const LABEL: Record<GetStartedStep, string> = {
  share: 'Share your username',
  friend: 'Add a friend',
  hi: 'Say hi',
};
const HINT: Record<GetStartedStep, string> = {
  share: 'Friends add you by it. Send it wherever you already talk.',
  friend: 'Ask for their exact username and send a request.',
  hi: 'Start a chat. It’s sealed on your device before it’s sent.',
};

export interface GetStartedViewProps {
  progress: GetStartedProgress;
  /** The @handle row for step 1 (HandleCard compact). */
  handle: ReactNode;
  username?: string;
  onSayHi: () => void;
  onAddFriend: () => void;
  onDismiss: () => void;
}

/**
 * The first-run panel at the top of the chat list (mobile twin of the web
 * GetStartedView): three steps with check states (icon and "Done" in the
 * label, never colour alone), "N of 3", hide, and a one-time "You're all set".
 */
export function GetStartedView({
  progress,
  handle,
  username,
  onSayHi,
  onAddFriend,
  onDismiss,
}: GetStartedViewProps) {
  const t = useTheme();
  const cc = useCc();
  const { steps, done, complete } = progress;
  const card = [cardStyle(t), { marginHorizontal: 16, marginTop: 12, padding: 16 }];
  const dismiss = (
    <View style={{ marginTop: -10, marginRight: -10 }}>
      <IconButton name="x" label="Hide getting started" size={18} onPress={onDismiss} />
    </View>
  );

  if (complete)
    return (
      <View style={[...card, { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }]}>
        <Icon name="check-circle" size={22} weight="fill" color={cc.accent} />
        <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
          <Text
            accessibilityRole="header"
            display
            style={{ color: cc.text, fontSize: 17, fontWeight: '600' }}
          >
            You’re all set
          </Text>
          <Text style={{ color: cc.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
            {username
              ? `Friends can add you any time as @${username}.`
              : 'Friends can add you any time by your username.'}
          </Text>
        </View>
        {dismiss}
      </View>
    );

  const action: Record<GetStartedStep, ReactNode> = {
    share: handle,
    friend: (
      <View style={{ alignSelf: 'flex-start' }}>
        <Button title="Add by username" variant="outline" compact onPress={onAddFriend} />
      </View>
    ),
    hi: (
      <View style={{ alignSelf: 'flex-start' }}>
        <Button title="New message" variant="outline" compact onPress={onSayHi} />
      </View>
    ),
  };

  return (
    <View style={card} testID="get-started">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text
          accessibilityRole="header"
          display
          style={{ color: cc.text, fontSize: 17, fontWeight: '600', flex: 1 }}
        >
          Get started
        </Text>
        <Text
          mono
          accessibilityLabel={`${done} of 3 steps done`}
          style={{ color: cc.textMuted, fontSize: 12, marginTop: 2 }}
        >
          {done} of 3
        </Text>
        {dismiss}
      </View>
      {/* Three flat segments: a glance at progress. The count above carries it for screen readers. */}
      <View
        style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {GET_STARTED_STEPS.map((s) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: steps[s] ? cc.accent : cc.strong,
            }}
          />
        ))}
      </View>
      {GET_STARTED_STEPS.map((s, i) => {
        const ok = steps[s];
        return (
          <View
            key={s}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingTop: 12,
              paddingBottom: i === GET_STARTED_STEPS.length - 1 ? 2 : 12,
              borderBottomWidth: i === GET_STARTED_STEPS.length - 1 ? 0 : StyleSheet.hairlineWidth,
              borderBottomColor: cc.line,
            }}
          >
            <Icon
              name={ok ? 'check-circle' : 'circle'}
              size={20}
              weight={ok ? 'fill' : 'regular'}
              color={ok ? cc.accent : cc.textSubtle}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityLabel={ok ? `${LABEL[s]}. Done` : LABEL[s]}
                style={{ color: ok ? cc.textMuted : cc.text, fontSize: 14, fontWeight: '500' }}
              >
                {LABEL[s]}
              </Text>
              {!ok && (
                <>
                  <Text style={{ color: cc.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                    {HINT[s]}
                  </Text>
                  <View style={{ marginTop: 10 }}>{action[s]}</View>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Get started for the signed-in user: steps from friends, requests and the
 * latest message per chat; the record is per device per user (SecureStore).
 * Hidden while anything loads so it never flashes 0 of 3.
 */
export function GetStarted({
  previews,
  previewsReady,
}: {
  previews: Record<string, LocalMessage | undefined> | undefined;
  previewsReady: boolean;
}) {
  const { userId, profile } = useAuth();
  const [record, update, loaded] = useOnboarding(userId ?? undefined);
  const friends = useFriends();
  // Poll requests only while the chat list is on screen.
  const requests = useFriendRequests(useIsFocused());
  const inbox = useSecureInbox();
  const ready =
    !!userId &&
    loaded &&
    friends.isSuccess &&
    requests.isSuccess &&
    inbox.isSuccess &&
    previewsReady;

  const progress = useMemo(
    () =>
      getStartedProgress({
        record,
        friendCount: friends.data?.length ?? 0,
        outgoingCount: requests.data?.outgoing.length ?? 0,
        lastSenderIds: Object.values(previews ?? {}).map((m) => m?.senderId),
        myUserId: userId ?? '',
      }),
    [record, friends.data, requests.data, previews, userId],
  );
  useEffect(() => {
    if (!ready || !userId) return;
    const patch: Parameters<typeof update>[0] = {};
    if (progress.steps.friend && !record.friend) patch.friend = true;
    if (progress.steps.hi && !record.saidHi) patch.saidHi = true;
    if (progress.complete && !record.done) {
      patch.done = true;
      allSetThisSession.add(userId);
    }
    if (Object.keys(patch).length) update(patch);
  }, [ready, progress, record, update, userId]);

  if (!ready || !userId || record.dismissed) return null;
  if (record.done && !allSetThisSession.has(userId)) return null;
  return (
    <GetStartedView
      progress={progress.complete || record.done ? { ...progress, complete: true } : progress}
      handle={<HandleCard variant="compact" />}
      username={profile?.username}
      onSayHi={() => router.push('/messages/new')}
      onAddFriend={() => addFriend()}
      onDismiss={() => update({ dismissed: true })}
    />
  );
}
