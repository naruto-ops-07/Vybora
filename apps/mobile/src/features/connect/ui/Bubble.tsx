import type { LocalMessage } from '@vybora/e2ee';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { radii } from '@/lib/theme';
import { FileAttachment, ImageAttachment, VideoAttachment, VoiceAttachment } from './Attachment';
import { useCc, type ResolvedTheme } from './primitives';

export type Receipt = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Ticks({ receipt, color }: { receipt: Receipt; color: string }) {
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

export interface BubbleProps {
  message: LocalMessage;
  mine: boolean;
  theme: ResolvedTheme;
  senderName?: string;
  receipt?: Receipt;
  showSender: boolean;
  onLongPress: (m: LocalMessage) => void;
  onRetry: (m: LocalMessage) => void;
  onOpenImage: (uri: string) => void;
  onReplyPress?: (id: string) => void;
  nameOf: (userId: string) => string;
}

export const Bubble = memo(function Bubble({
  message: m,
  mine,
  theme,
  senderName,
  receipt,
  showSender,
  onLongPress,
  onRetry,
  onOpenImage,
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
    content = <Text style={{ color: textColor, fontSize: 15, lineHeight: 22 }}>{m.body}</Text>;
  }

  const reactions = Object.entries(m.reactions).filter(([, users]) => users.length);
  const bubbleStyle = {
    maxWidth: '82%' as const,
    paddingHorizontal: media ? 4 : 12,
    paddingVertical: media ? 4 : 8,
    borderRadius: radii.lg,
    borderBottomRightRadius: mine ? radii.sm : radii.lg,
    borderBottomLeftRadius: mine ? radii.lg : radii.sm,
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
          {time(m.createdAt)}
        </Text>
        {mine && receipt && <Ticks receipt={receipt} color={meta} />}
      </View>
    </>
  );

  return (
    <View
      style={{
        alignItems: mine ? 'flex-end' : 'flex-start',
        paddingHorizontal: 12,
        marginVertical: 2,
      }}
    >
      {showSender && !mine && senderName && (
        <Text
          style={{
            color: theme.accent,
            fontSize: 12,
            fontWeight: '600',
            marginLeft: 4,
            marginBottom: 2,
          }}
        >
          {senderName}
        </Text>
      )}
      <Pressable
        onLongPress={() => !m.deleted && m.kind !== 'undecryptable' && onLongPress(m)}
        onPress={() => receipt === 'failed' && onRetry(m)}
        delayLongPress={280}
        accessibilityHint={
          receipt === 'failed' ? 'Tap to retry sending' : 'Long press for reactions and actions'
        }
        style={[
          bubbleStyle,
          filled
            ? { backgroundColor: theme.outgoing }
            : { backgroundColor: theme.incoming, borderWidth: 1, borderColor: cc.line },
        ]}
      >
        {inner}
      </Pressable>
      {reactions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, marginHorizontal: 4 }}>
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
