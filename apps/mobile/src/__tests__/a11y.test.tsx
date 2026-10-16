import type { ChatTheme } from '@vybora/api';
import { highContrastThemes } from '@vybora/config';
import { A11Y_STORAGE_KEY } from '@vybora/core';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import AccessibilityScreen from '@/app/messages/accessibility';
import { ChatBackground, useThemeDef } from '@/features/connect/ui/primitives';
import { A11yProvider } from '@/lib/a11y';

const mockSet = jest.fn(() => Promise.resolve());
const mockGet = jest.fn(() => Promise.resolve<string | null>(null));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGet(...(a as [])),
  setItemAsync: (...a: unknown[]) => mockSet(...(a as [])),
}));

describe('Accessibility screen', () => {
  beforeEach(() => {
    mockSet.mockClear();
    mockGet.mockResolvedValue(null);
  });

  it('saves high contrast and text size on this device', async () => {
    await render(
      <A11yProvider>
        <AccessibilityScreen />
      </A11yProvider>,
    );
    await fireEvent(screen.getByLabelText('High contrast'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenLastCalledWith(
        A11Y_STORAGE_KEY,
        expect.stringContaining('"highContrast":true'),
      ),
    );
    expect(mockSet).toHaveBeenLastCalledWith(
      A11Y_STORAGE_KEY,
      expect.stringContaining('"textSize":"lg"'),
    );
    // Flaked at the 5 s default under parallel load (two state changes + secure store).
  }, 15_000);

  it('loads saved settings', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ textSize: 'xl' }));
    await render(
      <A11yProvider>
        <AccessibilityScreen />
      </A11yProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Extra large' })).toHaveProp('accessibilityState', {
        checked: true,
      }),
    );
  });

  it('overrides chat theme colours with the high-contrast accent', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ highContrast: true }));
    const theme: ChatTheme = { preset: 'rose', wallpaper: 'stars' };
    const { result } = await renderHook(() => useThemeDef(theme), { wrapper: A11yProvider });
    await waitFor(() => expect(result.current.highContrast).toBe(true));
    const hc = highContrastThemes.light;
    expect(result.current).toMatchObject({
      outgoing: hc.accent,
      outgoingText: hc.onAccent,
      accent: hc.accent,
      background: hc.bg,
    });
  });

  it('drops the wallpaper pattern in high contrast', async () => {
    const theme: ChatTheme = { preset: 'rose', wallpaper: 'stars' };
    await render(
      <A11yProvider>
        <ChatBackground theme={theme}>{null}</ChatBackground>
      </A11yProvider>,
    );
    expect(screen.getByTestId('chat-wallpaper')).toBeTruthy();
    mockGet.mockResolvedValue(JSON.stringify({ highContrast: true }));
    await render(
      <A11yProvider>
        <ChatBackground theme={theme}>{null}</ChatBackground>
      </A11yProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('chat-wallpaper')).toBeNull());
  });

  it('keeps the chat theme without high contrast', async () => {
    const theme: ChatTheme = { preset: 'rose', wallpaper: 'stars' };
    const { result } = await renderHook(() => useThemeDef(theme), { wrapper: A11yProvider });
    expect(result.current.highContrast).toBe(false);
    expect(result.current.outgoing).not.toBe(highContrastThemes.light.accent);
  });
});
