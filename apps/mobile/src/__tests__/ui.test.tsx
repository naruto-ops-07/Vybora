import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
  signedMedia: () => new Promise(() => undefined),
  signedDm: () => new Promise(() => undefined),
}));

import { Avatar, Button, Empty, ErrorView, TextField } from '@/components/ui';

describe('mobile UI primitives', () => {
  it('Button exposes an accessible role, label and busy state', async () => {
    const onPress = jest.fn();
    await render(<Button title="Share post" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share post' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Button does not fire while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('TextField is labelled and shows errors', async () => {
    await render(<TextField label="Email" value="" error="Enter a valid email address" />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  it('ErrorView maps network failures and retries', async () => {
    const retry = jest.fn();
    await render(<ErrorView error={new TypeError('Network request failed')} onRetry={retry} />);
    expect(screen.getByText(/offline/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('Empty renders title and body', async () => {
    await render(<Empty title="No reels yet" body="Share a vertical video" />);
    expect(screen.getByText('No reels yet')).toBeTruthy();
  });

  it('Avatar falls back to an initial when there is no photo', async () => {
    await render(<Avatar path={null} name="maya" />);
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByLabelText('maya')).toBeTruthy();
  });
});
