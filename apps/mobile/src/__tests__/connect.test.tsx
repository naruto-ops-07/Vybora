import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockTrust = jest.fn();
const mockBack = jest.fn();
const mockKeys = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/lib/connect/appLock', () => ({
  isUnlocked: () => Promise.resolve(true),
  authenticate: () => Promise.resolve(true),
  subscribeAppLock: () => () => undefined,
}));
jest.mock('@/features/connect/ConnectProvider', () => ({
  useConnect: () => ({
    status: 'ready',
    error: null,
    retry: jest.fn(),
    engine: {
      safetyNumberWith: () =>
        Promise.resolve('12345 23456 34567 45678 56789 67890 78901 89012 90123 01234 11111 22222'),
      checkContactKeys: (...a: unknown[]) => mockKeys(...a),
      trustContactKeys: (...a: unknown[]) => mockTrust(...a),
    },
  }),
}));
jest.mock('@/features/connect/hooks', () => ({
  useConversation: () => ({
    data: { members: [{ id: 'u2', username: 'maya', display_name: 'Maya' }] },
  }),
  useNicknames: () => ({ data: {} }),
}));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    router: { back: () => mockBack() },
    Stack,
    useLocalSearchParams: () => ({ userId: 'u2', conversationId: 'c1' }),
  };
});
jest.mock('@/features/connect/ui/Attachment', () => ({
  ImageAttachment: () => null,
  VideoAttachment: () => null,
  VoiceAttachment: () => null,
  FileAttachment: () => null,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

import { Bubble } from '@/features/connect/ui/Bubble';
import { useThemeDef } from '@/features/connect/ui/primitives';
import { themeFor } from '@/lib/theme';
import Verify from '@/app/messages/verify/[userId]';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const base: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 1,
  senderId: 'u1',
  senderDeviceId: 'd1',
  createdAt: '2026-10-09T10:00:00Z',
  expiresAt: null,
  status: 'sent',
  kind: 'text',
  body: 'Hello there',
  reactions: { '❤️': ['u2', 'u3'] },
};

const noop = () => undefined;
const bubble = (
  m: Partial<LocalMessage>,
  extra: { mine?: boolean; receipt?: 'failed' | 'read'; onRetry?: (m: LocalMessage) => void } = {},
) => (
  <Bubble
    message={{ ...base, ...m } as LocalMessage}
    mine={extra.mine ?? true}
    theme={{
      ...resolveChatTheme(null),
      accent: '#0F766E',
      background: '#FFFFFF',
      outgoing: '#0F766E',
      outgoingText: '#FFFFFF',
      fill: {
        gradient: false,
        from: '#0F766E',
        to: '#0F766E',
        text: '#FFFFFF',
        angle: 135,
      },
      incoming: '#EDF2F2',
      incomingText: '#0B1416',
    }}
    receipt={extra.receipt}
    showSender={false}
    runStart
    runEnd
    onLongPress={noop}
    onRetry={extra.onRetry ?? noop}
    onOpenImage={noop}
    nameOf={() => 'Maya'}
  />
);

beforeEach(() => jest.clearAllMocks());

describe('Secure message bubble', () => {
  it('shows text, reactions and read receipts', async () => {
    await render(bubble({}, { receipt: 'read' }));
    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByLabelText('Read')).toBeTruthy();
  });

  it('never renders content for undecryptable messages', async () => {
    await render(bubble({ kind: 'undecryptable', body: 'should not show' }, { mine: false }));
    expect(screen.getByText('This message couldn’t be decrypted on this device.')).toBeTruthy();
    expect(screen.queryByText('should not show')).toBeNull();
  });

  it('offers retry for messages that failed to send', async () => {
    const retry = jest.fn();
    await render(bubble({ status: 'failed' }, { receipt: 'failed', onRetry: retry }));
    await fireEvent.press(screen.getByText('Not sent · Tap to retry'));
    expect(retry).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });
});

describe('chat themes in the looks', () => {
  it('Default takes the look bubble and accent; a named theme keeps its own', async () => {
    const { result: def } = await renderHook(() => useThemeDef({}));
    const light = themeFor('velvet', 'light', false);
    expect(def.current.fill).toEqual(
      expect.objectContaining({ gradient: true, from: light.bubbleOutFrom, to: light.bubbleOutTo }),
    );
    expect(def.current.accent).toBe(light.accent);
    const { result: ocean } = await renderHook(() => useThemeDef({ preset: 'ocean' }));
    expect(ocean.current.fill.gradient).toBe(false);
    expect(ocean.current.outgoing).toBe(resolveChatTheme({ preset: 'ocean' }).bubble);
    expect(ocean.current.accent).toBe(resolveChatTheme({ preset: 'ocean' }).accentLight);
  });
});

describe('Safety number verification', () => {
  it('shows the 60-digit number and marks the contact verified', async () => {
    mockKeys.mockResolvedValue({ status: 'new', verified: false });
    mockTrust.mockResolvedValue(undefined);
    await render(wrap(<Verify />));
    expect(await screen.findByText('Verify Maya')).toBeTruthy();
    expect(await screen.findByText('90123')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark as verified'));
    await waitFor(() => expect(mockTrust).toHaveBeenCalledWith('u2', true));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('warns when a contact’s safety number changed', async () => {
    mockKeys.mockResolvedValue({ status: 'changed', verified: false });
    await render(wrap(<Verify />));
    expect(await screen.findByText('Maya’s safety number changed')).toBeTruthy();
    expect(screen.getByText(/added or reinstalled a device/)).toBeTruthy();
  });
});
