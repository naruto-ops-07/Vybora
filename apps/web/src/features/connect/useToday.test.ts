import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToday } from './useToday';

afterEach(() => vi.useRealTimers());

describe('useToday', () => {
  it('keeps the same Date within a day and moves on after midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 23, 58));
    const { result } = renderHook(() => useToday());
    const first = result.current;
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(first);
    act(() => vi.advanceTimersByTime(2 * 60_000));
    expect(result.current).not.toBe(first);
    expect(result.current.getDate()).toBe(16);
  });

  it('catches up when the tab regains focus after timers were throttled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    const { result } = renderHook(() => useToday());
    // The clock jumps (sleep / background tab) without the midnight timer firing.
    vi.setSystemTime(new Date(2026, 9, 17, 9, 0));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.getDate()).toBe(17);
  });
});
