import type * as Api from '@vybora/api';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import PrivacyPage from './PrivacyPage';

const api = vi.hoisted(() => ({
  fetchConnectPrivacy: vi.fn(),
  updateConnectPrivacy: vi.fn(),
  fetchBlocked: vi.fn(),
  fetchMyContactMethod: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/features/auth/AuthProvider', () => ({ useMe: () => ({ userId: 'me' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('./ConnectProvider', () => ({
  useConnect: () => ({ engine: null, backend: 'native', signOutAndWipe: vi.fn() }),
}));

const settings = (message_privacy: string) => ({
  notifications_enabled: true,
  read_receipts: true,
  typing_indicators: true,
  show_online: true,
  message_previews: true,
  message_privacy,
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchBlocked.mockResolvedValue([]);
  api.fetchMyContactMethod.mockResolvedValue(null);
  api.updateConnectPrivacy.mockResolvedValue(undefined);
});

const group = () => screen.findByRole('radiogroup', { name: 'Who can start chats with me' });

describe('who can start chats with me', () => {
  it('is always shown, defaults to Everyone, and switches to Friends only at once', async () => {
    api.fetchConnectPrivacy.mockResolvedValue(settings('everyone'));
    renderWithProviders(<PrivacyPage />);
    const g = await group();
    await waitFor(() =>
      expect(within(g).getByRole('radio', { name: 'Everyone' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    api.fetchConnectPrivacy.mockResolvedValue(settings('friends'));
    await userEvent.click(within(g).getByRole('radio', { name: 'Friends only' }));
    expect(api.updateConnectPrivacy).toHaveBeenCalledWith({}, 'me', { message_privacy: 'friends' });
    expect(within(g).getByRole('radio', { name: 'Friends only' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Allow everyone' })).toBeNull();
  });

  it('keeps the legacy following explanation and reset only while that value is set', async () => {
    api.fetchConnectPrivacy.mockResolvedValue(settings('following'));
    renderWithProviders(<PrivacyPage />);
    const g = await group();
    expect(await screen.findByText(/people you followed before/)).toBeInTheDocument();
    for (const r of within(g).getAllByRole('radio'))
      expect(r).toHaveAttribute('aria-checked', 'false');
    api.fetchConnectPrivacy.mockResolvedValue(settings('everyone'));
    await userEvent.click(screen.getByRole('button', { name: 'Allow everyone' }));
    expect(api.updateConnectPrivacy).toHaveBeenCalledWith({}, 'me', {
      message_privacy: 'everyone',
    });
    await waitFor(() => expect(screen.queryByText(/people you followed before/)).toBeNull());
  });

  it('rolls back and explains when saving fails', async () => {
    api.fetchConnectPrivacy.mockResolvedValue(settings('everyone'));
    api.updateConnectPrivacy.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithProviders(<PrivacyPage />);
    const g = await group();
    await waitFor(() =>
      expect(within(g).getByRole('radio', { name: 'Everyone' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    await userEvent.click(within(g).getByRole('radio', { name: 'Friends only' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(within(g).getByRole('radio', { name: 'Everyone' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
