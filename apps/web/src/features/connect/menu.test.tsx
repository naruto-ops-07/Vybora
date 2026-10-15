import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Bubble } from './Bubble';
import { MessageMenu } from './MessageMenu';
import { threadKeyDown } from './threadKeys';
import { useSwipeReply } from './useSwipeReply';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

describe('message menu', () => {
  it('opens on right-click with reactions and the allowed actions', async () => {
    const onAction = vi.fn();
    const onReact = vi.fn();
    render(
      <MessageMenu
        actions={['reply', 'copy', 'select', 'delete']}
        myReactions={['👍']}
        onReact={onReact}
        onAction={onAction}
      >
        <div>Bubble</div>
      </MessageMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Bubble'));
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete for everyone' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove 👍' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Select' }));
    expect(onAction).toHaveBeenCalledWith('select');
  });

  it('renders the plain bubble when no actions are allowed', () => {
    render(
      <MessageMenu actions={[]} myReactions={[]} onReact={vi.fn()} onAction={vi.fn()}>
        <div>Sending</div>
      </MessageMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Sending'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('message menu on a real bubble', () => {
  const msg: LocalMessage = {
    id: 'm1',
    conversationId: 'c1',
    seq: 3,
    senderId: 'me',
    senderDeviceId: 'd1',
    createdAt: '2026-10-15T14:05:00Z',
    expiresAt: null,
    status: 'sent',
    kind: 'text',
    body: 'See you at 7',
    reactions: {},
  };

  afterEach(() => localStorage.clear());

  function Thread({ onReply }: { onReply: (id: string) => void }) {
    const theme = { ...resolveChatTheme(null), accent: '#0F766E' };
    return (
      <A11yProvider>
        <TooltipProvider>
          <div onKeyDown={(e) => threadKeyDown(e, { onReply })}>
            <Bubble
              message={msg}
              mine
              theme={theme}
              showSender={false}
              runStart
              runEnd
              tabbable
              myUserId="me"
              nameOf={() => 'You'}
              onReact={vi.fn()}
              onReply={vi.fn()}
              onDelete={vi.fn()}
              onRetry={vi.fn()}
              onOpenImage={vi.fn()}
              onSelect={vi.fn()}
            />
          </div>
        </TooltipProvider>
      </A11yProvider>
    );
  }

  it('opens the menu with Enter on the focused message', async () => {
    const { container } = render(<Thread onReply={vi.fn()} />);
    const el = container.querySelector<HTMLElement>('[data-message-id]')!;
    el.focus();
    expect(el).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
  });

  it('opens the same menu on right-click', async () => {
    const { container } = render(<Thread onReply={vi.fn()} />);
    fireEvent.contextMenu(container.querySelector('[data-message-id]')!);
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete for everyone' })).toBeInTheDocument();
  });
});

describe('always-visible actions', () => {
  const msg: LocalMessage = {
    id: 'm2',
    conversationId: 'c1',
    seq: 4,
    senderId: 'me',
    senderDeviceId: 'd1',
    createdAt: '2026-10-15T14:05:00Z',
    expiresAt: null,
    status: 'sent',
    kind: 'text',
    body: 'Hello',
    reactions: {},
  };
  afterEach(() => localStorage.clear());

  function renderBubble() {
    localStorage.setItem('vybora.a11y', JSON.stringify({ alwaysShowActions: true }));
    const theme = { ...resolveChatTheme(null), accent: '#0F766E' };
    return render(
      <A11yProvider>
        <TooltipProvider>
          <Bubble
            message={msg}
            mine
            theme={theme}
            showSender={false}
            runStart
            runEnd
            myUserId="me"
            nameOf={() => 'You'}
            onReact={vi.fn()}
            onReply={vi.fn()}
            onDelete={vi.fn()}
            onRetry={vi.fn()}
            onOpenImage={vi.fn()}
            onSelect={vi.fn()}
          />
        </TooltipProvider>
      </A11yProvider>,
    );
  }

  it('shows only React, Reply and More in the always-visible bar', () => {
    renderBubble();
    for (const name of ['More actions', 'Reply', 'React']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toBeVisible();
      expect(btn.closest('.opacity-100')).not.toBeNull();
      expect(btn.closest('.hover-actions')).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete for everyone' })).toBeNull();
  });

  it('opens the menu from More actions', async () => {
    renderBubble();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy text' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete for everyone' })).toBeInTheDocument();
  });
});

describe('swipe to reply (touch)', () => {
  const ev = (x: number, y: number, t: number, pointerType = 'touch') =>
    ({ pointerType, clientX: x, clientY: y, timeStamp: t }) as unknown as PointerEvent<HTMLElement>;

  it('triggers after a 64px rightward drag', () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useSwipeReply(onTrigger, true));
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerMove!(ev(80, 4, 200)));
    expect(result.current.offset).toBeGreaterThan(0);
    act(() => result.current.handlers.onPointerUp!(ev(80, 4, 400)));
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(result.current.offset).toBe(0);
  });

  it('ignores mouse input, vertical drags and the disabled setting', () => {
    const onTrigger = vi.fn();
    const { result, rerender } = renderHook(
      (p: { on: boolean }) => useSwipeReply(onTrigger, p.on),
      {
        initialProps: { on: true },
      },
    );
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0, 'mouse')));
    act(() => result.current.handlers.onPointerUp!(ev(90, 0, 100, 'mouse')));
    act(() => result.current.handlers.onPointerDown!(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerUp!(ev(70, 120, 100)));
    rerender({ on: false });
    act(() => result.current.handlers.onPointerDown?.(ev(0, 0, 0)));
    act(() => result.current.handlers.onPointerUp?.(ev(90, 0, 100)));
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
