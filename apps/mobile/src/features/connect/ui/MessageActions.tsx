import type { LocalMessage } from '@vybora/e2ee';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

/** Reactions are message content (emoji), not interface icons. */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥'];

export function MessageActions({
  message,
  mine,
  myReaction,
  onClose,
  onReact,
  onReply,
  onCopy,
  onDelete,
}: {
  message: LocalMessage | null;
  mine: boolean;
  myReaction: string | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const cc = useCc();
  const actions: { icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'corner-up-left', label: 'Reply', onPress: onReply },
    ...(message?.kind === 'text'
      ? [{ icon: 'copy' as const, label: 'Copy text', onPress: onCopy }]
      : []),
    ...(mine
      ? [{ icon: 'trash' as const, label: 'Delete for everyone', onPress: onDelete, danger: true }]
      : []),
  ];
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: cc.dark ? 'rgba(0,0,0,0.6)' : 'rgba(11,20,22,0.5)',
          justifyContent: 'flex-end',
        }}
        onPress={onClose}
        accessibilityLabel="Close message actions"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: cc.panel,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            borderTopWidth: 1,
            borderColor: cc.line,
            paddingBottom: 24,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: cc.line,
            }}
            accessibilityRole="menu"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onReact(emoji)}
                accessibilityRole="menuitem"
                accessibilityLabel={`${myReaction === emoji ? 'Remove' : 'React with'} ${emoji}`}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.md,
                  backgroundColor: myReaction === emoji ? cc.accentSoft : 'transparent',
                }}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="menuitem"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 20,
                minHeight: 52,
                backgroundColor: pressed ? cc.raised : 'transparent',
              })}
            >
              <Icon name={a.icon} size={20} color={a.danger ? cc.danger : cc.textMuted} />
              <Text style={{ color: a.danger ? cc.danger : cc.text, fontSize: 16 }}>{a.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
