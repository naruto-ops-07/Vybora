/**
 * The illustrated empty states (spec "Your circle, in colour" §2), mobile twin
 * of apps/web/src/features/onboarding/EmptyStates.tsx: same copy, same drawings.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
} from '@/components/illustrations';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
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
        style={{
          color: cc.text,
          fontSize: 18,
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

/** The chat list before the first chat. */
export function NoChatsEmpty() {
  return (
    <IllustratedEmpty
      illustration={<NoChatsIllustration width={160} />}
      title="No chats yet"
      body="Add a friend by their username, then say hi."
      action={<AddFriendButton />}
      secondaryAction={
        <Button
          title="New message"
          variant="outline"
          onPress={() => router.push('/messages/new')}
        />
      }
    />
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
