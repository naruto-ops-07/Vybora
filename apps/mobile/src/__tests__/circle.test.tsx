import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { emptyOnboarding, getStartedProgress, onboardingKey } from '@vybora/core';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { HandleCardView, shareMessage } from '@/features/friends/HandleCard';
import { GetStartedView } from '@/features/onboarding/GetStarted';
import {
  resetOnboardingMemory,
  updateOnboarding,
  useOnboarding,
} from '@/features/onboarding/store';

const mockGet = jest.fn((_key: string) => Promise.resolve<string | null>(null));
const mockSet = jest.fn((_key: string, _value: string) => Promise.resolve());
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => mockGet(k),
  setItemAsync: (k: string, v: string) => mockSet(k, v),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/connect/ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ userId: null, profile: null }),
  useMe: () => ({ userId: 'me', profile: null }),
}));

const me = { id: 'me', username: 'maya.k', display_name: 'Maya K', avatar_path: null };
const progress = (shared: boolean, friends: number, mine: boolean) =>
  getStartedProgress({
    record: { ...emptyOnboarding(), shared },
    friendCount: friends,
    outgoingCount: 0,
    lastSenderIds: mine ? ['me'] : [],
    myUserId: 'me',
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetOnboardingMemory();
  mockGet.mockResolvedValue(null);
});

describe('illustrations', () => {
  it.each([
    ['welcome', WelcomeIllustration],
    ['no-chats', NoChatsIllustration],
    ['no-friends', NoFriendsIllustration],
    ['nothing-found', NothingFoundIllustration],
  ])('%s draws, hidden from screen readers', async (name, Drawing) => {
    await render(<Drawing />);
    const frame = screen.getByTestId(`illustration-${name}`, { includeHiddenElements: true });
    expect(frame.props.accessibilityElementsHidden).toBe(true);
    expect(frame.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('Get started', () => {
  const view = (
    p: ReturnType<typeof progress>,
    extra: Partial<Parameters<typeof GetStartedView>[0]> = {},
  ) => {
    const handlers = { onSayHi: jest.fn(), onAddFriend: jest.fn(), onDismiss: jest.fn() };
    return {
      handlers,
      ui: render(
        <GetStartedView progress={p} handle={null} username="maya.k" {...handlers} {...extra} />,
      ),
    };
  };

  it('counts steps and says which are done in words, not just colour', async () => {
    await view(progress(true, 0, false)).ui;
    expect(screen.getByLabelText('1 of 3 steps done')).toBeTruthy();
    expect(screen.getByLabelText('Share your username. Done')).toBeTruthy();
    expect(screen.getByLabelText('Add a friend')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add by username' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy();
  });

  it('routes its actions and can be hidden', async () => {
    const { handlers, ui } = view(progress(false, 1, false));
    await ui;
    expect(screen.getByLabelText('1 of 3 steps done')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New message' }));
    expect(handlers.onSayHi).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Hide getting started' }));
    expect(handlers.onDismiss).toHaveBeenCalled();
  });

  it('says you’re all set once everything is done', async () => {
    await view(progress(true, 1, true)).ui;
    expect(screen.getByText('You’re all set')).toBeTruthy();
    expect(screen.getByText('Friends can add you any time as @maya.k.')).toBeTruthy();
  });
});

describe('HandleCard', () => {
  it('copies @username, says so, and counts as shared', async () => {
    const onShared = jest.fn();
    await render(
      <HandleCardView
        person={me}
        link="https://example.test/friends?add=maya.k"
        onShared={onShared}
      />,
    );
    expect(screen.getByText('Maya K')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Copy @maya.k' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('@maya.k');
    expect(onShared).toHaveBeenCalledTimes(1);
  });

  it('shares the handle and link; closing the sheet is not a share', async () => {
    const onShared = jest.fn();
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValueOnce({ action: Share.dismissedAction })
      .mockResolvedValueOnce({ action: Share.sharedAction });
    await render(
      <HandleCardView
        person={me}
        link="https://example.test/friends?add=maya.k"
        variant="compact"
        onShared={onShared}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Share a link to add you' });
    await fireEvent.press(btn);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(onShared).not.toHaveBeenCalled();
    await fireEvent.press(btn);
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenLastCalledWith({
      message: 'Add me on VYBORA: @maya.k\nhttps://example.test/friends?add=maya.k',
    });
    share.mockRestore();
  });

  it('without a web address, shares just the handle', () => {
    expect(shareMessage('maya.k', null)).toBe('Add me on VYBORA: @maya.k');
  });
});

describe('onboarding store', () => {
  it('reports loaded only once the stored record is in', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ ...emptyOnboarding(), dismissed: true }));
    const { result } = await renderHook(() => useOnboarding('u0'));
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0].dismissed).toBe(true);
  });

  it('loads the stored record, then merges and saves an update', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ ...emptyOnboarding(), friend: true }));
    await act(() => updateOnboarding('u1', { shared: true }));
    expect(mockGet).toHaveBeenCalledWith(onboardingKey('u1'));
    expect(mockSet).toHaveBeenCalledWith(
      onboardingKey('u1'),
      JSON.stringify({ ...emptyOnboarding(), friend: true, shared: true }),
    );
  });

  it('does not write a patch that changes nothing', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ ...emptyOnboarding(), shared: true }));
    await act(() => updateOnboarding('u2', { shared: true }));
    expect(mockSet).not.toHaveBeenCalled();
  });
});
