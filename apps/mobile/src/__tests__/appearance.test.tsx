import { personTonesByLook } from '@vybora/config';
import { APPEARANCE_KEY, personTone } from '@vybora/core';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import AppearanceScreen from '@/app/messages/appearance';
import { A11yProvider } from '@/lib/a11y';
import { AppearanceProvider, useAppearance } from '@/lib/appearance';
import { personToneStyle, usePersonTone } from '@/lib/personTones';
import { shadowStyle, themeFor, useTheme } from '@/lib/theme';

const mockStore = new Map<string, string>();
const mockSet = jest.fn((k: string, v: string) => {
  mockStore.set(k, v);
  return Promise.resolve();
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => mockSet(k, v),
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <A11yProvider>
    <AppearanceProvider>{children}</AppearanceProvider>
  </A11yProvider>
);

describe('appearance', () => {
  beforeEach(() => {
    mockStore.clear();
    mockSet.mockClear();
  });

  it('applies the stored look and mode', async () => {
    mockStore.set(APPEARANCE_KEY, JSON.stringify({ look: 'aurora', mode: 'dark' }));
    const { result } = await renderHook(() => ({ t: useTheme(), a: useAppearance() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.a.ready).toBe(true));
    expect(result.current.t.look).toBe('aurora');
    expect(result.current.t.dark).toBe(true);
    expect(result.current.t.bg).toBe(themeFor('aurora', 'dark', false).bg);
  });

  it('falls back to Velvet and the system mode on garbage', async () => {
    mockStore.set(APPEARANCE_KEY, '{not json');
    const { result } = await renderHook(() => useAppearance(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.look).toBe('velvet');
    expect(result.current.mode).toBe('system');
  });

  it('falls back on an unknown look and keeps a valid mode', async () => {
    mockStore.set(APPEARANCE_KEY, JSON.stringify({ look: 'sepia', mode: 'light' }));
    const { result } = await renderHook(() => useAppearance(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({ look: 'velvet', mode: 'light', resolved: 'light' });
  });

  it('stores the look picked on the Appearance screen', async () => {
    await render(<AppearanceScreen />, { wrapper: Wrapper });
    const bloom = await screen.findByRole('radio', { name: /Bloom/ });
    await fireEvent.press(bloom);
    await waitFor(() =>
      expect(mockSet).toHaveBeenLastCalledWith(
        APPEARANCE_KEY,
        expect.stringContaining('"look":"bloom"'),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Bloom/ })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: true }),
      ),
    );
  });

  it('stores the mode and shows the device-only note', async () => {
    await render(<AppearanceScreen />, { wrapper: Wrapper });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Dark' }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenLastCalledWith(
        APPEARANCE_KEY,
        JSON.stringify({ look: 'velvet', mode: 'dark' }),
      ),
    );
    expect(screen.getByRole('radio', { name: 'Match system' })).toBeTruthy();
    expect(screen.getByText('Saved on this device only.')).toBeTruthy();
  });
});

describe('theme', () => {
  it('is flat under high contrast', () => {
    const t = themeFor('bloom', 'dark', true);
    expect(t.primaryFrom).toBe(t.primaryTo);
    expect(t.bubbleOutFrom).toBe(t.bubbleOutTo);
    expect([t.glow1, t.glow2, t.glow3]).toEqual(['transparent', 'transparent', 'transparent']);
    expect(t.glass).toBe(false);
    expect(t.ambient).toBe('none');
  });

  it('shadowStyle is empty under high contrast and soft otherwise', () => {
    expect(shadowStyle(2, themeFor('velvet', 'dark', true))).toEqual({});
    const s = shadowStyle(2, themeFor('velvet', 'dark', false));
    expect(s).toMatchObject({ shadowColor: '#000000', shadowOpacity: 0.46, shadowRadius: 16 });
    expect(s.shadowOffset).toEqual({ width: 0, height: 12 });
  });

  it('pressed primary moves away from its text', () => {
    // Velvet's ink is dark, so pressed gets lighter; Bloom's is white, so darker.
    const v = themeFor('velvet', 'dark', false);
    const b = themeFor('bloom', 'light', false);
    const sum = (hex: string) =>
      [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(sum(v.primaryPressFrom)).toBeGreaterThan(sum(v.primaryFrom));
    expect(sum(b.primaryPressFrom)).toBeLessThan(sum(b.primaryFrom));
  });
});

describe('personal tones', () => {
  it('resolve per look', () => {
    const tone = personTone('u-maya');
    for (const look of ['velvet', 'aurora', 'bloom'] as const) {
      const s = personToneStyle('u-maya', true, false, '#FFFFFF', look);
      expect(s.fill).toBe(personTonesByLook[look][tone].dark.fill);
      expect(s.text).toBe(personTonesByLook[look][tone].dark.name);
    }
    expect(personToneStyle('u-maya', false, false, '#000', 'velvet').fill).not.toBe(
      personToneStyle('u-maya', false, false, '#000', 'bloom').fill,
    );
  });

  it('follow the active look in useTheme', async () => {
    mockStore.set(APPEARANCE_KEY, JSON.stringify({ look: 'bloom', mode: 'light' }));
    const { result } = await renderHook(
      () => ({ a: useAppearance(), tone: usePersonTone('u-maya') }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.a.look).toBe('bloom'));
    expect(result.current.tone.fill).toBe(personTonesByLook.bloom[personTone('u-maya')].light.fill);
  });
});
