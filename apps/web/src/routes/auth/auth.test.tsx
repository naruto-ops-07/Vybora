import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { safeNext } from './Login';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

describe('LoginForm', () => {
  it('validates fields before calling the server', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits normalized credentials', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), '  Maya@Example.COM ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: 'maya@example.com', password: 'secret123' }),
    );
  });

  it('shows a friendly message for invalid credentials', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ message: 'Invalid login credentials' });
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), 'maya@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });
});

describe('SignupForm', () => {
  it('checks username availability and blocks taken names', async () => {
    const checkUsername = vi.fn().mockResolvedValue(false);
    const onSubmit = vi.fn();
    renderWithProviders(<SignupForm onSubmit={onSubmit} checkUsername={checkUsername} />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Username'), 'taken.name');
    await waitFor(() => expect(checkUsername).toHaveBeenCalledWith('taken.name'));
    expect(await screen.findByText('That username is taken')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password'), 'letters123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects weak passwords and reserved usernames', async () => {
    renderWithProviders(
      <SignupForm onSubmit={vi.fn()} checkUsername={vi.fn().mockResolvedValue(true)} />,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Username'), 'admin');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This username is reserved')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
  });

  it('submits valid input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <SignupForm onSubmit={onSubmit} checkUsername={vi.fn().mockResolvedValue(true)} />,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Username'), 'Fresh.Face');
    await userEvent.type(screen.getByLabelText('Password'), 'letters123');
    expect(await screen.findByText('Available')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'fresh.face', email: 'new@example.com' }),
      ),
    );
  });
});

describe('safeNext', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNext('/messages')).toBe('/messages');
    expect(safeNext('//evil.example')).toBe('/messages');
    expect(safeNext('https://evil.example')).toBe('/messages');
    expect(safeNext(null)).toBe('/messages');
  });
});
