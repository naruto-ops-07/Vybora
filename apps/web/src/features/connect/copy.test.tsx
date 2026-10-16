import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { useCopyText } from './copy';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const msg: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: 'maya',
  senderDeviceId: 'd1',
  createdAt: '2026-10-15T14:05:00Z',
  expiresAt: null,
  status: 'received',
  kind: 'text',
  body: 'See you at 7',
  reactions: {},
};

function mockClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('copy text', () => {
  it('confirms a successful copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    mockClipboard(writeText);
    const { result } = renderHook(() => useCopyText(), { wrapper: ToastProvider });
    let ok = false;
    await act(async () => {
      ok = await result.current('See you at 7');
    });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('See you at 7');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('explains a refused copy', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    const { result } = renderHook(() => useCopyText(), { wrapper: ToastProvider });
    let ok = true;
    await act(async () => {
      ok = await result.current('x');
    });
    expect(ok).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t copy');
  });

  it('routes the hover bar and the menu "Copy text" through onCopy', async () => {
    const onCopy = vi.fn();
    render(
      <TooltipProvider>
        <Bubble
          message={msg}
          mine={false}
          theme={{ ...resolveChatTheme(null), accent: '#0F766E' }}
          showSender={false}
          runStart
          runEnd
          myUserId="me"
          nameOf={() => 'Maya'}
          onReact={vi.fn()}
          onCopy={onCopy}
          onReply={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onOpenImage={vi.fn()}
          onSelect={vi.fn()}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy text' }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy text' }));
    expect(onCopy).toHaveBeenCalledTimes(2);
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('never throws without a clipboard when no onCopy is given', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    render(
      <TooltipProvider>
        <Bubble
          message={msg}
          mine={false}
          theme={{ ...resolveChatTheme(null), accent: '#0F766E' }}
          showSender={false}
          runStart
          runEnd
          myUserId="me"
          nameOf={() => 'Maya'}
          onReact={vi.fn()}
          onReply={vi.fn()}
          onDelete={vi.fn()}
          onRetry={vi.fn()}
          onOpenImage={vi.fn()}
          onSelect={vi.fn()}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy text' }));
  });
});
