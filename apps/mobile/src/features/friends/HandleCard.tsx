import { friendInviteLink } from '@vybora/core';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Share, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { cardStyle, useCc } from '@/features/connect/ui/primitives';
import { useOnboarding } from '@/features/onboarding/store';
import { publicSiteUrl } from '@/lib/env';
import { useTheme } from '@/lib/theme';

export interface HandlePerson {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

const FEEDBACK_MS = 2000;

/** What the share sheet carries: the @handle, plus the add-me link when the web address is set. */
export function shareMessage(username: string, link: string | null): string {
  return link ? `Add me on VYBORA: @${username}\n${link}` : `Add me on VYBORA: @${username}`;
}

/**
 * Your own @username, ready to pass on (mobile twin of the web HandleCard).
 * Copy puts "@username" on the clipboard; Share opens the system share sheet
 * with a link that prefills the add-friend field. Both count as "Share your
 * username" in Get started; closing the share sheet doesn't.
 */
export function HandleCardView({
  person,
  link,
  variant = 'full',
  onShared,
}: {
  person: HandlePerson;
  link: string | null;
  variant?: 'full' | 'compact';
  onShared?: () => void;
}) {
  const t = useTheme();
  const { radii } = t;
  const cc = useCc();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const handle = `@${person.username}`;
  const name = person.display_name || person.username;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(handle);
      setCopied(true);
      onShared?.();
      AccessibilityInfo.announceForAccessibility(`${handle} copied`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      Alert.alert('Couldn’t copy', `Your username is ${handle}.`);
    }
  };

  const share = async () => {
    try {
      const r = await Share.share({ message: shareMessage(person.username, link) });
      if (r.action === Share.sharedAction) onShared?.();
    } catch {
      // The sheet couldn't open: Copy still works.
    }
  };

  const compact = variant === 'compact';
  const buttons = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button
        title={copied ? 'Copied' : 'Copy'}
        icon={copied ? 'check' : 'copy'}
        variant="outline"
        compact
        accessibilityLabel={copied ? 'Copied' : `Copy ${handle}`}
        onPress={() => void copy()}
      />
      <Button
        title="Share"
        icon="share"
        variant="outline"
        compact
        accessibilityLabel={link ? 'Share a link to add you' : `Share ${handle}`}
        onPress={() => void share()}
      />
    </View>
  );

  if (compact)
    return (
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        testID="handle-card-compact"
      >
        <View
          style={{
            flexGrow: 1,
            flexBasis: 112,
            minHeight: 36,
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: radii.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cc.highContrast ? cc.lineStrong : cc.line,
            backgroundColor: cc.raised,
          }}
        >
          <Text mono numberOfLines={1} style={{ color: cc.text, fontSize: 13 }}>
            {handle}
          </Text>
        </View>
        {buttons}
      </View>
    );

  return (
    <View
      style={{
        alignSelf: 'stretch',
        ...cardStyle(t),
        padding: 16,
        gap: 12,
      }}
      testID="handle-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar
          path={person.avatar_path}
          name={name}
          userId={person.id}
          displayName={person.display_name}
          username={person.username}
          size={44}
          decorative
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            display
            style={{ color: cc.text, fontSize: 17, fontWeight: '600' }}
          >
            {name}
          </Text>
          <Text mono numberOfLines={1} style={{ color: cc.textMuted, fontSize: 13 }}>
            {handle}
          </Text>
        </View>
      </View>
      <Text style={{ color: cc.textMuted, fontSize: 13, lineHeight: 18 }}>
        Friends add you by this exact username.
      </Text>
      {buttons}
    </View>
  );
}

/**
 * Opens the share sheet with my @handle and add-me link (the chat list's "Share your
 * username"). A completed share counts toward Get started, as on the card.
 */
export function useShareMyHandle() {
  const { profile } = useAuth();
  const [, update] = useOnboarding(profile?.id);
  return async () => {
    const username = profile?.username;
    if (!username) return;
    const link = publicSiteUrl ? friendInviteLink(publicSiteUrl, username) : null;
    try {
      const r = await Share.share({ message: shareMessage(username, link) });
      if (r.action === Share.sharedAction) update({ shared: true });
    } catch {
      Alert.alert('Couldn’t share', `Your username is @${username}.`);
    }
  };
}

/** HandleCard for the signed-in user. Renders nothing until the profile has loaded. */
export function HandleCard({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { profile } = useAuth();
  const [, update] = useOnboarding(profile?.id);
  if (!profile?.username) return null;
  return (
    <HandleCardView
      person={profile}
      link={publicSiteUrl ? friendInviteLink(publicSiteUrl, profile.username) : null}
      variant={variant}
      onShared={() => update({ shared: true })}
    />
  );
}
