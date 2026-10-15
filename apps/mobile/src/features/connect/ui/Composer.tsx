import type { ReplyRef } from '@vybora/e2ee';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { Text, TextInput } from '@/components/Text';
import { radii } from '@/lib/theme';
import { useCc } from './primitives';

export interface ComposerProps {
  accent: string;
  disabled?: boolean;
  disabledReason?: string;
  replyTo: (ReplyRef & { name: string }) | null;
  onCancelReply: () => void;
  onSend: (text: string) => void;
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
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  color?: string;
}) {
  const cc = useCc();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? cc.accent : pressed ? cc.raised : 'transparent',
        opacity: filled && pressed ? 0.8 : 1,
      })}
    >
      <Icon
        name={icon}
        size={filled ? 18 : 22}
        color={filled ? cc.onAccent : (color ?? cc.textMuted)}
        weight={filled ? 'fill' : 'regular'}
      />
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
  const cc = useCc();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const started = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - started.current), 250);
    return () => clearInterval(t);
  }, [recording]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
    onTyping(false);
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
        backgroundColor: cc.panel,
        borderTopWidth: 1,
        borderTopColor: cc.line,
      }}
    >
      {replyTo && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 6,
            paddingLeft: 10,
            backgroundColor: cc.raised,
            borderLeftWidth: 2,
            borderLeftColor: accent,
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
              borderRadius: radii.md,
              backgroundColor: cc.night,
              borderWidth: 1,
              borderColor: cc.lineStrong,
              color: cc.text,
              paddingHorizontal: 12,
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: 16,
            }}
          />
          {text.trim() ? (
            <SquareButton icon="send" label="Send" onPress={send} filled />
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
