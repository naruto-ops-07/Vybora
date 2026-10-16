import type { FriendRequest } from '@vybora/api';
import { View } from 'react-native';
import { Text } from '@/components/Text';
import { Avatar, Button } from '@/components/ui';
import { useCc } from '@/features/connect/ui/primitives';
import { nameOf } from './hooks';

/**
 * A pending friend request. Incoming: Accept / Decline under the person (room
 * for large text). Outgoing: marked Pending with a Cancel button.
 */
export function RequestRow({
  request,
  direction,
  when,
  onAccept,
  onDecline,
  onCancel,
}: {
  request: FriendRequest;
  direction: 'incoming' | 'outgoing';
  /** Relative time, e.g. "2d". */
  when?: string;
  onAccept?: (request: FriendRequest) => void;
  onDecline?: (request: FriendRequest) => void;
  onCancel?: (request: FriendRequest) => void;
}) {
  const cc = useCc();
  const name = nameOf(request);
  const detail = direction === 'outgoing' ? 'Pending' : when;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar path={request.avatarPath} name={request.username} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text scale style={{ color: cc.text, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              scale
              style={{ color: cc.textMuted, fontSize: 14, flexShrink: 1 }}
              numberOfLines={1}
            >
              @{request.username}
            </Text>
            {!!detail && (
              <Text mono style={{ color: cc.textSubtle, fontSize: 11 }}>
                · {detail}
              </Text>
            )}
          </View>
        </View>
        {direction === 'outgoing' && (
          <Button
            title="Cancel"
            accessibilityLabel={`Cancel request to ${name}`}
            variant="outline"
            compact
            onPress={() => onCancel?.(request)}
            style={{ minHeight: 44 }}
          />
        )}
      </View>
      {direction === 'incoming' && (
        <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 60 }}>
          <Button
            title="Accept"
            accessibilityLabel={`Accept request from ${name}`}
            compact
            onPress={() => onAccept?.(request)}
            style={{ flex: 1, minHeight: 44 }}
          />
          <Button
            title="Decline"
            accessibilityLabel={`Decline request from ${name}`}
            variant="outline"
            compact
            onPress={() => onDecline?.(request)}
            style={{ flex: 1, minHeight: 44 }}
          />
        </View>
      )}
    </View>
  );
}
