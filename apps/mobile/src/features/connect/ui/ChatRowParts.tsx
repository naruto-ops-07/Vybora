import { isMuted, peerOf, type SecureConversation } from '@vybora/api';
import { formatUnread, type RowPreview } from '@vybora/core';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Avatar, GroupAvatar } from '@/components/ui';
import { tint, useTheme } from '@/lib/theme';
import { Ticks } from './Bubble';
import { CountPill, useCc } from './primitives';

/** Chat-list preview: "typing…" in the accent colour, or `You: text` with delivery ticks. */
export function RowPreviewLine({ preview, unread }: { preview: RowPreview; unread: boolean }) {
  const cc = useCc();
  if (preview.typing)
    return (
      <Text scale style={{ color: cc.accent, fontSize: 14, flex: 1 }} numberOfLines={1}>
        {preview.text}
      </Text>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
      {preview.receipt && <Ticks receipt={preview.receipt} color={cc.textSubtle} />}
      <Text
        scale
        style={{ color: unread ? cc.text : cc.textMuted, fontSize: 14, flex: 1 }}
        numberOfLines={1}
      >
        {preview.prefix ? `${preview.prefix}: ${preview.text}` : preview.text}
      </Text>
    </View>
  );
}

export function ChatRow({
  conv,
  myId,
  title,
  preview,
  time,
  online,
  onPress,
  onLongPress,
  onTogglePin,
  onToggleMute,
  onArchive,
}: {
  conv: SecureConversation;
  myId: string;
  title: string;
  preview: RowPreview;
  time: string;
  online: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onArchive: () => void;
}) {
  const { radii } = useTheme();
  const cc = useCc();
  const peer = peerOf(conv, myId);
  const unread = conv.unreadCount > 0;
  const muted = isMuted(conv) || !conv.notificationsEnabled;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityActions={[
        { name: 'togglePin', label: conv.pinned ? 'Unpin' : 'Pin' },
        { name: 'toggleMute', label: isMuted(conv) ? 'Unmute' : 'Mute' },
        { name: 'archive', label: conv.archived ? 'Unarchive' : 'Archive' },
        { name: 'longpress', label: 'More actions' },
      ]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name === 'togglePin') onTogglePin();
        else if (name === 'toggleMute') onToggleMute();
        else if (name === 'archive') onArchive();
        else if (name === 'longpress') onLongPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${conv.unreadCount} unread` : ''}${muted ? ', muted' : ''}${conv.pinned ? ', pinned' : ''}`}
      accessibilityHint="Long press for pin, archive and details"
      // Inset and rounded (web `.vy-row`); pressed is an ink tint on the page.
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? tint(cc.text, '12') : 'transparent',
      })}
    >
      <View>
        {conv.kind === 'group' ? (
          <GroupAvatar
            members={conv.members.filter((m) => m.id !== myId)}
            size={48}
            ring={cc.night}
          />
        ) : (
          <Avatar
            path={peer?.avatar_path}
            name={peer?.username ?? '?'}
            userId={peer?.id ?? conv.id}
            displayName={peer?.display_name}
            size={48}
            decorative
          />
        )}
        {online && (
          <View
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: cc.success,
              borderWidth: 2,
              borderColor: cc.night,
            }}
            accessibilityLabel="Online"
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            scale
            style={{
              color: cc.text,
              fontSize: 16,
              fontWeight: unread ? '700' : '600',
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {conv.pinned && <Icon name="pin" size={12} color={cc.textSubtle} />}
          {muted && <Icon name="bell-off" size={12} color={cc.textSubtle} />}
          <Text
            mono
            style={{ color: unread ? cc.accent : cc.textSubtle, fontSize: 11, marginLeft: 'auto' }}
          >
            {time}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RowPreviewLine preview={preview} unread={unread} />
          {unread && <CountPill label={formatUnread(conv.unreadCount)} quiet={muted} />}
        </View>
      </View>
    </Pressable>
  );
}
