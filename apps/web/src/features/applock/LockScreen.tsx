import { FingerprintIcon, LockSimpleIcon, SignOutIcon } from '@phosphor-icons/react';
import { APP_LOCK_PASSCODE_LENGTH, passcodeDigits, waitWords } from '@vybora/core';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Ambient } from '@/components/Ambient';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

export interface LockScreenProps {
  /** ms before another try is allowed (0 = none) */
  waitMs: number;
  offerSignOut: boolean;
  hasBiometric: boolean;
  onPasscode: (code: string) => Promise<{ ok: boolean; message?: string }>;
  onBiometric: () => Promise<{ ok: boolean; message?: string }>;
  onSignOut: () => void;
  /** Gallery: draw inside a frame instead of covering the viewport. */
  contained?: boolean;
  /** Gallery: a message to show as if a try just failed. */
  initialMessage?: string;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Covers the whole workspace while the app is locked. Focus stays inside; wrong tries and
 * waits are announced. Drawn in the look’s tokens and light; flat under high contrast.
 */
export function LockScreen({
  waitMs,
  offerSignOut,
  hasBiometric,
  onPasscode,
  onBiometric,
  onSignOut,
  contained,
  initialMessage,
}: LockScreenProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const waiting = waitMs > 0;

  useEffect(() => {
    if (!contained) input.current?.focus();
  }, [contained]);
  useEffect(() => {
    if (!waiting && !contained) input.current?.focus();
  }, [waiting, contained]);

  const submit = async (value: string) => {
    if (busy || waiting || value.length !== APP_LOCK_PASSCODE_LENGTH) return;
    setBusy(true);
    const r = await onPasscode(value);
    setBusy(false);
    if (!r.ok) {
      setCode('');
      setMessage(r.message ?? 'Wrong passcode. Try again.');
      setShake((n) => n + 1);
      input.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(code);
  };

  // Focus trap: Tab cycles within the lock screen.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const status = waiting ? `Too many wrong tries. Try again in ${waitWords(waitMs)}.` : message;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal={contained ? undefined : true}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={cn(
        'vy-lock relative isolate flex flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10 text-ink',
        contained ? 'min-h-[560px] rounded-lg border border-line' : 'fixed inset-0 z-[100]',
      )}
    >
      <Ambient />
      <div className="vy-canvas-layer relative flex w-full max-w-sm flex-col items-center text-center">
        <LogoMark size={28} />
        <div className="vy-lock-badge mt-8 flex h-20 w-20 items-center justify-center rounded-full">
          <LockSimpleIcon size={34} weight="fill" aria-hidden="true" />
        </div>
        <h1 id={titleId} className="type-wide mt-6 text-[22px] text-balance">
          VYBORA is locked
        </h1>
        <p className="mt-2 text-sm text-muted">Enter your passcode to see your chats.</p>

        <form onSubmit={onSubmit} className="mt-8 w-full" noValidate>
          <label htmlFor={fieldId} className="sr-only">
            Passcode, {APP_LOCK_PASSCODE_LENGTH} digits
          </label>
          <div
            key={shake}
            className={cn('vy-lock-slots relative mx-auto', shake > 0 && 'vy-lock-shake')}
          >
            <input
              ref={input}
              id={fieldId}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={APP_LOCK_PASSCODE_LENGTH}
              value={code}
              disabled={waiting || busy}
              aria-describedby={status ? `${fieldId}-status` : undefined}
              aria-invalid={!!message && !waiting ? true : undefined}
              onChange={(e) => {
                const next = passcodeDigits(e.target.value);
                setCode(next);
                if (next.length === APP_LOCK_PASSCODE_LENGTH) void submit(next);
              }}
              className="vy-lock-input absolute inset-0 h-full w-full cursor-text opacity-0"
            />
            <div className="pointer-events-none flex justify-center gap-3" aria-hidden="true">
              {Array.from({ length: APP_LOCK_PASSCODE_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className="vy-lock-slot flex h-12 w-11 items-center justify-center rounded-md"
                  data-filled={i < code.length || undefined}
                  data-current={i === code.length || undefined}
                >
                  <span className="vy-lock-dot h-2.5 w-2.5 rounded-full" />
                </span>
              ))}
            </div>
          </div>
          <p
            id={`${fieldId}-status`}
            role="status"
            aria-live="polite"
            className={cn(
              'mt-4 min-h-5 text-[13px]',
              waiting || message ? 'text-danger' : 'text-muted',
            )}
          >
            {status}
          </p>
          <Button
            type="submit"
            size="lg"
            fullWidth
            className="mt-4"
            loading={busy}
            disabled={waiting || code.length !== APP_LOCK_PASSCODE_LENGTH}
          >
            Unlock
          </Button>
        </form>

        {hasBiometric && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-3 h-auto min-h-12 py-2.5 whitespace-normal text-balance"
            leftIcon={<FingerprintIcon size={20} aria-hidden="true" />}
            onClick={async () => {
              const r = await onBiometric();
              if (!r.ok && r.message) setMessage(r.message);
            }}
          >
            Unlock with fingerprint, face or Windows Hello
          </Button>
        )}

        {offerSignOut && (
          <div className="mt-8 w-full rounded-lg border border-line p-4 text-left">
            <p className="text-sm font-medium">Forgot your passcode?</p>
            <p className="mt-1 text-[13px] text-muted">
              Sign out of this device, then sign back in. Signing out turns app lock off here.
            </p>
            <Button
              type="button"
              variant="danger"
              fullWidth
              className="mt-3 min-h-11"
              leftIcon={<SignOutIcon size={18} aria-hidden="true" />}
              onClick={onSignOut}
            >
              Sign out of this device
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
