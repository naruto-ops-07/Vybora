import { FingerprintIcon, LockSimpleIcon } from '@phosphor-icons/react';
import {
  APP_LOCK_AWAY_OPTIONS,
  APP_LOCK_HONESTY,
  APP_LOCK_PASSCODE_LENGTH,
  isValidPasscode,
  passcodeDigits,
  type AppLockAway,
} from '@vybora/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { Row, Section } from '@/features/connect/ui';
import { useAppLockOptional } from './AppLockProvider';

export type AppLockStep = 'idle' | 'set' | 'confirm' | 'off';

export interface AppLockSettingsProps {
  enabled: boolean;
  away: AppLockAway | null;
  hasBiometric: boolean;
  canUseBiometric: boolean;
  onTurnOn: (passcode: string) => Promise<void>;
  onTurnOff: (passcode: string) => Promise<boolean>;
  onAway: (away: AppLockAway) => void;
  onAddBiometric: () => Promise<void>;
  onRemoveBiometric: () => void;
  /** Gallery: open on a step. */
  initialStep?: AppLockStep;
  initialError?: string;
}

function PasscodeForm({
  label,
  hint,
  submit,
  onSubmit,
  onCancel,
  error,
  focus,
}: {
  label: string;
  hint?: string;
  submit: string;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  error?: string;
  focus: boolean;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setCode('');
    setBusy(false);
  }, [label, error]);
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPasscode(code)) return;
    setBusy(true);
    onSubmit(code);
  };
  return (
    <form onSubmit={go} className="space-y-4 px-4 py-4" noValidate>
      <Input
        ref={ref}
        label={label}
        hint={hint}
        error={error}
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={APP_LOCK_PASSCODE_LENGTH}
        value={code}
        onChange={(e) => setCode(passcodeDigits(e.target.value))}
        className="font-mono text-lg tracking-[0.5em]"
        autoFocus={focus}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" loading={busy} disabled={!isValidPasscode(code)}>
          {submit}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Settings → Privacy & security → App lock (a pure view; the gallery draws its states). */
export function AppLockSettings({
  enabled,
  away,
  hasBiometric,
  canUseBiometric,
  onTurnOn,
  onTurnOff,
  onAway,
  onAddBiometric,
  onRemoveBiometric,
  initialStep = 'idle',
  initialError,
}: AppLockSettingsProps) {
  const [step, setStep] = useState<AppLockStep>(initialStep);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | undefined>(initialError);
  const [bioBusy, setBioBusy] = useState(false);
  const toast = useToast();
  // Focus moves to a passcode field only after the person starts a step (not on first draw).
  const focus = step !== initialStep;
  const reset = () => {
    setStep('idle');
    setFirst('');
    setError(undefined);
  };

  return (
    <Section title="App lock" footer={APP_LOCK_HONESTY}>
      {step === 'set' && (
        <PasscodeForm
          label={`Choose a ${APP_LOCK_PASSCODE_LENGTH}-digit passcode`}
          hint="You’ll enter it each time VYBORA opens on this device."
          submit="Next"
          error={error}
          onCancel={reset}
          focus={focus}
          onSubmit={(code) => {
            setFirst(code);
            setError(undefined);
            setStep('confirm');
          }}
        />
      )}
      {step === 'confirm' && (
        <PasscodeForm
          label="Enter the passcode again"
          submit="Turn on app lock"
          error={error}
          onCancel={reset}
          focus={focus}
          onSubmit={(code) => {
            if (code !== first) {
              setFirst('');
              setStep('set');
              setError('Those passcodes didn’t match. Choose one again.');
              return;
            }
            void onTurnOn(code).then(
              () => {
                reset();
                toast.show('App lock is on.', 'success');
              },
              () => setError('Couldn’t turn on app lock. Try again.'),
            );
          }}
        />
      )}
      {step === 'off' && (
        <PasscodeForm
          label="Enter your passcode to turn off app lock"
          submit="Turn off"
          error={error}
          onCancel={reset}
          focus={focus}
          onSubmit={(code) => {
            void onTurnOff(code).then((ok) => {
              if (ok) {
                reset();
                toast.show('App lock is off.', 'success');
              } else setError('Wrong passcode. Try again.');
            });
          }}
        />
      )}

      {step === 'idle' && !enabled && (
        <Row
          icon={<LockSimpleIcon size={18} />}
          label="Turn on app lock"
          description="Ask for a passcode when VYBORA opens and after time away."
          onClick={() => setStep('set')}
        />
      )}

      {step === 'idle' && enabled && (
        <>
          <Row
            icon={<LockSimpleIcon size={18} />}
            label="App lock is on"
            description="VYBORA asks for your passcode when it opens on this device."
          />
          <div className="space-y-2 px-4 py-4">
            <p className="text-sm font-medium" aria-hidden="true">
              Lock after time away
            </p>
            <Segmented
              label="Lock after time away"
              value={away ?? undefined}
              options={APP_LOCK_AWAY_OPTIONS}
              onChange={onAway}
            />
          </div>
          {canUseBiometric && (
            <Row
              icon={<FingerprintIcon size={18} />}
              label="Unlock with fingerprint, face or Windows Hello"
              description="Uses this device’s own sign-in. Checked here, never sent anywhere."
              right={
                <span className="flex min-h-11 min-w-11 items-center justify-center">
                  <Toggle
                    label="Unlock with fingerprint, face or Windows Hello"
                    checked={hasBiometric}
                    disabled={bioBusy}
                    onChange={(on) => {
                      if (!on) return onRemoveBiometric();
                      setBioBusy(true);
                      void onAddBiometric()
                        .catch(() => toast.show('Couldn’t add biometric unlock.', 'error'))
                        .finally(() => setBioBusy(false));
                    }}
                  />
                </span>
              }
            />
          )}
          <Row
            icon={<LockSimpleIcon size={18} />}
            label="Turn off app lock"
            danger
            onClick={() => setStep('off')}
          />
        </>
      )}
    </Section>
  );
}

/** The live section, wired to this device’s lock. */
export function AppLockSection() {
  const lock = useAppLockOptional();
  if (!lock) return null;
  return (
    <AppLockSettings
      enabled={lock.enabled}
      away={lock.away}
      hasBiometric={lock.hasBiometric}
      canUseBiometric={lock.canUseBiometric}
      onTurnOn={lock.turnOn}
      onTurnOff={lock.turnOff}
      onAway={lock.setAway}
      onAddBiometric={lock.addBiometric}
      onRemoveBiometric={lock.removeBiometric}
    />
  );
}
