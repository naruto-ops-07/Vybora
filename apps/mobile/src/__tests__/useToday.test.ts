import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useToday } from '@/features/connect/useToday';

describe('useToday', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps the same Date within a day and moves on after midnight', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 15, 23, 58) });
    const { result } = await renderHook(() => useToday());
    const first = result.current;
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(first);
    await act(async () => {
      jest.advanceTimersByTime(2 * 60_000);
    });
    expect(result.current.getDate()).toBe(16);
  });

  it('catches up when the app becomes active again', async () => {
    let listener: ((s: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
      listener = cb as (s: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    jest.useFakeTimers({ now: new Date(2026, 9, 15, 12, 0) });
    const { result } = await renderHook(() => useToday());
    jest.setSystemTime(new Date(2026, 9, 17, 9, 0));
    await act(async () => listener?.('active'));
    expect(result.current.getDate()).toBe(17);
    spy.mockRestore();
  });
});
