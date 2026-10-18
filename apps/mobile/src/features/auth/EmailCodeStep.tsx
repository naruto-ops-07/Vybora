import { verifyEmailCode } from '@vybora/api';
import {
  digitsFromCode,
  emailCodeError,
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_RESEND_SECONDS,
} from '@vybora/core';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, TextInput, View } from 'react-native';
import { Text as BaseText } from '@/components/Text';
import { Button, Text } from '@/components/ui';
import { useA11y } from '@/lib/a11y';
import { logDevError } from '@/lib/devLog';
import { useHaptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, radii, useTheme } from '@/lib/theme';
import { AuthTextButton, FormError } from './AuthScreen';
import { lastCodeSent, markCodeSent, secondsUntil, type CodePurpose } from './codeCooldown';

/** The boxes sit in two groups of three, the way people read a code aloud. */
const GROUP_AT = EMAIL_CODE_LENGTH / 2;
const BOX_HEIGHT = 56;
const BOX_MAX_WIDTH = 52;
/** A small, quick shake for a wrong code (skipped with reduced motion). */
const SHAKE = [7, -7, 5, -5, 2, 0];

/** 59 → "0:59". */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** 59 → "59 seconds", for screen readers ("0:59" reads badly). */
function spokenWait(seconds: number): string {
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * The code after an edit. Text is cleaned to its digits, so "123 456",
 * "123-456" and "Your code: 123456" all fill the boxes. A whole code pasted
 * (or autofilled) beside digits already typed replaces them rather than being
 * cut off after the first few.
 */
function nextCode(previous: string, text: string): string {
  if (previous && text.startsWith(previous)) {
    const added = digitsFromCode(text.slice(previous.length));
    if (added.length === EMAIL_CODE_LENGTH) return added;
  }
  return digitsFromCode(text);
}

const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);

export interface EmailCodeStepProps {
  email: string;
  purpose: CodePurpose;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}

type StepError = { message: string; kind: 'code' | 'send' };

/**
 * Six boxes for the code emailed at sign-up or sign-in, with Verify, a resend
 * countdown and a way back to change the address. One invisible text field
 * lies over the boxes, so a tap, the keyboard's code suggestion, autofill and
 * long-press paste all reach the real input; the boxes only draw its value.
 * The sixth digit submits. A successful check signs in, and the auth layout
 * then leaves for the inbox, so the step stays busy until it does.
 */
export function EmailCodeStep({ email, purpose, onResend, onChangeEmail }: EmailCodeStepProps) {
  const t = useTheme();
  const haptic = useHaptics();
  const { reduceMotion } = useA11y();
  const [code, setCode] = useState('');
  const [error, setError] = useState<StepError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [focused, setFocused] = useState(false);
  // One check at a time: the sixth digit and a fast double tap on Verify can
  // both arrive before the busy state renders.
  const inFlight = useRef(false);
  const input = useRef<TextInput>(null);
  const [shake] = useState(() => new Animated.Value(0));

  // The wait follows the address (see codeCooldown): coming back to the same
  // email picks up where the last send left off.
  const [sentAt, setSentAt] = useState(() => lastCodeSent(purpose, email) ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wait = secondsUntil(sentAt + EMAIL_CODE_RESEND_SECONDS * 1000, now);
  const cooling = wait > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooling, sentAt]);

  // Tell screen reader users when they can ask again (they can't see the count).
  const wasCooling = useRef(cooling);
  useEffect(() => {
    if (wasCooling.current && !cooling) announce('You can send a new code now.');
    wasCooling.current = cooling;
  }, [cooling]);

  function shakeBoxes() {
    if (reduceMotion) return;
    shake.setValue(0);
    Animated.sequence(
      SHAKE.map((toValue) =>
        Animated.timing(shake, { toValue, duration: 45, useNativeDriver: true }),
      ),
    ).start();
  }

  async function verify(value: string) {
    if (inFlight.current) return;
    if (value.length < EMAIL_CODE_LENGTH) {
      const message = `Enter all ${EMAIL_CODE_LENGTH} digits.`;
      setError({ message, kind: 'code' });
      announce(message);
      input.current?.focus();
      return;
    }
    inFlight.current = true;
    setVerifying(true);
    setError(null);
    setNotice(null);
    announce('Checking the code…');
    try {
      await verifyEmailCode(supabase, { email, code: value, purpose });
    } catch (e) {
      logDevError('verify code', e);
      inFlight.current = false;
      const message = emailCodeError(e);
      setVerifying(false);
      setCode('');
      setError({ message, kind: 'code' });
      announce(message);
      haptic('medium');
      shakeBoxes();
      input.current?.focus();
      return;
    }
    // Signed in. Stay busy (inFlight stays set) until the next screen takes over.
    setVerified(true);
    haptic('light');
  }

  function onChangeText(text: string) {
    // While a check runs the field keeps its value; React puts it back.
    if (inFlight.current) return;
    const next = nextCode(code, text);
    setCode(next);
    setError(null);
    setNotice(null);
    if (next.length === EMAIL_CODE_LENGTH) void verify(next);
  }

  async function resend() {
    if (cooling || resending || inFlight.current) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await onResend();
    } catch (e) {
      logDevError('resend code', e);
      setResending(false);
      const message = emailCodeError(e);
      // A failed send says nothing about the code typed so far: the boxes stay as they are.
      setError({ message, kind: 'send' });
      announce(message);
      return;
    }
    const at = markCodeSent(purpose, email);
    setSentAt(at);
    setNow(at);
    setResending(false);
    setCode('');
    const message =
      purpose === 'signin'
        ? 'If there’s an account for that email, we’ve sent a new code.'
        : 'We sent a new code.';
    setNotice(message);
    announce(message);
    input.current?.focus();
  }

  const codeError = error?.kind === 'code';
  // The box the next digit goes into, while the field has focus.
  const active = focused && !verifying && code.length < EMAIL_CODE_LENGTH ? code.length : -1;

  return (
    <View style={{ gap: 20 }}>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <View
          // Drawn for sight only: screen readers get the field below, which reads its value.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => {
            const digit = code.charAt(i);
            const isActive = i === active;
            const borderColor = verified
              ? t.success
              : codeError
                ? t.danger
                : isActive
                  ? t.accent
                  : digit
                    ? t.textSubtle
                    : t.borderStrong;
            return (
              <Fragment key={i}>
                {i === GROUP_AT && (
                  <View
                    style={{
                      width: 10,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: t.borderStrong,
                    }}
                  />
                )}
                <View
                  testID={`code-box-${i}`}
                  style={{
                    flex: 1,
                    maxWidth: BOX_MAX_WIDTH,
                    height: BOX_HEIGHT,
                    borderRadius: radii.md,
                    // Border-box sizing: the thicker ring never moves the digit.
                    borderWidth: isActive ? 2 : 1,
                    borderColor,
                    backgroundColor: t.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {digit ? (
                    <BaseText
                      style={{
                        fontFamily: font.monoMedium,
                        fontSize: 24,
                        color: verifying && !verified ? t.textMuted : t.text,
                      }}
                    >
                      {digit}
                    </BaseText>
                  ) : isActive ? (
                    <Caret color={codeError ? t.danger : t.accent} blink={!reduceMotion} />
                  ) : null}
                </View>
              </Fragment>
            );
          })}
        </View>
        <TextInput
          ref={input}
          value={code}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          // No maxLength: the native cap would cut a pasted "123 456" to "123 45"
          // before we see it. The value is held to six digits here instead.
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          importantForAutofill="yes"
          autoCorrect={false}
          spellCheck={false}
          caretHidden
          selectionColor="transparent"
          underlineColorAndroid="transparent"
          returnKeyType="done"
          onSubmitEditing={() => void verify(code)}
          accessibilityLabel="Verification code"
          accessibilityHint={error?.message ?? `The ${EMAIL_CODE_LENGTH}-digit code from the email`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            color: 'transparent',
            backgroundColor: 'transparent',
            fontSize: 16,
          }}
        />
      </Animated.View>

      <FormError message={error?.message ?? null} />

      <Button title="Verify" onPress={() => void verify(code)} loading={verifying} />

      <View style={{ alignItems: 'center' }}>
        <AuthTextButton
          label={cooling ? `Resend code in ${spokenWait(wait)}` : 'Resend code'}
          disabled={cooling || verifying || resending}
          busy={resending}
          onPress={() => void resend()}
        >
          {cooling ? (
            <>
              Resend code in{' '}
              <BaseText style={{ fontFamily: font.monoMedium }}>{clock(wait)}</BaseText>
            </>
          ) : (
            'Resend code'
          )}
        </AuthTextButton>
        {notice && (
          <Text variant="small" style={{ textAlign: 'center', paddingHorizontal: 12 }}>
            {notice}
          </Text>
        )}
        <AuthTextButton
          label="Use a different email"
          tone="muted"
          // Not mid-send either: leaving now would let the same address be asked again
          // before this send is recorded.
          disabled={verifying || resending}
          onPress={onChangeEmail}
        />
      </View>
    </View>
  );
}

/** The insertion point in the next empty box: blinks, or holds still with reduced motion. */
function Caret({ color, blink }: { color: string; blink: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    opacity.setValue(1);
    if (!blink) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opacity, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.delay(420),
        Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, opacity]);
  return (
    <Animated.View
      style={{ width: 2, height: 26, borderRadius: 1, backgroundColor: color, opacity }}
    />
  );
}
