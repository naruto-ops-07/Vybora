import { Alert } from 'react-native';
import { copyText } from '@/features/connect/copy';

const mockSetString = jest.fn<Promise<boolean>, [string]>();
jest.mock('expo-clipboard', () => ({
  setStringAsync: (t: string) => mockSetString(t),
}));

describe('copy text', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  beforeEach(() => {
    alert.mockClear();
    mockSetString.mockReset();
  });

  it('copies silently on success', async () => {
    mockSetString.mockResolvedValue(true);
    await expect(copyText('See you at 7')).resolves.toBe(true);
    expect(mockSetString).toHaveBeenCalledWith('See you at 7');
    expect(alert).not.toHaveBeenCalled();
  });

  it('explains a failed copy instead of throwing', async () => {
    mockSetString.mockRejectedValue(new Error('denied'));
    await expect(copyText('x')).resolves.toBe(false);
    mockSetString.mockResolvedValue(false);
    await expect(copyText('x')).resolves.toBe(false);
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith('Couldn’t copy', expect.any(String));
  });
});
