import { A11Y_STORAGE_KEY } from '@vybora/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import { Composer } from './Composer';
import { SEAL_MS, sealFrame } from './SealedSend';

type Props = ComponentProps<typeof Composer>;
const base: Omit<Props, 'onSend'> = {
  accent: '#2DD4BF',
  replyTo: null,
  onCancelReply: () => undefined,
  onFiles: () => undefined,
  onTyping: () => undefined,
  draftKey: 'seal-1',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderComposer(props: Partial<Props> & Pick<Props, 'onSend'>) {
  const ui = (p: Partial<Props>) => (
    <A11yProvider>
      <TooltipProvider>
        <Composer {...base} {...props} {...p} />
      </TooltipProvider>
    </A11yProvider>
  );
  const view = render(ui({}));
  return { ...view, rerenderWith: (p: Partial<Props>) => view.rerender(ui(p)) };
}

const box = () => screen.getByRole('textbox', { name: 'Message' });
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const seal = () => sendButton().getAttribute('data-seal');
const lock = () => sendButton().querySelector('[data-seal-lock]');

function typeAndEnter(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.keyDown(box(), { key: 'Enter' });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('sealed send', () => {
  it('plays once the send succeeds, then returns to the plane', async () => {
    const d = deferred<boolean>();
    renderComposer({ onSend: () => d.promise });
    typeAndEnter('hi');
    // Sending isn't held up: the field is already clear while the server works.
    expect(box()).toHaveValue('');
    expect(seal()).toBe('idle');
    await act(async () => d.resolve(true));
    expect(seal()).toBe('playing');
    expect(lock()).not.toBeNull();
    // Purely visual: same name, nothing announced.
    expect(sendButton()).toHaveAccessibleName('Send');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(SEAL_MS.total));
    expect(seal()).toBe('idle');
    expect(lock()).toBeNull();
  });

  it('plays straight away for a send that returns nothing', () => {
    renderComposer({ onSend: () => undefined });
    fireEvent.change(box(), { target: { value: 'hi' } });
    fireEvent.click(sendButton());
    expect(seal()).toBe('playing');
  });

  it('does not play when the send fails', async () => {
    const failed = deferred<boolean>();
    const rejected = deferred<boolean>();
    const results: Array<boolean | Promise<boolean>> = [false, failed.promise, rejected.promise];
    renderComposer({ onSend: () => results.shift()! });
    typeAndEnter('one');
    typeAndEnter('two');
    typeAndEnter('three');
    await act(async () => {
      failed.resolve(false);
      rejected.reject(new Error('network'));
    });
    expect(seal()).toBe('idle');
    expect(lock()).toBeNull();
  });

  it('restarts cleanly on a quick second send, without blocking typing', () => {
    renderComposer({ onSend: () => true });
    typeAndEnter('one');
    const first = lock();
    expect(first).not.toBeNull();
    act(() => vi.advanceTimersByTime(400));
    // The next message can be typed (and sent) mid-seal.
    fireEvent.change(box(), { target: { value: 'two' } });
    expect(box()).toHaveValue('two');
    expect(sendButton()).toBeEnabled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    // A fresh lock (its animation starts from the top), and a fresh 600 ms.
    expect(lock()).not.toBe(first);
    act(() => vi.advanceTimersByTime(400));
    expect(seal()).toBe('playing');
    act(() => vi.advanceTimersByTime(SEAL_MS.total - 400));
    expect(seal()).toBe('idle');
  });

  it('is off completely under reduced motion', async () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ reduceMotion: 'on' }));
    renderComposer({ onSend: () => Promise.resolve(true) });
    typeAndEnter('hi');
    await act(async () => undefined);
    expect(seal()).toBe('idle');
    expect(lock()).toBeNull();
  });

  it('plays nothing for a result that lands after switching chats', async () => {
    const d = deferred<boolean>();
    const view = renderComposer({ onSend: () => d.promise });
    typeAndEnter('hi');
    view.rerenderWith({ draftKey: 'seal-2' });
    await act(async () => d.resolve(true));
    expect(seal()).toBe('idle');
  });

  it('keeps the button at full strength while the seal plays on the now-empty field', () => {
    renderComposer({ onSend: () => true });
    typeAndEnter('hi');
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveClass('disabled:opacity-100');
    act(() => vi.advanceTimersByTime(SEAL_MS.total));
    expect(sendButton()).toHaveClass('disabled:opacity-45');
  });
});

describe('sealFrame', () => {
  it('starts on the plane with the shackle open 3 px', () => {
    expect(sealFrame(0)).toEqual({ plane: 1, lock: 0, shackleY: -3 });
  });

  it('is a closed lock alone at 320 ms', () => {
    const f = sealFrame(SEAL_MS.close);
    expect(f.plane).toBe(0);
    expect(f.lock).toBeCloseTo(1);
    expect(f.shackleY).toBeCloseTo(0);
  });

  it('shows the lock open first, then closes it fast and settles (exponential ease-out)', () => {
    expect(sealFrame(60).lock).toBeGreaterThan(0.8);
    expect(sealFrame(60).shackleY).toBe(-3);
    expect(sealFrame(160).shackleY).toBeGreaterThan(-1);
  });

  it('never shows plane and lock at full strength together on the way back', () => {
    for (let ms = SEAL_MS.close; ms <= SEAL_MS.total; ms += 10) {
      const f = sealFrame(ms);
      expect(f.plane + f.lock).toBeLessThanOrEqual(1.3);
    }
  });

  it('ends back on the plane', () => {
    expect(sealFrame(SEAL_MS.total)).toMatchObject({ plane: 1, lock: 0 });
  });
});
