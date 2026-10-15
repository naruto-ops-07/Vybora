import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  signIn: (...a: unknown[]) => mockSignIn(...a),
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
  };
});

import Login from '@/app/(auth)/login';

describe('Login screen', () => {
  beforeEach(() => mockSignIn.mockReset());

  it('validates before calling the server', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signs in with normalized credentials', async () => {
    mockSignIn.mockResolvedValue({});
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Email'), ' Maya@Example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), {
        email: 'maya@example.com',
        password: 'secret123',
      }),
    );
  });

  it('shows a friendly error for bad credentials', async () => {
    mockSignIn.mockRejectedValue({ message: 'Invalid login credentials' });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maya@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-pass1');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
  });
});
