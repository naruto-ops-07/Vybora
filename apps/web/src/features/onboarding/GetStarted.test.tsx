import type * as Api from '@vybora/api';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { GetStarted, GetStartedView } from './GetStarted';
import { allSetThisSession, readOnboarding, resetOnboardingMemory } from './store';

const api = vi.hoisted(() => ({
  fetchFriends: vi.fn(),
  fetchFriendRequests: vi.fn(),
  fetchSecureInbox: vi.fn(),
}));
vi.mock('@vybora/api', async (orig) => ({ ...(await orig<typeof Api>()), ...api }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/auth/AuthProvider', () => {
  const profile = { id: 'me', username: 'maya', display_name: 'Maya', avatar_path: null };
  return {
    useMe: () => ({ userId: 'me', profile }),
    useAuth: () => ({ userId: 'me', profile }),
  };
});

const friend = { userId: 'id-sam', username: 'sam', displayName: null, avatarPath: null };

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchFriends.mockResolvedValue([]);
  api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [] });
  api.fetchSecureInbox.mockResolvedValue([]);
});
afterEach(() => {
  localStorage.clear();
  resetOnboardingMemory();
  allSetThisSession.clear();
});

const steps = (share: boolean, friend: boolean, hi: boolean) => {
  const s = { share, friend, hi };
  const done = Object.values(s).filter(Boolean).length;
  return { steps: s, done, complete: done === 3 };
};

describe('Get started panel (view)', () => {
  const view = (progress = steps(false, false, false)) =>
    renderWithProviders(
      <GetStartedView
        progress={progress}
        handle={<p>handle row</p>}
        username="maya"
        onSayHi={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

  it('is a labelled region with three ordered steps and "0 of 3"', () => {
    view();
    const region = screen.getByRole('region', { name: 'Get started' });
    expect(within(region).getByText(/0 of 3/)).toHaveTextContent('0 of 3 steps done');
    const items = within(within(region).getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual([
      'Share your username',
      'Add a friend',
      'Say hi',
    ]);
    expect(screen.getByText('handle row')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add by username' })).toHaveAttribute(
      'href',
      '/friends',
    );
    expect(screen.getByRole('button', { name: 'New message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide getting started' })).toHaveClass(
      'touch-target',
    );
  });

  it('marks done steps with text, not colour alone, and drops their actions', () => {
    view(steps(true, true, false));
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
    const [share, add, hi] = screen.getAllByRole('listitem');
    expect(share).toHaveTextContent('Share your username. Done');
    expect(add).toHaveTextContent('Add a friend. Done');
    expect(hi).not.toHaveTextContent('Done');
    expect(screen.queryByText('handle row')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add by username' })).toBeNull();
  });

  it('says "You’re all set" at 3 of 3', () => {
    view(steps(true, true, true));
    expect(screen.getByRole('heading', { name: 'You’re all set' })).toBeInTheDocument();
    expect(screen.getByText('Friends can add you any time as @maya.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('Get started panel (rules and storage)', () => {
  const panel = (props: Partial<Parameters<typeof GetStarted>[0]> = {}) =>
    renderWithProviders(<GetStarted previews={{}} previewsReady onSayHi={vi.fn()} {...props} />);

  it('waits for its data instead of flashing 0 of 3', async () => {
    api.fetchFriends.mockReturnValue(new Promise(() => undefined));
    panel();
    await act(() => Promise.resolve());
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  });

  it('counts a friend, an outgoing request and my latest message', async () => {
    api.fetchFriendRequests.mockResolvedValue({ incoming: [], outgoing: [friend] });
    panel({ previews: { c1: { senderId: 'me' } as never } });
    expect(await screen.findByText(/2 of 3/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Done');
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('Done');
  });

  it('hides for good on this device when dismissed, and hands focus on', async () => {
    const onDismissed = vi.fn();
    panel({ onDismissed });
    await userEvent.click(await screen.findByRole('button', { name: 'Hide getting started' }));
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
    expect(onDismissed).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('vybora.onboarding.me')!).dismissed).toBe(true);
  });

  it('shows "You’re all set" once, then never again', async () => {
    localStorage.setItem('vybora.onboarding.me', JSON.stringify({ shared: true }));
    api.fetchFriends.mockResolvedValue([{ ...friend, since: null }]);
    const first = panel({ previews: { c1: { senderId: 'me' } as never } });
    expect(await screen.findByRole('heading', { name: 'You’re all set' })).toBeInTheDocument();
    await waitFor(() => expect(readOnboarding('me').done).toBe(true));
    first.unmount();
    // A new page load: the session memory is gone.
    allSetThisSession.clear();
    resetOnboardingMemory();
    panel({ previews: { c1: { senderId: 'me' } as never } });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('heading', { name: 'You’re all set' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Get started' })).toBeNull();
  });
});
