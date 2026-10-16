import type { Friend } from '@vybora/api';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { Avatar, Button } from '@/components/ui';
import { useCc } from '@/features/connect/ui/primitives';
import { nameOf } from './hooks';

/**
 * One friend: avatar (with a presence dot when they're online and visible to
 * me), name, @username and a Message button. Long press, or the "Remove
 * friend" screen-reader action, asks before removing.
 */
export function FriendRow({
  friend,
  online,
  busy,
  onMessage,
  onRemove,
}: {
  friend: Friend;
  online?: boolean;
  /** The direct chat is being opened. */
  busy?: boolean;
  onMessage: (friend: Friend) => void;
  onRemove: (friend: Friend) => void;
}) {
  const cc = useCc();
  const name = nameOf(friend);
  const message = () => {
    if (!busy) onMessage(friend);
  };
  const confirmRemove = () =>
    Alert.alert(
      `Remove ${name} from friends?`,
      'Your chats stay as they are. You can send a new request any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove friend', style: 'destructive', onPress: () => onRemove(friend) },
      ],
    );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 16,
        paddingRight: 12,
      }}
    >
      <Pressable
        onPress={message}
        onLongPress={confirmRemove}
        accessibilityRole="button"
        accessibilityLabel={`${name}, @${friend.username}${online ? ', online' : ''}`}
        accessibilityHint="Opens your chat. Long press to remove this friend."
        accessibilityActions={[
          { name: 'message', label: 'Message' },
          { name: 'remove', label: 'Remove friend' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'message') message();
          else if (e.nativeEvent.actionName === 'remove') confirmRemove();
        }}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 64,
          paddingVertical: 8,
          backgroundColor: pressed ? cc.raised : 'transparent',
        })}
      >
        <View>
          <Avatar path={friend.avatarPath} name={friend.username} size={48} />
          {online && (
            <View
              testID="presence-dot"
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 13,
                height: 13,
                borderRadius: 7,
                backgroundColor: cc.success,
                borderWidth: 2,
                borderColor: cc.panel,
              }}
            />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text scale style={{ color: cc.text, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>
            {name}
          </Text>
          <Text scale style={{ color: cc.textMuted, fontSize: 14 }} numberOfLines={1}>
            @{friend.username}
          </Text>
        </View>
      </Pressable>
      <Button
        title="Message"
        accessibilityLabel={`Message ${name}`}
        variant="outline"
        icon="message-circle"
        compact
        loading={busy}
        onPress={message}
        style={{ minHeight: 44 }}
      />
    </View>
  );
}
