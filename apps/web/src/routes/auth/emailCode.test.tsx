import type * as Api from '@vybora/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { resetCodeCooldowns } from './codeCooldown';
import Login from './Login';
import Signup from './Signup';

const api = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  isUsernameAvailable: vi.fn(),
  resendConfirmation: vi.fn(),
  sendSignInCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));

const NEXT = '/friends?add=maya';
const WRONG_CODE = 'That code didn’t work. Check it or send a new one.';
const NEUTRAL_SENT = 'If there’s an account for that email, we’ve sent a code.';

type User = ReturnType<typeof userEvent.setup>;

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

/** The address bar, on every page: the email must never show up in it. */
function Url() {
  const l = useLocation();
  return <p data-testid="url">{l.pathname + l.search + l.hash}</p>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Where />} />
      </Routes>
      <Url />
    </>,
    { route },
  );
}

const codeGroup = () => screen.getByRole('group', { name: 'Verification code' });
const boxes = () => within(codeGroup()).getAllByRole('textbox') as HTMLInputElement[];
function box(i: number): HTMLInputElement {
  const el = boxes()[i];
  if (!el) throw new Error(`No code box ${i}`);
  return el;
}
const resendButton = () => screen.getByRole('button', { name: /^Resend code/ });

async function fillSignup(user: User = userEvent.setup()) {
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Username'), 'fresh.face');
  await user.type(screen.getByLabelText('Display name'), 'Fresh');
  await user.type(screen.getByLabelText('Password'), 'letters123');
  expect(await screen.findByText('Available')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

async function signUpToCode(user: User = userEvent.setup(), route = '/signup') {
  api.signUp.mockResolvedValue({ status: 'confirm_email' });
  renderAt(route);
  await fillSignup(user);
  expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
}

async function requestSignInCode(user: User, email: string) {
  await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
  await user.clear(screen.getByLabelText('Email'));
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.isUsernameAvailable.mockResolvedValue(true);
  api.sendSignInCode.mockResolvedValue(undefined);
  api.resendConfirmation.mockResolvedValue(undefined);
  resetCodeCooldowns();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('code step at sign-up', () => {
  it('verifies a sign-up with the emailed code and continues to next', async () => {
    api.verifyEmailCode.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await signUpToCode(user, `/signup?next=${encodeURIComponent(NEXT)}`);

    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(
      screen.getByText('You can also open the link in the email on this device.'),
    ).toBeInTheDocument();
    const first = box(0);
    expect(boxes()).toHaveLength(6);
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    expect(first).toHaveAttribute('inputmode', 'numeric');

    await user.click(first);
    await user.paste('123 456');

    await waitFor(() => expect(api.verifyEmailCode).toHaveBeenCalledTimes(1));
    expect(api.verifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
      email: 'new@example.com',
      code: '123456',
      purpose: 'signup',
    });
    expect(await screen.findByTestId('where')).toHaveTextContent(NEXT);
    // The code finished the sign-up here, so the link's remembered destination is spent.
    expect(localStorage.getItem('vybora.auth.next')).toBeNull();
  });

  it('sends exactly one verify for auto-submit plus a Verify click', async () => {
    let finish!: () => void;
    api.verifyEmailCode.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await signUpToCode(user);

    await user.type(box(0), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    // A second submit racing in before the button re-renders as busy.
    fireEvent.submit(codeGroup().closest('form')!);
    expect(api.verifyEmailCode).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(await screen.findByTestId('where')).toHaveTextContent('/messages');
    expect(api.verifyEmailCode).toHaveBeenCalledTimes(1);
  });

  it('shows the wrong-code message, clears the boxes and keeps the email', async () => {
    api.verifyEmailCode.mockRejectedValue({
      code: 'otp_expired',
      message: 'Token has expired or is invalid',
    });
    const user = userEvent.setup();
    await signUpToCode(user);

    await user.type(box(0), '654321');

    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_CODE);
    for (const box of boxes()) expect(box).toHaveValue('');
    expect(box(0)).toHaveFocus();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    // Typing again starts over without the old message hanging around.
    await user.keyboard('1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('counts down before resend is allowed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await signUpToCode(user);

    expect(resendButton()).toBeDisabled();
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(resendButton()).toHaveTextContent('Resend code in 0:59');
    expect(resendButton()).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent(/^Resend code$/);

    await user.click(resendButton());
    await waitFor(() => expect(api.resendConfirmation).toHaveBeenCalledTimes(1));
    expect(api.resendConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      'new@example.com',
      expect.stringMatching(/\/auth\/callback$/),
    );
    // A fresh send starts a fresh wait, and the boxes are ready for the new code.
    expect(await screen.findByRole('button', { name: 'Resend code in 1:00' })).toBeDisabled();
    expect(box(0)).toHaveFocus();
  });

  it('returns to the sign-up form with the email kept when using a different email', async () => {
    const user = userEvent.setup();
    await signUpToCode(user);

    await user.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('offers code or password sign-in for an existing email', async () => {
    api.signUp.mockResolvedValue({ status: 'already_registered' });
    const user = userEvent.setup();
    const view = renderAt(`/signup?next=${encodeURIComponent(NEXT)}`);
    await fillSignup(user);

    expect(
      await screen.findByRole('heading', { name: 'That email already has an account' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Sign in with a code' }));

    expect(await screen.findByRole('button', { name: 'Send code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent(`/login?next=${encodeURIComponent(NEXT)}`);
    expect(screen.getByTestId('url').textContent).not.toMatch(/new|example|%40|@/);
    // Arriving in code mode doesn't send anything by itself.
    expect(api.sendSignInCode).not.toHaveBeenCalled();
    view.unmount();

    renderAt('/signup');
    await fillSignup(user);
    await user.click(await screen.findByRole('link', { name: 'Sign in with password' }));

    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/login$/);
  });
});

describe('sign in by code', () => {
  it('signs in by code and shows the same message whether or not an account exists', async () => {
    api.verifyEmailCode.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt('/login');

    await requestSignInCode(user, 'nobody@example.com');

    expect(screen.getByText(NEUTRAL_SENT)).toBeInTheDocument();
    expect(boxes()).toHaveLength(6);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.sendSignInCode).toHaveBeenCalledWith(
      expect.anything(),
      'nobody@example.com',
      expect.stringMatching(/\/auth\/callback$/),
    );
    expect(screen.getByTestId('url').textContent).not.toMatch(/nobody|example|@/);

    await user.paste('123456');
    await waitFor(() =>
      expect(api.verifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
        email: 'nobody@example.com',
        code: '123456',
        purpose: 'signin',
      }),
    );
    expect(await screen.findByTestId('where')).toHaveTextContent('/messages');
  });

  it('switches between password and code sign-in, keeping the email', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(screen.getByLabelText('Email'), 'maya@example.com');

    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com');
    expect(screen.getByLabelText('Email')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Use password instead' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com');
    expect(api.sendSignInCode).not.toHaveBeenCalled();
  });

  it('fills every box from a code pasted with a dash or extra text, into any box', async () => {
    api.verifyEmailCode.mockReturnValue(new Promise<void>(() => {}));
    const user = userEvent.setup();
    renderAt('/login');
    await requestSignInCode(user, 'maya@example.com');

    await user.click(box(2));
    await user.paste('Your VYBORA code: 123-456.');

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    await waitFor(() => expect(api.verifyEmailCode).toHaveBeenCalledTimes(1));
    expect(api.verifyEmailCode).toHaveBeenCalledWith(expect.anything(), {
      email: 'maya@example.com',
      code: '123456',
      purpose: 'signin',
    });
  });

  it('moves between boxes as you type and backspace, and asks for every digit', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await requestSignInCode(user, 'maya@example.com');

    await user.type(box(0), '12');
    expect(box(2)).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(box(1)).toHaveFocus();
    expect(box(1)).toHaveValue('');
    expect(box(0)).toHaveValue('1');
    await user.keyboard('x');
    expect(box(1)).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter all 6 digits.');
    expect(box(1)).toHaveFocus();
    expect(api.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('goes back to the form with the email kept when using a different email', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await requestSignInCode(user, 'maya@example.com');
    await user.type(box(0), '12');

    await user.click(screen.getByRole('button', { name: 'Use a different email' }));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Verification code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('keeps the send cooldown with the email, not the screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/login');
    await requestSignInCode(user, 'maya@example.com');
    expect(api.sendSignInCode).toHaveBeenCalledTimes(1);
    await user.type(box(0), '12');
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    // The same address again within the minute: no new email, and the wait carries on.
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(api.sendSignInCode).toHaveBeenCalledTimes(1);
    expect(resendButton()).toHaveTextContent('Resend code in 0:40');
    expect(resendButton()).toBeDisabled();
    // The code typed before is gone.
    for (const box of boxes()) expect(box).toHaveValue('');

    // A different address has its own cooldown, so it sends straight away.
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'other@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    expect(api.sendSignInCode).toHaveBeenCalledTimes(2);
    expect(api.sendSignInCode).toHaveBeenLastCalledWith(
      expect.anything(),
      'other@example.com',
      expect.any(String),
    );
    expect(resendButton()).toHaveTextContent('Resend code in 1:00');
  });

  it('shows a send failure on the form and stays there', async () => {
    api.sendSignInCode.mockRejectedValue({ status: 429, code: 'over_email_send_rate_limit' });
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    await user.type(screen.getByLabelText('Email'), 'maya@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries. Wait a minute, then try again.',
    );
    expect(screen.queryByRole('group', { name: 'Verification code' })).not.toBeInTheDocument();
  });
});
