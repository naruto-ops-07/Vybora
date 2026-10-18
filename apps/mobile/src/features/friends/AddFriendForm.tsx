import type { FriendRequestResult } from '@vybora/api';
import {
  addFriendErrorNotice,
  addFriendResultNotice,
  normalizeUsername,
  type AddFriendNotice,
} from '@vybora/core';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View, type TextInput as RNTextInput } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text, TextInput } from '@/components/Text';
import { Button } from '@/components/ui';
import { useCc } from '@/features/connect/ui/primitives';
import { useHaptics } from '@/lib/haptics';
import { radii } from '@/lib/theme';

const NOTICE_ICON: Record<AddFriendNotice['tone'], IconName> = {
  success: 'check-circle',
  info: 'info',
  error: 'alert-circle',
};

/**
 * Exact-username friend request with one inline message per outcome. The
 * caller does the sending; a rejection becomes the error message here.
 */
export function AddFriendForm({
  onSubmit,
  prefill,
  acceptedReplaced,
}: {
  onSubmit: (username: string) => Promise<FriendRequestResult>;
  /** From an add-me link (`?add=`): fills the field and focuses it. Never sends. */
  prefill?: string | null;
  /** Bumped when the joined card takes over from the `accepted` message. */
  acceptedReplaced?: number;
}) {
  const cc = useCc();
  const haptic = useHaptics();
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState<AddFriendNotice | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const input = useRef<RNTextInput>(null);
  // The `accepted` message, so only it (not a later one) gives way to the card.
  const acceptedNotice = useRef<AddFriendNotice | null>(null);
  useEffect(() => {
    if (acceptedReplaced) setNotice((n) => (n && n === acceptedNotice.current ? null : n));
  }, [acceptedReplaced]);
  const username = normalizeUsername(value);

  useEffect(() => {
    if (!prefill) return;
    setValue(prefill);
    setNotice(null);
    input.current?.focus();
  }, [prefill]);

  // iOS has no live regions; say the outcome out loud.
  useEffect(() => {
    if (notice && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(notice.text);
  }, [notice]);

  const submit = async () => {
    if (!username || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setNotice(null);
    try {
      const result = await onSubmit(username);
      const next = addFriendResultNotice(result, username);
      if (result === 'accepted') acceptedNotice.current = next;
      setNotice(next);
      setValue('');
      // Only a real change earns a tap ("already friends / already sent" is just
      // info); a new friendship is the bigger moment.
      if (result === 'sent') haptic('light');
      else if (result === 'accepted') haptic('medium');
    } catch (e) {
      setNotice(addFriendErrorNotice(e));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const tone = notice?.tone;
  const toneColor = tone === 'success' ? cc.success : tone === 'error' ? cc.danger : cc.textMuted;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 10 }}>
      <Text
        accessibilityRole="header"
        style={{ color: cc.textMuted, fontSize: 13, fontWeight: '600' }}
      >
        Add a friend
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          paddingHorizontal: 12,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: tone === 'error' ? cc.danger : cc.lineStrong,
          backgroundColor: cc.night,
        }}
      >
        <Text mono style={{ color: cc.textSubtle, fontSize: 15 }}>
          @
        </Text>
        <TextInput
          ref={input}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            if (notice) setNotice(null);
          }}
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Friend’s username"
          placeholder="username"
          placeholderTextColor={cc.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          returnKeyType="send"
          maxLength={40}
          scale
          style={{ flex: 1, minHeight: 48, color: cc.text, fontSize: 16 }}
        />
      </View>
      <Button
        title="Send request"
        icon="user-plus"
        disabled={!username}
        loading={pending}
        onPress={() => void submit()}
      />
      <View accessibilityLiveRegion="polite">
        {notice ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <View style={{ marginTop: 1 }}>
              <Icon name={NOTICE_ICON[notice.tone]} size={16} color={toneColor} />
            </View>
            <Text style={{ color: toneColor, fontSize: 13, lineHeight: 18, flex: 1 }}>
              {notice.text}
            </Text>
          </View>
        ) : (
          <Text style={{ color: cc.textMuted, fontSize: 12, lineHeight: 17 }}>
            Usernames are exact. Ask your friend for theirs.
          </Text>
        )}
      </View>
    </View>
  );
}
