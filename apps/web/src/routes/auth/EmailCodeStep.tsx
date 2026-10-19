import { verifyEmailCode } from '@vybora/api';
import {
  codeResentMessage,
  countdownClock,
  digitsFromCode,
  EMAIL_CODE_INCOMPLETE,
  EMAIL_CODE_LENGTH,
  emailCodeError,
  lastCodeSent,
  markCodeSent,
  resendWaitLeft,
  type CodePurpose,
} from '@vybora/core';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { FormError } from './AuthLayout';
import { logDevError } from '@/lib/devLog';

const EMPTY: readonly string[] = Array.from({ length: EMAIL_CODE_LENGTH }, () => '');
/** The boxes sit in two groups of three, the way people read a code aloud. */
const GROUP_AT = EMAIL_CODE_LENGTH / 2;

/** A wrong or incomplete code marks the boxes; a failed resend says nothing about them. */
type StepError = { message: string; kind: 'code' | 'send' };

export interface EmailCodeStepProps {
  email: string;
  purpose: CodePurpose;
  onVerified: () => void;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}

/**
 * Six boxes for the code emailed at sign-up or sign-in, with Verify, a resend
 * countdown and a way back to change the address. The sixth digit submits;
 * a pasted or autofilled code ("123 456", "123-456", "Your code: 123456")
 * fills every box from the first.
 */
export function EmailCodeStep({
  email,
  purpose,
  onVerified,
  onResend,
  onChangeEmail,
}: EmailCodeStepProps) {
  const [digits, setDigits] = useState<readonly string[]>(EMPTY);
  const [error, setError] = useState<StepError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  // One check at a time: the sixth digit, Enter and a fast double tap on Verify
  // can all arrive before the busy state renders.
  const inFlight = useRef(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const resendButton = useRef<HTMLButtonElement>(null);
  // Set when a resend fails: focus goes back to Resend once it is enabled again.
  const refocusResend = useRef(false);
  const errorId = useId();

  // The wait follows the address (see markCodeSent in core), so coming back to
  // the same email picks up where the last send left off. The screen that sent
  // the code records the send; rendering never does.
  const [sentAt, setSentAt] = useState(() => lastCodeSent(purpose, email) ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wait = resendWaitLeft(sentAt, now);
  const cooling = wait > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooling, sentAt]);

  // The step replaces the form that sent the code: start in the first box.
  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  // A disabled button can't take focus, so wait until the failed send has finished.
  useEffect(() => {
    if (resending || !refocusResend.current) return;
    refocusResend.current = false;
    resendButton.current?.focus();
  }, [resending]);

  function focusBox(i: number) {
    const box = boxes.current[Math.min(Math.max(i, 0), EMAIL_CODE_LENGTH - 1)];
    box?.focus();
    box?.select();
  }

  async function verify(code: readonly string[]) {
    if (inFlight.current) return;
    const missing = code.findIndex((d) => !d);
    if (missing !== -1) {
      setError({ message: EMAIL_CODE_INCOMPLETE, kind: 'code' });
      focusBox(missing);
      return;
    }
    inFlight.current = true;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      await verifyEmailCode(supabase, { email, code: code.join(''), purpose });
    } catch (e) {
      logDevError('verify code', e);
      inFlight.current = false;
      setVerifying(false);
      setError({ message: emailCodeError(e), kind: 'code' });
      setDigits(EMPTY);
      focusBox(0);
      return;
    }
    // Signed in: stay busy until the next screen takes over.
    onVerified();
  }

  /** Place digits from box `at`; a whole code always starts at the first box. */
  function fill(at: number, incoming: string) {
    if (!incoming || inFlight.current) return;
    const start = incoming.length >= EMAIL_CODE_LENGTH ? 0 : at;
    const next = [...digits];
    for (let k = 0; k < incoming.length && start + k < EMAIL_CODE_LENGTH; k++) {
      next[start + k] = incoming.charAt(k);
    }
    setDigits(next);
    setError(null);
    setNotice(null);
    if (next.every(Boolean)) {
      focusBox(EMAIL_CODE_LENGTH - 1);
      void verify(next);
    } else {
      focusBox(start + incoming.length);
    }
  }

  function clearBox(i: number) {
    if (inFlight.current) return;
    setDigits((prev) => prev.map((d, k) => (k === i ? '' : d)));
  }

  function onChange(i: number, value: string) {
    let raw = value.replace(/\D/g, '');
    const prev = digits[i];
    // Typed beside the digit already there rather than over it: keep the new one.
    if (prev && raw.length > 1 && raw.length !== EMAIL_CODE_LENGTH) {
      const at = raw.indexOf(prev);
      if (at !== -1) raw = raw.slice(0, at) + raw.slice(at + 1);
    }
    if (raw) fill(i, digitsFromCode(raw));
    else if (!value) clearBox(i);
    // Anything else (a letter, a space) is ignored and the box keeps its digit.
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (digits[i]) clearBox(i);
        else if (e.key === 'Backspace' && i > 0) {
          clearBox(i - 1);
          focusBox(i - 1);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusBox(i - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        focusBox(i + 1);
        break;
      case 'Home':
        e.preventDefault();
        focusBox(0);
        break;
      case 'End':
        e.preventDefault();
        focusBox(EMAIL_CODE_LENGTH - 1);
        break;
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(i, digitsFromCode(e.clipboardData.getData('text')));
  }

  // A code pasted while focus is elsewhere on the page (say, on Verify) still lands.
  const fillLatest = useRef(fill);
  useEffect(() => {
    fillLatest.current = fill;
  });
  useEffect(() => {
    function onDocumentPaste(e: globalThis.ClipboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      const incoming = digitsFromCode(e.clipboardData?.getData('text') ?? '');
      if (!incoming) return;
      e.preventDefault();
      fillLatest.current(0, incoming);
    }
    document.addEventListener('paste', onDocumentPaste);
    return () => document.removeEventListener('paste', onDocumentPaste);
  }, []);

  async function resend() {
    if (cooling || resending || inFlight.current) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await onResend();
    } catch (e) {
      logDevError('resend code', e);
      // A failed send says nothing about the code typed so far: the boxes stay as they are.
      setError({ message: emailCodeError(e), kind: 'send' });
      refocusResend.current = true;
      setResending(false);
      return;
    }
    const at = markCodeSent(purpose, email);
    setSentAt(at);
    setNow(at);
    setResending(false);
    setDigits(EMPTY);
    setNotice(codeResentMessage(purpose));
    // The button is counting down again, so focus goes where the new code goes.
    focusBox(0);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void verify(digits);
  }

  const codeError = error?.kind === 'code';

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <div
        role="group"
        aria-label="Verification code"
        aria-describedby={codeError ? errorId : undefined}
        className="flex items-center gap-2"
      >
        {digits.map((digit, i) => (
          <Fragment key={i}>
            {i === GROUP_AT && (
              <span aria-hidden="true" className="h-px w-3 shrink-0 bg-line-strong" />
            )}
            <input
              ref={(el) => {
                boxes.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Digit ${i + 1} of ${EMAIL_CODE_LENGTH}`}
              aria-invalid={codeError || undefined}
              value={digit}
              readOnly={verifying}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={(e) => onPaste(i, e)}
              onFocus={(e) => e.currentTarget.select()}
              className={cn(
                // The look's field: its edge, inset, radius and accent focus ring.
                'vy-field h-14 w-full min-w-0 flex-1 rounded-md text-center font-mono text-2xl font-medium tabular-nums caret-accent',
                'read-only:text-muted',
                !codeError && digit && 'border-muted focus:border-accent',
              )}
            />
          </Fragment>
        ))}
      </div>

      {error && (
        <div id={errorId}>
          <FormError message={error.message} />
        </div>
      )}

      <Button type="submit" fullWidth size="lg" loading={verifying}>
        Verify
      </Button>

      <div className="flex flex-col items-center gap-1">
        <Button
          ref={resendButton}
          variant="ghost"
          className="touch-target text-accent disabled:text-muted disabled:opacity-100"
          disabled={cooling || verifying}
          loading={resending}
          aria-describedby={error?.kind === 'send' ? errorId : undefined}
          onClick={resend}
        >
          {cooling ? (
            <>
              Resend code in <span className="font-mono tabular-nums">{countdownClock(wait)}</span>
            </>
          ) : (
            'Resend code'
          )}
        </Button>
        {notice && <p className="text-center text-[13px] text-muted">{notice}</p>}
        <Button
          variant="ghost"
          className="touch-target text-muted hover:text-ink"
          // Not mid-send either: leaving now would let the same address be asked
          // again before this send is recorded.
          disabled={verifying || resending}
          onClick={onChangeEmail}
        >
          Use a different email
        </Button>
      </div>

      <p role="status" className="sr-only">
        {verifying ? 'Checking the code…' : (notice ?? '')}
      </p>
    </form>
  );
}
