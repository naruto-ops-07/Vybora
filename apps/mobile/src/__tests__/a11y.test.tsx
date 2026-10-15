import { A11Y_STORAGE_KEY } from '@vybora/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AccessibilityScreen from '@/app/messages/accessibility';
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
  });

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
});
