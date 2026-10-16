import type { MessageAction } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

/** Reactions are message content (emoji), not interface icons. */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥'];

const ACTION: Record<MessageAction, { icon: IconName; label: string; danger?: boolean }> = {
  reply: { icon: 'corner-up-left', label: 'Reply' },
  copy: { icon: 'copy', label: 'Copy text' },
  select: { icon: 'check-circle', label: 'Select' },
  delete: { icon: 'trash', label: 'Delete for everyone', danger: true },
};

export function MessageActions({
  message,
  myReaction,
  actions,
  onClose,
  onReact,
  onAction,
}: {
  message: LocalMessage | null;
  myReaction: string | null;
  actions: MessageAction[];
  onClose: () => void;
  onReact: (emoji: string) => void;
  onAction: (a: MessageAction) => void;
}) {
  const cc = useCc();
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
          {actions.map((a) => {
            const def = ACTION[a];
            return (
              <Pressable
                key={a}
                onPress={() => onAction(a)}
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
                <Icon name={def.icon} size={20} color={def.danger ? cc.danger : cc.textMuted} />
                <Text style={{ color: def.danger ? cc.danger : cc.text, fontSize: 16 }}>
                  {def.label}
                </Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
