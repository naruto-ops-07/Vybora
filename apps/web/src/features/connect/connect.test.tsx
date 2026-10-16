import { resolveChatTheme } from '@vybora/config';
import type { LocalMessage } from '@vybora/e2ee';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { acquireEngineLock } from '@/lib/connect/storage';
import { Bubble } from './Bubble';
import { Composer } from './Composer';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const base: LocalMessage = {
  id: 'm1',
  conversationId: 'c1',
  seq: 3,
  senderId: 'me',
  senderDeviceId: 'd1',
  createdAt: '2026-10-09T10:00:00Z',
  expiresAt: null,
  status: 'sent',
  kind: 'text',
  body: 'See https://vybora.app/docs <img src=x onerror=alert(1)>',
  reactions: {},
};

function renderBubble(m: Partial<LocalMessage> = {}, mine = true) {
  const handlers = {
    onReact: vi.fn(),
    onReply: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
    onOpenImage: vi.fn(),
  };
  render(
    <Bubble
      message={{ ...base, ...m }}
      mine={mine}
      theme={{ ...resolveChatTheme(null), accent: '#0F766E' }}
      showSender={false}
      runStart
      runEnd
      onSelect={vi.fn()}
      receipt={mine ? 'read' : undefined}
      myUserId="me"
      nameOf={(id) => (id === 'me' ? 'You' : 'Maya')}
      {...handlers}
    />,
  );
  return handlers;
}

describe('Secure message bubble', () => {
  it('renders text safely with hardened links and receipts', () => {
    const { container } = render(<div />);
    renderBubble();
    const link = screen.getByRole('link', { name: 'https://vybora.app/docs' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('reacts, replies and only lets the sender delete', async () => {
    const user = userEvent.setup();
    const h = renderBubble();
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(screen.getByRole('menuitem', { name: 'React with 🔥' }));
    expect(h.onReact).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), '🔥');
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    expect(h.onReply).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete for everyone' }));
    expect(h.onDelete).toHaveBeenCalled();
  });

  it('hides delete on other people’s messages and shows a placeholder for undecryptable ones', () => {
    renderBubble({ senderId: 'them' }, false);
    expect(screen.queryByRole('button', { name: 'Delete for everyone' })).toBeNull();
    renderBubble({ id: 'm2', kind: 'undecryptable', body: 'secret' }, false);
    expect(
      screen.getByText('This message couldn’t be decrypted on this device.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('Composer', () => {
  const props = {
    accent: '#B8A9FF',
    replyTo: null,
    onCancelReply: vi.fn(),
    onFiles: vi.fn(),
    onTyping: vi.fn(),
    draftKey: 'c1',
  };

  it('sends trimmed text on Enter and keeps Shift+Enter for new lines', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer {...props} onSend={onSend} />, { wrapper: TooltipProvider });
    const box = screen.getByRole('textbox', { name: 'Message' });
    await user.type(box, '  hello{Shift>}{Enter}{/Shift}there  ');
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello\nthere');
    expect(box).toHaveValue('');
  });

  it('follows the message text size setting', () => {
    render(<Composer {...props} draftKey="c4" onSend={vi.fn()} />, { wrapper: TooltipProvider });
    const box = screen.getByRole('textbox', { name: 'Message' });
    // .text-msg reads --vy-msg-size, which Accessibility → Text size sets.
    expect(box).toHaveClass('text-msg');
    expect(box.className).not.toMatch(/text-\[\d+px\]/);
  });

  it('explains why sending is unavailable while the device joins the group', () => {
    render(
      <Composer
        {...props}
        draftKey="c2"
        onSend={vi.fn()}
        disabled
        disabledReason="Setting up encryption for this browser."
      />,
    );
    expect(screen.getByText('Setting up encryption for this browser.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('accepts pasted files', () => {
    const onFiles = vi.fn();
    render(<Composer {...props} draftKey="c3" onSend={vi.fn()} onFiles={onFiles} />, {
      wrapper: TooltipProvider,
    });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.paste(screen.getByRole('textbox', { name: 'Message' }), {
      clipboardData: { files: [file] },
    });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});

describe('single-tab engine lock', () => {
  const nav = navigator as unknown as { locks?: unknown };
  afterEach(() => {
    delete nav.locks;
  });

  it('reports another tab holding the engine', async () => {
    Object.defineProperty(nav, 'locks', {
      configurable: true,
      value: {
        request: (_n: string, _o: unknown, cb: (l: null) => unknown) => Promise.resolve(cb(null)),
      },
    });
    expect(await acquireEngineLock('u1')).toBeNull();
  });

  it('grants the lock when available and signals when another tab takes over', async () => {
    let reject!: (e: Error) => void;
    Object.defineProperty(nav, 'locks', {
      configurable: true,
      value: {
        request: (_n: string, _o: unknown, cb: (l: object) => Promise<void>) =>
          new Promise((_, rej) => {
            reject = rej;
            void cb({});
          }),
      },
    });
    const lock = await acquireEngineLock('u1');
    expect(lock).not.toBeNull();
    let lost = false;
    void lock!.lost.then(() => (lost = true));
    reject(new DOMException('stolen', 'AbortError'));
    await new Promise((r) => setTimeout(r, 0));
    expect(lost).toBe(true);
  });
});
