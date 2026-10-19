import type { ReplyRef } from '@vybora/e2ee';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text, TextInput } from '@/components/Text';
import { useA11y } from '@/lib/a11y';
import { useHaptics } from '@/lib/haptics';
import { tint, useTheme } from '@/lib/theme';
import { PrimaryIconButton, useCc } from './primitives';
import { SendGlyph, useSealedSend } from './SealedSend';

export interface ComposerProps {
  accent: string;
  disabled?: boolean;
  disabledReason?: string;
  replyTo: (ReplyRef & { name: string }) | null;
  onCancelReply: () => void;
  /** Resolve `false` when the send failed: the seal only plays for a send that went out. */
  onSend: (text: string) => void | Promise<boolean | void>;
  onAttach: () => void;
  onVoice: (uri: string, durationMs: number) => void;
  onTyping: (typing: boolean) => void;
}

function SquareButton({
  icon,
  label,
  onPress,
  filled,
  color,
  glyph,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  color?: string;
  /** Replaces the icon (the send button's sealed-send glyph). */
  glyph?: ReactNode;
}) {
  const t = useTheme();
  const cc = useCc();
  // Send: the look's round primary gradient (flat under high contrast).
  if (filled)
    return (
      <PrimaryIconButton label={label} onPress={onPress} size={44}>
        {glyph ?? (
          <Icon
            name={icon}
            size={18}
            color={t.highContrast ? t.onAccent : t.onPrimary}
            weight="fill"
          />
        )}
      </PrimaryIconButton>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tint(cc.text, '14') : 'transparent',
      })}
    >
      {glyph ?? <Icon name={icon} size={22} color={color ?? cc.textMuted} />}
    </Pressable>
  );
}

export function Composer({
  accent,
  disabled,
  disabledReason,
  replyTo,
  onCancelReply,
  onSend,
  onAttach,
  onVoice,
  onTyping,
}: ComposerProps) {
  const t = useTheme();
  const { radii } = t;
  const sendInk = t.highContrast ? t.onAccent : t.onPrimary;
  const cc = useCc();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const started = useRef(0);
  const { reduceMotion } = useA11y();
  const haptic = useHaptics();
  const seal = useSealedSend(reduceMotion);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - started.current), 250);
    return () => clearInterval(t);
  }, [recording]);

  const sealed = () => {
    if (!mounted.current) return;
    seal.play();
    haptic('light');
  };
  const send = () => {
    const body = text.trim();
    if (!body) return;
    const result = onSend(body);
    setText('');
    onTyping(false);
    if (result && typeof result.then === 'function')
      void result.then(
        (ok) => ok !== false && sealed(),
        () => undefined,
      );
    else sealed();
  };

  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone access is off',
          'Allow microphone access in Settings to send voice messages.',
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      started.current = Date.now();
      setElapsed(0);
      setRecording(true);
    } catch {
      Alert.alert('Couldn’t start recording', 'Check microphone access and try again.');
    }
  };

  const stopRecording = async (sendIt: boolean) => {
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      Alert.alert('Recording failed', 'The voice message couldn’t be saved.');
      return;
    }
    const duration = Date.now() - started.current;
    if (sendIt && recorder.uri && duration > 600) onVoice(recorder.uri, duration);
  };

  if (disabled) {
    return (
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: cc.line,
          backgroundColor: cc.panel,
        }}
      >
        <Icon name="lock" size={16} color={cc.accent} />
        <Text style={{ color: cc.textMuted, fontSize: 13, lineHeight: 19, flex: 1 }}>
          {disabledReason}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 8,
        backgroundColor: cc.bar,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: cc.highContrast ? cc.lineStrong : cc.line,
      }}
    >
      {replyTo && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 6,
            paddingLeft: 12,
            marginHorizontal: 4,
            borderRadius: radii.md,
            backgroundColor: cc.raised,
            borderLeftWidth: 3,
            borderLeftColor: accent,
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: accent, fontSize: 12, fontWeight: '600' }}>
              Replying to {replyTo.name}
            </Text>
            <Text style={{ color: cc.textMuted, fontSize: 13 }} numberOfLines={1}>
              {replyTo.preview}
            </Text>
          </View>
          <SquareButton icon="x" label="Cancel reply" onPress={onCancelReply} />
        </View>
      )}
      {recording ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 }}>
          <SquareButton
            icon="trash"
            label="Discard recording"
            onPress={() => void stopRecording(false)}
            color={cc.danger}
          />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cc.danger }} />
          <Text
            mono
            style={{ color: cc.text, flex: 1, fontSize: 13 }}
            accessibilityLiveRegion="polite"
          >
            Recording {Math.floor(elapsed / 60000)}:
            {String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}
          </Text>
          <SquareButton
            icon="send"
            label="Send voice message"
            onPress={() => void stopRecording(true)}
            filled
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <SquareButton icon="paperclip" label="Attach photo, video or file" onPress={onAttach} />
          <TextInput
            scale
            value={text}
            onChangeText={(v) => {
              setText(v);
              onTyping(v.length > 0);
            }}
            placeholder="Message"
            placeholderTextColor={cc.textSubtle}
            multiline
            maxLength={4000}
            accessibilityLabel="Message"
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 130,
              // The look's search-field treatment (web `.vy-search`): a muted, rounded well.
              borderRadius: 22,
              backgroundColor: cc.raised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cc.highContrast ? cc.lineStrong : cc.line,
              color: cc.text,
              paddingHorizontal: 16,
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: 16,
            }}
          />
          {text.trim() || seal.playing ? (
            <SquareButton
              icon="send"
              label="Send"
              onPress={send}
              filled
              glyph={<SendGlyph seal={seal} color={sendInk} />}
            />
          ) : (
            <SquareButton
              icon="mic"
              label="Record a voice message"
              onPress={() => void startRecording()}
            />
          )}
        </View>
      )}
    </View>
  );
}
