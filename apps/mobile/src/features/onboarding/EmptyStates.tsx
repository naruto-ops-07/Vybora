/**
 * The illustrated empty states (spec "Your circle, in colour" §2), mobile twin
 * of apps/web/src/features/onboarding/EmptyStates.tsx: same copy, same drawings.
 */
import { router } from 'expo-router';
import type { Friend } from '@vybora/api';
import { CHAT_LIST_EMPTY_COPY, type ChatListEmptyState } from '@vybora/core';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
} from '@/components/illustrations';
import { Text } from '@/components/Text';
import { Avatar, Button } from '@/components/ui';
import { tint } from '@/lib/theme';
import { useCc } from '@/features/connect/ui/primitives';

/** Illustration, heading, one sentence, then up to two actions and any extra content. */
export function IllustratedEmpty({
  illustration,
  title,
  body,
  action,
  secondaryAction,
  children,
  compact,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  const cc = useCc();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: compact ? 16 : 32,
        paddingVertical: compact ? 24 : 36,
      }}
    >
      {illustration}
      <Text
        accessibilityRole="header"
        display
        style={{
          color: cc.text,
          fontSize: 20,
          fontWeight: '600',
          letterSpacing: -0.2,
          textAlign: 'center',
          marginTop: 16,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: cc.textMuted,
          fontSize: 14,
          lineHeight: 20,
          textAlign: 'center',
          marginTop: 6,
          maxWidth: 320,
        }}
      >
        {body}
      </Text>
      {(action || secondaryAction) && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
            marginTop: 18,
          }}
        >
          {action}
          {secondaryAction}
        </View>
      )}
      {children && <View style={{ alignSelf: 'stretch', marginTop: 20 }}>{children}</View>}
    </View>
  );
}

/** Add a friend: the Friends screen with the username field (prefilled, if given). */
export function addFriend(username?: string | null) {
  if (username) router.push(`/messages/friends?add=${encodeURIComponent(username)}`);
  else router.push('/messages/friends');
}

export function AddFriendButton({
  username,
  variant = 'primary',
}: {
  username?: string | null;
  variant?: 'primary' | 'outline';
}) {
  return (
    <Button
      title="Add a friend"
      icon="user-plus"
      variant={variant}
      onPress={() => addFriend(username)}
    />
  );
}

const SAY_HI_MAX = 5;

/**
 * The chat list before the first chat (shared rule: `chatListEmptyState`). A fresh
 * account finds friends or shares its username; with requests out, it waits; with
 * friends, it says hi to one (up to five avatars) or starts a new message. Nothing
 * shows while friends load, so "No friends yet" never flashes.
 */
export function ChatListEmptyView({
  state,
  outgoingCount,
  friends,
  onFindFriends,
  onShare,
  onSayHi,
  onNewMessage,
}: {
  state: ChatListEmptyState;
  outgoingCount: number;
  /** Friends to say hi to (empty when the friends query failed). */
  friends: Friend[];
  onFindFriends: () => void;
  onShare: () => void;
  onSayHi: (friend: Friend) => void;
  onNewMessage: () => void;
}) {
  const cc = useCc();
  if (state === 'loading') return <View style={{ minHeight: 240 }} />;
  if (state === 'no-friends') {
    const c = CHAT_LIST_EMPTY_COPY['no-friends'];
    return (
      <IllustratedEmpty
        illustration={<NoFriendsIllustration width={160} />}
        title={c.title}
        body={c.body}
        action={<Button title={c.action} icon="user-plus" onPress={onFindFriends} />}
        secondaryAction={
          <Button title={c.secondaryAction} icon="share" variant="outline" onPress={onShare} />
        }
      />
    );
  }
  if (state === 'waiting') {
    const c = CHAT_LIST_EMPTY_COPY.waiting;
    return (
      <IllustratedEmpty
        illustration={<NoFriendsIllustration width={160} />}
        title={c.title}
        body={c.body(outgoingCount)}
        action={<Button title={c.action} icon="user-plus" onPress={onFindFriends} />}
      />
    );
  }
  const c = CHAT_LIST_EMPTY_COPY['say-hi'];
  const shown = friends.slice(0, SAY_HI_MAX);
  return (
    <IllustratedEmpty
      illustration={<NoChatsIllustration width={160} />}
      title={c.title}
      body={c.body}
      action={<Button title={c.action} icon="edit" variant="outline" onPress={onNewMessage} />}
    >
      {shown.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
          {shown.map((f) => {
            const name = f.displayName || f.username;
            return (
              <Pressable
                key={f.userId}
                onPress={() => onSayHi(f)}
                accessibilityRole="button"
                accessibilityLabel={`Say hi to ${name}`}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  gap: 6,
                  width: 72,
                  minHeight: 44,
                  paddingVertical: 6,
                  borderRadius: cc.radii.md,
                  backgroundColor: pressed ? tint(cc.text, '12') : 'transparent',
                })}
              >
                <Avatar
                  path={f.avatarPath}
                  name={f.username}
                  userId={f.userId}
                  displayName={f.displayName}
                  size={48}
                  decorative
                />
                <Text
                  numberOfLines={1}
                  style={{ color: cc.textMuted, fontSize: 12, maxWidth: 68, textAlign: 'center' }}
                >
                  {name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </IllustratedEmpty>
  );
}

/** The friends list before the first friend. */
export function FriendsEmpty({ handle }: { handle?: ReactNode }) {
  return (
    <IllustratedEmpty
      illustration={<NoFriendsIllustration width={160} />}
      title="Your circle starts here"
      body="Share your username or add someone by theirs."
      compact
    >
      {handle}
    </IllustratedEmpty>
  );
}

/** A people or chat search that found no one. */
export function NoResultsEmpty({ action }: { action?: ReactNode }) {
  return (
    <IllustratedEmpty
      illustration={<NothingFoundIllustration width={136} />}
      title="No one by that name"
      body="Check the spelling, or add them by username."
      action={action}
      compact
    />
  );
}
