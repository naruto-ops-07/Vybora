import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { themes } from '@vybora/config';
import { resetCodeCooldowns } from '@vybora/core';
import * as Haptics from 'expo-haptics';
import { StyleSheet, TextInput } from 'react-native';

const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockUsernameAvailable = jest.fn();
const mockSendSignInCode = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockResendConfirmation = jest.fn();
const mockPush = jest.fn();

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  signUp: (...a: unknown[]) => mockSignUp(...a),
  signIn: (...a: unknown[]) => mockSignIn(...a),
  isUsernameAvailable: (...a: unknown[]) => mockUsernameAvailable(...a),
  sendSignInCode: (...a: unknown[]) => mockSendSignInCode(...a),
  verifyEmailCode: (...a: unknown[]) => mockVerifyEmailCode(...a),
  resendConfirmation: (...a: unknown[]) => mockResendConfirmation(...a),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Link: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    router: { push: (...a: unknown[]) => mockPush(...a) },
  };
});
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `vybora://${path.replace(/^\//, '')}`,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

import Login from '@/app/(auth)/login';
import Signup from '@/app/(auth)/signup';

const WRONG_CODE = 'That code didn’t work. Check it or send a new one.';
const NEUTRAL_SENT = 'If there’s an account for that email, we’ve sent a code.';
const CALLBACK = 'vybora://auth/callback';
const EMAIL_LIMIT = 'Too many emails were sent just now. Wait a few minutes, then try again.';

/** Every TextInput shares one mocked `focus`; its `this` says which field was focused. */
const focusMock = (TextInput as unknown as { prototype: { focus: jest.Mock } }).prototype.focus;
const focusedLabels = () =>
  focusMock.mock.contexts.map(
    (c) => (c as { props: { accessibilityLabel?: string } }).props.accessibilityLabel,
  );

const codeInput = () => screen.getByLabelText('Verification code');
/** The six boxes are drawn for sight only (hidden from screen readers): read them directly. */
const boxDigits = () =>
  Array.from({ length: 6 }, (_, i) => {
    const children = screen.getByTestId(`code-box-${i}`, { includeHiddenElements: true }).children;
    return children
      .map((c) => (typeof c === 'string' ? c : c.children.join('')))
      .join('')
      .trim();
  });
const resendButton = () => screen.getByRole('button', { name: /^Resend code/ });
const header = (name: string) => screen.findByRole('header', { name });

/**
 * The `onPress` a button was last rendered with, found the way fireEvent finds
 * it (up the fiber from the host view). Calling it twice inside one act() is a
 * double tap that lands before React re-renders; separate fireEvent calls each
 * re-render in between, and nesting them in one act() overlaps act scopes.
 */
function renderedOnPress(element: unknown): () => unknown {
  type Fiber = { memoizedProps?: { onPress?: unknown } | null; return: Fiber | null };
  let fiber = (element as { unstable_fiber?: Fiber }).unstable_fiber ?? null;
  for (; fiber; fiber = fiber.return) {
    const onPress = fiber.memoizedProps?.onPress;
    if (typeof onPress === 'function') return onPress as () => unknown;
  }
  throw new Error('No onPress handler on this element');
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function fillSignup(email = 'new@example.com') {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Username'), 'fresh.face');
  await fireEvent.changeText(screen.getByLabelText('Display name'), 'Fresh');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'letters123');
  expect(await screen.findByText('Available')).toBeTruthy();
}

async function signUpToCode() {
  mockSignUp.mockResolvedValue({ status: 'confirm_email' });
  await render(<Signup />);
  await fillSignup();
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(await header('Enter the code')).toBeTruthy();
}

async function requestSignInCode(email: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a code instead' }));
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  expect(await header('Enter the code')).toBeTruthy();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsernameAvailable.mockResolvedValue(true);
  mockSendSignInCode.mockResolvedValue(undefined);
  mockResendConfirmation.mockResolvedValue(undefined);
  resetCodeCooldowns();
});
afterEach(() => jest.useRealTimers());

describe('code step at sign-up', () => {
  it('verifies a sign-up code typed or pasted with spaces', async () => {
    mockVerifyEmailCode.mockResolvedValue(undefined);
    await signUpToCode();

    expect(screen.getByText('We sent a 6-digit code to new@example.com.')).toBeTruthy();
    expect(
      screen.getByText('You can also open the link in the email on this device.'),
    ).toBeTruthy();
    const input = codeInput();
    expect(input).toHaveProp('keyboardType', 'number-pad');
    expect(input).toHaveProp('textContentType', 'oneTimeCode');
    expect(input).toHaveProp('autoComplete', 'one-time-code');
    expect(input).toHaveProp('autoFocus', true);
    expect(boxDigits()).toEqual(['', '', '', '', '', '']);

    await fireEvent.changeText(input, '123 456');

    await waitFor(() => expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1));
    expect(mockVerifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
      email: 'new@example.com',
      code: '123456',
      purpose: 'signup',
    });
    expect(boxDigits()).toEqual(['1', '2', '3', '4', '5', '6']);
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('light'));
    // Signed in: the auth layout takes over, so the step stays busy rather than flashing back.
    expect(screen.getByRole('button', { name: 'Verify' })).toBeBusy();
  });

  it('sends exactly one verify for auto-submit plus a Verify press', async () => {
    let finish!: () => void;
    mockVerifyEmailCode.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await signUpToCode();
    const typeCode = codeInput().props.onChangeText as (text: string) => void;
    const tapVerify = renderedOnPress(screen.getByRole('button', { name: 'Verify' }));

    // The sixth digit and two fast taps, all before React renders the busy state.
    await act(async () => {
      typeCode('123456');
      tapVerify();
      tapVerify();
    });
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Enter all 6 digits.')).toBeNull();
    // Once busy, Verify can't be pressed again.
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    // Typing while the check runs changes nothing.
    await fireEvent.changeText(codeInput(), '9');
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1);
    expect(codeInput()).toHaveDisplayValue('123456');

    await act(async () => finish());
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1);
  });

  it('shows the wrong-code message and clears the field', async () => {
    mockVerifyEmailCode.mockRejectedValue({
      code: 'otp_expired',
      message: 'Token has expired or is invalid',
    });
    await signUpToCode();
    focusMock.mockClear();

    await fireEvent.changeText(codeInput(), '654321');

    expect(await screen.findByText(WRONG_CODE)).toBeTruthy();
    expect(codeInput()).toHaveDisplayValue('');
    expect(boxDigits()).toEqual(['', '', '', '', '', '']);
    expect(focusedLabels()).toContain('Verification code');
    // Still the same step, for the same address.
    expect(screen.getByRole('header', { name: 'Enter the code' })).toBeTruthy();
    expect(screen.getByText('We sent a 6-digit code to new@example.com.')).toBeTruthy();
    expect(Haptics.impactAsync).not.toHaveBeenCalledWith('light');
    expect(screen.getByRole('button', { name: 'Verify' })).not.toBeBusy();

    // Typing again starts over without the old message hanging around.
    await fireEvent.changeText(codeInput(), '1');
    expect(screen.queryByText(WRONG_CODE)).toBeNull();
    expect(boxDigits()[0]).toBe('1');
  });

  it('draws the focus, filled, error and success states on the boxes', async () => {
    const ui = themes.light;
    const box = (i: number) => screen.getByTestId(`code-box-${i}`, { includeHiddenElements: true });
    let fail!: (reason: unknown) => void;
    mockVerifyEmailCode.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    await signUpToCode();

    await fireEvent(codeInput(), 'focus');
    expect(box(0)).toHaveStyle({ borderColor: ui.accent, borderWidth: 2 });
    expect(box(1)).toHaveStyle({ borderColor: ui.borderStrong, borderWidth: 1 });

    await fireEvent.changeText(codeInput(), '12');
    expect(box(0)).toHaveStyle({ borderColor: ui.textSubtle, borderWidth: 1 });
    expect(box(2)).toHaveStyle({ borderColor: ui.accent, borderWidth: 2 });

    // While checking, no box claims the next digit.
    await fireEvent.changeText(codeInput(), '123456');
    expect(box(5)).toHaveStyle({ borderColor: ui.textSubtle, borderWidth: 1 });
    await act(async () => fail({ code: 'otp_expired' }));
    expect(await screen.findByText(WRONG_CODE)).toBeTruthy();
    for (let i = 0; i < 6; i++) expect(box(i)).toHaveStyle({ borderColor: ui.danger });

    await fireEvent(codeInput(), 'blur');
    expect(box(0)).toHaveStyle({ borderWidth: 1 });

    mockVerifyEmailCode.mockResolvedValueOnce(undefined);
    await fireEvent.changeText(codeInput(), '123456');
    await waitFor(() => expect(box(0)).toHaveStyle({ borderColor: ui.success }));
  });

  it('sizes the boxes for large text instead of clipping the digits', async () => {
    await signUpToCode();
    await fireEvent.changeText(codeInput(), '12');

    const styles = Array.from({ length: 6 }, (_, i) =>
      StyleSheet.flatten(
        screen.getByTestId(`code-box-${i}`, { includeHiddenElements: true }).props.style,
      ),
    );
    for (const style of styles) {
      // A minimum, never a fixed height: a box grows rather than cutting off its digit.
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
    }
    // React Native's Jest preset reports a system font scale of 2: every box,
    // empty or filled, starts with room for a 24 pt digit at twice its size.
    expect(new Set(styles.map((s) => s.minHeight)).size).toBe(1);
    expect(styles[0]?.minHeight).toBeGreaterThan(24 * 2 * 1.2);
    // Past twice its size a digit would no longer fit a box's width.
    expect(screen.getByText('1', { includeHiddenElements: true })).toHaveProp(
      'maxFontSizeMultiplier',
      2,
    );
  });

  it('asks for every digit before checking', async () => {
    await signUpToCode();
    await fireEvent.changeText(codeInput(), '12');
    focusMock.mockClear();

    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Enter all 6 digits.')).toBeTruthy();
    expect(mockVerifyEmailCode).not.toHaveBeenCalled();
    expect(focusedLabels()).toContain('Verification code');
    expect(boxDigits()).toEqual(['1', '2', '', '', '', '']);
  });

  it('counts down before resend', async () => {
    jest.useFakeTimers();
    await signUpToCode();

    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
    await advance(1000);
    expect(resendButton()).toHaveTextContent('Resend code in 0:59');
    expect(resendButton()).toHaveAccessibleName('Resend code in 59 seconds');
    expect(resendButton()).toBeDisabled();
    await fireEvent.press(resendButton());
    expect(mockResendConfirmation).not.toHaveBeenCalled();

    await advance(59_000);
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent(/^Resend code$/);

    await fireEvent.press(resendButton());
    await waitFor(() => expect(mockResendConfirmation).toHaveBeenCalledTimes(1));
    expect(mockResendConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      'new@example.com',
      CALLBACK,
    );
    // A fresh send starts a fresh wait.
    expect(await screen.findByText('We sent a new code.')).toBeTruthy();
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
    expect(resendButton()).toBeDisabled();
  });

  it('holds "Use a different email" while a new code is being sent', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    mockResendConfirmation.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await signUpToCode();
    await advance(60_000);

    await fireEvent.press(resendButton());
    expect(resendButton()).toBeBusy();
    const different = screen.getByRole('button', { name: 'Use a different email' });
    expect(different).toBeDisabled();
    await fireEvent.press(different);
    expect(screen.getByRole('header', { name: 'Enter the code' })).toBeTruthy();

    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Use a different email' })).toBeEnabled();
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
    expect(mockResendConfirmation).toHaveBeenCalledTimes(1);
  });

  it('sends one sign-up at a time', async () => {
    let finish!: (result: unknown) => void;
    mockSignUp.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<Signup />);
    await fillSignup();
    const tapCreate = renderedOnPress(screen.getByRole('button', { name: 'Create account' }));

    // Two fast taps, both before React renders the busy state.
    let first!: unknown;
    await act(async () => {
      first = tapCreate();
      void tapCreate();
    });
    expect(mockSignUp).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ status: 'confirm_email' });
      await first;
    });
    expect(await header('Enter the code')).toBeTruthy();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('shows a failed resend and lets you try again', async () => {
    jest.useFakeTimers();
    mockResendConfirmation.mockRejectedValue({ status: 429, code: 'over_email_send_rate_limit' });
    await signUpToCode();
    await advance(60_000);

    await fireEvent.press(resendButton());

    expect(await screen.findByText(EMAIL_LIMIT)).toBeTruthy();
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent(/^Resend code$/);
  });

  it('returns to the form with the email kept, and the same address keeps its wait', async () => {
    jest.useFakeTimers();
    await signUpToCode();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(codeInput(), '12');
    await advance(20_000);

    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));

    expect(await header('Create your account')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('new@example.com');
    expect(screen.getByLabelText('Email')).toHaveProp('autoFocus', true);
    // The username is held by the unconfirmed account, and a password is never kept.
    expect(screen.getByLabelText('Username')).toHaveDisplayValue('');
    expect(screen.getByLabelText('Password')).toHaveDisplayValue('');

    // The same address within the minute: no second sign-up, and the wait carries on.
    await fillSignup();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await header('Enter the code')).toBeTruthy();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(resendButton()).toHaveTextContent(/^Resend code in 0:[34]\d$/);
    expect(resendButton()).toBeDisabled();
    expect(codeInput()).toHaveDisplayValue('');

    // A different address has its own clock.
    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    await fillSignup('other@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await header('Enter the code')).toBeTruthy();
    expect(mockSignUp).toHaveBeenCalledTimes(2);
    expect(screen.getByText('We sent a 6-digit code to other@example.com.')).toBeTruthy();
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
  });

  it('leaves the email field alone while sign-up is sending and after it fails', async () => {
    let fail!: (reason: unknown) => void;
    mockSignUp.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await render(<Signup />);
    await fillSignup();
    const email = screen.getByLabelText('Email');
    focusMock.mockClear();

    // fireEvent resolves with the handler's own promise, which waits on sign-up.
    const pressing = fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Create account' })).toBeBusy();
    expect(focusedLabels()).not.toContain('Email');
    await act(async () =>
      fail({
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      }),
    );
    await pressing;
    expect(await screen.findByText(EMAIL_LIMIT)).toBeTruthy();

    expect(screen.queryByRole('header', { name: 'Create your account' })).toBeTruthy();
    // Same field (a remount would re-run autoFocus), never focused or selected.
    expect(screen.getByLabelText('Email')).toBe(email);
    expect(focusedLabels()).not.toContain('Email');
    expect(email).not.toHaveProp('autoFocus', true);
    expect(email.props.selection).toBeUndefined();
    expect(email).toHaveDisplayValue('new@example.com');
  });

  it('offers code or password sign-in for an existing email', async () => {
    mockSignUp.mockResolvedValue({ status: 'already_registered' });
    const view = await render(<Signup />);
    await fillSignup();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await header('That email already has an account')).toBeTruthy();
    expect(screen.getByText('Sign in as new@example.com instead.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in with a code' }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/login');
    // The address travels in memory, never in a route or URL.
    expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/new|example|%40|@/);
    await view.unmount();

    await render(<Login />);
    expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('new@example.com');
    expect(screen.queryByLabelText('Password')).toBeNull();
    // Arriving in code mode sends nothing by itself.
    expect(mockSendSignInCode).not.toHaveBeenCalled();
    await screen.unmount();

    await render(<Signup />);
    await fillSignup();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in with password' }));
    expect(mockPush).toHaveBeenLastCalledWith('/login');
    await screen.unmount();

    await render(<Login />);
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('new@example.com');
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
    await screen.unmount();

    // The handoff is spent: a later visit starts empty.
    await render(<Login />);
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('');
  });
});

describe('sign in by code', () => {
  it('signs in by code with the neutral message', async () => {
    mockVerifyEmailCode.mockResolvedValue(undefined);
    await render(<Login />);
    // Password stays the default.
    expect(screen.getByLabelText('Password')).toBeTruthy();

    await requestSignInCode(' Nobody@Example.com ');

    expect(screen.getByText(NEUTRAL_SENT)).toBeTruthy();
    expect(screen.getByText('Signing in as nobody@example.com')).toBeTruthy();
    expect(mockSendSignInCode).toHaveBeenCalledWith(
      expect.anything(),
      'nobody@example.com',
      CALLBACK,
    );
    expect(screen.queryByText(WRONG_CODE)).toBeNull();
    expect(codeInput()).toBeTruthy();

    await fireEvent.changeText(codeInput(), '123456');
    await waitFor(() =>
      expect(mockVerifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
        email: 'nobody@example.com',
        code: '123456',
        purpose: 'signin',
      }),
    );
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('light'));
  });

  it('switches between password and code sign-in, keeping the email', async () => {
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
    const email = screen.getByLabelText('Email');

    await fireEvent.press(screen.getByRole('button', { name: 'Email me a code instead' }));
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('We’ll email you a 6-digit code to sign in.')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('maya@example.com');
    // The same field throughout: switching never remounts or refocuses it.
    expect(screen.getByLabelText('Email')).toBe(email);

    await fireEvent.press(screen.getByRole('button', { name: 'Use password instead' }));
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('maya@example.com');
    expect(mockSendSignInCode).not.toHaveBeenCalled();
  });

  it('fills all six boxes from a code pasted beside digits, with a dash or extra text', async () => {
    mockVerifyEmailCode.mockReturnValue(new Promise<void>(() => {}));
    await render(<Login />);
    await requestSignInCode('maya@example.com');
    // No native length cap: maxLength would cut "123 456" to "123 45" before we saw it.
    expect(codeInput().props.maxLength).toBeUndefined();

    await fireEvent.changeText(codeInput(), '12');
    expect(boxDigits()).toEqual(['1', '2', '', '', '', '']);
    await fireEvent.changeText(codeInput(), '12Your VYBORA code: 123-456.');

    expect(boxDigits()).toEqual(['1', '2', '3', '4', '5', '6']);
    await waitFor(() => expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1));
    expect(mockVerifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
      email: 'maya@example.com',
      code: '123456',
      purpose: 'signin',
    });
  });

  it('keeps the send wait with the email, not the screen', async () => {
    jest.useFakeTimers();
    await render(<Login />);
    await requestSignInCode('maya@example.com');
    expect(mockSendSignInCode).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(codeInput(), '12');
    await advance(20_000);

    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(await header('Sign in')).toBeTruthy();
    expect(screen.queryByLabelText('Verification code')).toBeNull();
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('maya@example.com');
    expect(screen.getByLabelText('Email')).toHaveProp('autoFocus', true);

    // The same address again within the minute: no new email, and the wait carries on.
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await header('Enter the code')).toBeTruthy();
    expect(mockSendSignInCode).toHaveBeenCalledTimes(1);
    expect(resendButton()).toHaveTextContent('Resend code in 0:40');
    expect(resendButton()).toBeDisabled();
    expect(codeInput()).toHaveDisplayValue('');

    // A different address sends straight away, on its own clock.
    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'other@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await header('Enter the code')).toBeTruthy();
    expect(mockSendSignInCode).toHaveBeenCalledTimes(2);
    expect(mockSendSignInCode).toHaveBeenLastCalledWith(
      expect.anything(),
      'other@example.com',
      CALLBACK,
    );
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');

    // Resending a sign-in code keeps the message neutral.
    await advance(60_000);
    await fireEvent.press(resendButton());
    expect(
      await screen.findByText('If there’s an account for that email, we’ve sent a new code.'),
    ).toBeTruthy();
    expect(mockSendSignInCode).toHaveBeenCalledTimes(3);
  });

  it('sends one code request at a time, from the button or the keyboard', async () => {
    let finish!: () => void;
    mockSendSignInCode
      .mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
      // Supabase's per-user limit would turn a second send for a real account into a 429.
      .mockRejectedValue({ status: 429, code: 'over_email_send_rate_limit' });
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a code instead' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');

    // fireEvent resolves with the handler's own promise, which waits on the send.
    const pressing = fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(mockSendSignInCode).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeBusy();
    // A tap leaves the keyboard up, so its Send key still reaches the field.
    await fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    expect(mockSendSignInCode).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await pressing;
    expect(await header('Enter the code')).toBeTruthy();
    expect(screen.queryByText(EMAIL_LIMIT)).toBeNull();

    // Nothing stale is waiting on the form either.
    await fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));
    expect(await header('Sign in')).toBeTruthy();
    expect(screen.queryByText(EMAIL_LIMIT)).toBeNull();
    expect(mockSendSignInCode).toHaveBeenCalledTimes(1);
  });

  it('shows a send failure on the form and stays there', async () => {
    mockSendSignInCode.mockRejectedValue({ status: 429, code: 'over_email_send_rate_limit' });
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a code instead' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText(EMAIL_LIMIT)).toBeTruthy();
    expect(screen.queryByLabelText('Verification code')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy();
  });

  it('checks the email before asking for a code', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a code instead' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(mockSendSignInCode).not.toHaveBeenCalled();
  });
});
