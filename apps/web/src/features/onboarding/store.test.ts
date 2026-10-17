import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOnboarding, resetOnboardingMemory, updateOnboarding, useOnboarding } from './store';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetOnboardingMemory();
});

describe('onboarding record', () => {
  it('is stored per user on this device', () => {
    updateOnboarding('u1', { shared: true });
    expect(JSON.parse(localStorage.getItem('vybora.onboarding.u1')!)).toMatchObject({
      shared: true,
      dismissed: false,
    });
    expect(localStorage.getItem('vybora.onboarding.u2')).toBeNull();
    resetOnboardingMemory();
    expect(readOnboarding('u1').shared).toBe(true);
    expect(readOnboarding('u2').shared).toBe(false);
  });

  it('survives storage that throws, keeping the session in memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readOnboarding('u1').dismissed).toBe(false);
    expect(() => updateOnboarding('u1', { dismissed: true })).not.toThrow();
    expect(readOnboarding('u1').dismissed).toBe(true);
  });

  it('treats a corrupt record as a fresh start', () => {
    localStorage.setItem('vybora.onboarding.u1', '{nope');
    expect(readOnboarding('u1')).toMatchObject({ shared: false, dismissed: false, done: false });
  });

  it('notifies readers, and skips writes that change nothing', () => {
    const { result } = renderHook(() => useOnboarding('u1'));
    expect(result.current[0].shared).toBe(false);
    act(() => result.current[1]({ shared: true }));
    expect(result.current[0].shared).toBe(true);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    act(() => result.current[1]({ shared: true }));
    expect(set).not.toHaveBeenCalled();
  });
});
