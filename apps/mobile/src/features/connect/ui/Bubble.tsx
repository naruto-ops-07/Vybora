import type { LocalMessage } from '@vybora/e2ee';
import { memo } from 'react';
import { formatClock, messageSummary, type Receipt } from '@vybora/core';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Avatar } from '@/components/ui';
import { radii } from '@/lib/theme';
import { FileAttachment, ImageAttachment, VideoAttachment, VoiceAttachment } from './Attachment';
import { useCc, type ResolvedTheme } from './primitives';

export type { Receipt } from '@vybora/core';

/** Avatar width (28) + gap (8): group bubbles are inset by this much. */
const AVATAR_COLUMN = 36;

const RECEIPT_LABEL: Record<Receipt, string> = {
  sending: 'sending',
  failed: 'not sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
};

export function Ticks({ receipt, color }: { receipt: Receipt; color: string }) {
  const cc = useCc();
  if (receipt === 'sending')
    return <Icon name="clock" size={11} color={color} accessibilityLabel="Sending" />;
  if (receipt === 'failed')
    return <Icon name="alert-circle" size={12} color={cc.danger} accessibilityLabel="Not sent" />;
  if (receipt === 'sent')
    return <Icon name="check" size={12} color={color} accessibilityLabel="Sent" />;
  return (
    <Icon
      name="checks"
      size={13}
      color={color}
      weight={receipt === 'read' ? 'bold' : 'regular'}
      accessibilityLabel={receipt === 'read' ? 'Read' : 'Delivered'}
    />
  );
}

/** Flat notch on the last bubble of a run, in the bubble's own colour. */
function Tail({ mine, fill, stroke }: { mine: boolean; fill: string; stroke?: string }) {
  return (
    <Svg
      testID="bubble-tail"
      width={8}
      height={10}
      viewBox="0 0 8 10"
      style={{
        position: 'absolute',
        bottom: 0,
        ...(mine ? { right: -7 } : { left: -7, transform: [{ scaleX: -1 }] }),
      }}
    >
      <Path d="M0 0C0.5 6 3.5 9 8 10H0Z" fill={fill} />
      {stroke ? (
        <Path d="M0 0C0.5 6 3.5 9 8 10H0" fill="none" stroke={stroke} strokeWidth={1} />
      ) : null}
    </Svg>
  );
}

export interface BubbleProps {
  message: LocalMessage;
  mine: boolean;
  theme: ResolvedTheme;
  senderName?: string;
  receipt?: Receipt;
  showSender: boolean;
  runStart: boolean;
  runEnd: boolean;
  avatar?: { path: string | null; name: string };
  onLongPress: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  onOpenImage: (uri: string) => void;
  onReplyPress?: (id: string) => void;
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (m: LocalMessage) => void;
  showReplyButton?: boolean;
  onReply?: (m: LocalMessage) => void;
  nameOf: (userId: string) => string;
}

export const Bubble = memo(function Bubble({
  message: m,
  mine,
  theme,
  senderName,
  receipt,
  showSender,
  runStart,
  runEnd,
  avatar,
  onLongPress,
  onRetry,
  onOpenImage,
  selecting,
  selected,
  onToggleSelect,
  showReplyButton,
  onReply,
  nameOf,
}: BubbleProps) {
  const cc = useCc();
  const filled = mine && !m.deleted && m.kind !== 'undecryptable';
  const textColor = filled ? theme.outgoingText : theme.incomingText;
  const meta = filled ? 'rgba(255,255,255,0.75)' : cc.textSubtle;
  const media =
    m.kind === 'attachment' && m.attachment?.kind !== 'voice' && m.attachment?.kind !== 'file';

  let content: React.ReactNode;
  if (m.kind === 'undecryptable') {
    content = (
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Icon name="shield-off" size={14} color={cc.warning} />
        <Text style={{ color: cc.textMuted, fontStyle: 'italic', flexShrink: 1 }}>
          This message couldn’t be decrypted on this device.
        </Text>
      </View>
    );
  } else if (m.deleted) {
    content = (
      <Text style={{ color: cc.textMuted, fontStyle: 'italic' }}>This message was deleted</Text>
    );
  } else if (m.kind === 'attachment' && m.attachment) {
    const a = m.attachment;
    content = (
      <View style={{ gap: 6 }}>
        {a.kind === 'image' && <ImageAttachment attachment={a} onOpen={onOpenImage} />}
        {a.kind === 'video' && <VideoAttachment attachment={a} />}
        {a.kind === 'voice' && <VoiceAttachment attachment={a} tint={textColor} />}
        {a.kind === 'file' && <FileAttachment attachment={a} tint={textColor} />}
        {!!m.caption && (
          <Text
            scale
            style={{
              color: textColor,
              fontSize: 15,
              lineHeight: 21,
              paddingHorizontal: media ? 6 : 0,
            }}
          >
            {m.caption}
          </Text>
        )}
      </View>
    );
  } else {
    content = (
      <Text scale style={{ color: textColor, fontSize: 15, lineHeight: 22 }}>
        {m.body}
      </Text>
    );
  }

  const reactions = Object.entries(m.reactions).filter(([, users]) => users.length);
  const bubbleStyle = {
    maxWidth: '82%' as const,
    paddingHorizontal: media ? 4 : 12,
    paddingVertical: media ? 4 : 8,
    borderRadius: radii.lg,
    borderBottomRightRadius: mine && runEnd ? radii.sm : radii.lg,
    borderBottomLeftRadius: !mine && runEnd ? radii.sm : radii.lg,
  };

  const inner = (
    <>
      {m.replyTo && !m.deleted && (
        <View
          style={{
            borderLeftWidth: 2,
            borderLeftColor: filled ? 'rgba(255,255,255,0.7)' : theme.accent,
            paddingLeft: 8,
            marginBottom: 6,
          }}
        >
          <Text
            style={{
              color: filled ? '#FFFFFF' : theme.accent,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            {nameOf(m.replyTo.senderId)}
          </Text>
          <Text style={{ color: textColor, opacity: 0.8, fontSize: 13 }} numberOfLines={2}>
            {m.replyTo.preview}
          </Text>
        </View>
      )}
      {content}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-end',
          alignItems: 'center',
          gap: 4,
          marginTop: 2,
          paddingRight: media ? 6 : 0,
          paddingBottom: media ? 2 : 0,
        }}
      >
        {m.expiresAt && (
          <Icon name="timer" size={11} color={meta} accessibilityLabel="Disappearing message" />
        )}
        <Text mono style={{ color: meta, fontSize: 11 }}>
          {formatClock(m.createdAt)}
        </Text>
        {mine && receipt && <Ticks receipt={receipt} color={meta} />}
      </View>
    </>
  );

  const actionable = !m.deleted && m.kind !== 'undecryptable';
  // The merged label hides the inner Pressable from screen readers, so its
  // gestures are re-exposed as accessibility actions. Opening a photo is not:
  // the decrypted image URI lives inside ImageAttachment, not here.
  // While selecting, activating toggles the message and the menu is unavailable.
  const actions = selecting
    ? [{ name: 'activate', label: selected ? 'Deselect message' : 'Select message' }]
    : [
        ...(receipt === 'failed' ? [{ name: 'activate', label: 'Retry sending' }] : []),
        ...(actionable ? [{ name: 'longpress', label: 'Message actions' }] : []),
      ];

  return (
    <View
      accessible
      accessibilityActions={actions}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (selecting) {
          if (name === 'activate') onToggleSelect?.(m);
        } else if (name === 'activate' && receipt === 'failed') onRetry(m);
        else if (name === 'longpress' && actionable) onLongPress(m);
      }}
      accessibilityState={selecting ? { selected: !!selected } : undefined}
      accessibilityHint={
        selecting
          ? undefined
          : receipt === 'failed'
            ? 'Tap to retry sending'
            : 'Long press for reactions and actions'
      }
      accessibilityLabel={[
        mine ? 'You' : nameOf(m.senderId),
        formatClock(m.createdAt),
        messageSummary(m),
        receipt ? RECEIPT_LABEL[receipt] : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={{
        alignItems: mine ? 'flex-end' : 'flex-start',
        paddingHorizontal: 12,
        marginTop: runStart ? 8 : 2,
        marginBottom: 0,
      }}
    >
      {showSender && !mine && senderName && (
        <Text
          style={{
            color: theme.accent,
            fontSize: 12,
            fontWeight: '600',
            marginLeft: avatar ? 4 + AVATAR_COLUMN : 4,
            marginBottom: 2,
          }}
        >
          {senderName}
        </Text>
      )}
      <View
        style={{
          flexDirection: mine ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '100%',
        }}
      >
        {selecting && (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 22,
              height: 22,
              borderRadius: radii.sm,
              borderWidth: 1,
              borderColor: selected ? cc.accent : cc.lineStrong,
              backgroundColor: selected ? cc.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            {selected && <Icon name="check" size={14} color={cc.onAccent} />}
          </View>
        )}
        {avatar &&
          !mine &&
          (runEnd ? (
            <Avatar path={avatar.path} name={avatar.name} size={28} />
          ) : (
            <View style={{ width: 28 }} />
          ))}
        <Pressable
          onLongPress={
            selecting ? undefined : () => !m.deleted && m.kind !== 'undecryptable' && onLongPress(m)
          }
          onPress={() => (selecting ? onToggleSelect?.(m) : receipt === 'failed' && onRetry(m))}
          delayLongPress={280}
          style={[
            bubbleStyle,
            filled
              ? { backgroundColor: theme.outgoing }
              : { backgroundColor: theme.incoming, borderWidth: 1, borderColor: cc.line },
          ]}
        >
          {inner}
          {runEnd && (
            <Tail
              mine={mine}
              fill={filled ? theme.outgoing : theme.incoming}
              stroke={filled ? undefined : cc.line}
            />
          )}
        </Pressable>
        {showReplyButton && !selecting && (
          <Pressable
            onPress={() => onReply?.(m)}
            accessibilityRole="button"
            accessibilityLabel="Reply"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="corner-up-left" size={18} color={cc.textMuted} />
          </Pressable>
        )}
      </View>
      {reactions.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            marginTop: 4,
            marginLeft: !mine && avatar ? 4 + AVATAR_COLUMN : 4,
            marginRight: 4,
          }}
        >
          {reactions.map(([emoji, users]) => (
            <View
              key={emoji}
              accessibilityLabel={`${emoji} ${users.length}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 6,
                height: 24,
                borderRadius: radii.sm,
                backgroundColor: cc.panel,
                borderWidth: 1,
                borderColor: cc.line,
              }}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              {users.length > 1 && (
                <Text mono style={{ color: cc.textMuted, fontSize: 11 }}>
                  {users.length}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
      {receipt === 'failed' && (
        <Text
          style={{ color: cc.danger, fontSize: 12, marginTop: 3, marginRight: 4 }}
          onPress={() => onRetry(m)}
          accessibilityRole="button"
        >
          Not sent · Tap to retry
        </Text>
      )}
    </View>
  );
});
