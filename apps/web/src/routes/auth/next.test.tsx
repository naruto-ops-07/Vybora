import type * as Api from '@vybora/api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import AuthCallback from './AuthCallback';
import Login from './Login';
import { rememberNext, safeNext, takeRememberedNext, withNext } from './next';
import Signup from './Signup';

const api = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  isUsernameAvailable: vi.fn(),
  resendConfirmation: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

const NEXT = '/friends?add=maya';
const NEXT_PARAM = encodeURIComponent(NEXT);

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route },
  );
}

async function fillSignup() {
  await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
  await userEvent.type(screen.getByLabelText('Username'), 'fresh.face');
  await userEvent.type(screen.getByLabelText('Display name'), 'Fresh');
  await userEvent.type(screen.getByLabelText('Password'), 'letters123');
  expect(await screen.findByText('Available')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(auth).forEach((f) => f.mockReset());
  api.isUsernameAvailable.mockResolvedValue(true);
});
afterEach(() => localStorage.clear());

describe('next, from login to signup and back', () => {
  it('carries the destination on Login’s "Create an account" link', () => {
    renderAt(`/login?next=${NEXT_PARAM}`);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      `/signup?next=${NEXT_PARAM}`,
    );
  });

  it('leaves the link plain without a destination, or with an unsafe one', () => {
    renderAt(`/login?next=${encodeURIComponent('//evil.example')}`);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('signs straight in to the destination when no confirmation is needed', async () => {
    api.signUp.mockResolvedValue({ status: 'signed_in' });
    renderAt(`/signup?next=${NEXT_PARAM}`);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/login?next=${NEXT_PARAM}`,
    );
    await fillSignup();
    expect(await screen.findByTestId('where')).toHaveTextContent(NEXT);
  });

  it('after an emailed confirmation, the callback goes to the destination', async () => {
    api.signUp.mockResolvedValue({ status: 'confirm_email' });
    const view = renderAt(`/signup?next=${NEXT_PARAM}`);
    await fillSignup();
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    view.unmount();

    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    renderAt('/auth/callback');
    expect(await screen.findByTestId('where')).toHaveTextContent(NEXT);
    // Used once: a later confirmation goes to the default.
    expect(takeRememberedNext()).toBe('/messages');
  });

  it('without a destination, both paths go to messages', async () => {
    api.signUp.mockResolvedValue({ status: 'signed_in' });
    renderAt('/signup');
    await fillSignup();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/messages'));
  });
});

describe('next helpers', () => {
  it('rejects anything a browser could read as another origin', () => {
    expect(safeNext('/friends?add=maya')).toBe('/friends?add=maya');
    expect(safeNext('//evil.example')).toBe('/messages');
    expect(safeNext('/\\evil.example')).toBe('/messages');
    expect(safeNext('https://evil.example')).toBe('/messages');
    expect(safeNext(undefined)).toBe('/messages');
  });

  it('adds next only when it means something', () => {
    expect(withNext('/signup', '/messages')).toBe('/signup');
    expect(withNext('/signup', null)).toBe('/signup');
    expect(withNext('/signup', '/friends')).toBe('/signup?next=%2Ffriends');
  });

  it('forgets a remembered destination after a day', () => {
    rememberNext('/friends');
    const later = Date.now() + 25 * 60 * 60 * 1000;
    expect(takeRememberedNext(later)).toBe('/messages');
  });
});
