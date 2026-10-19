import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { personTone } from '@vybora/core';

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
  signedMedia: () => new Promise(() => undefined),
  signedDm: () => new Promise(() => undefined),
}));

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: () => Promise.resolve(),
}));

import { A11Y_STORAGE_KEY } from '@vybora/core';
import { A11yProvider } from '@/lib/a11y';
import { Avatar, Button, Empty, ErrorView, GroupAvatar, TextField } from '@/components/ui';

/** Every host node type in the rendered tree (react-native-svg renders named hosts). */
type Node = { type: string; children?: unknown[] | null };
function hostTypes(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(hostTypes);
  const n = node as Node;
  return [n.type, ...(n.children ?? []).flatMap(hostTypes)];
}

describe('mobile UI primitives', () => {
  it('Button exposes an accessible role, label and busy state', async () => {
    const onPress = jest.fn();
    await render(<Button title="Share post" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share post' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the primary Button draws the look gradient in Velvet', async () => {
    await render(<Button title="Continue" />);
    expect(screen.getByTestId('gradient-fill', { includeHiddenElements: true })).toBeTruthy();
    expect(hostTypes(screen.toJSON()).some((t) => /LinearGradient/.test(t))).toBe(true);
  });

  it('the primary Button is flat under high contrast', async () => {
    mockStore.set(A11Y_STORAGE_KEY, JSON.stringify({ highContrast: true }));
    await render(
      <A11yProvider>
        <Button title="Continue" />
      </A11yProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('gradient-fill', { includeHiddenElements: true })).toBeNull(),
    );
    expect(hostTypes(screen.toJSON()).some((t) => /LinearGradient/.test(t))).toBe(false);
    mockStore.clear();
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

  it('Avatar falls back to initials on the person’s tone when there is no photo', async () => {
    await render(<Avatar path={null} name="maya" userId="u-maya" displayName="Maya Lin" />);
    expect(screen.getByText('ML')).toBeTruthy();
    expect(screen.getByLabelText('maya')).toBeTruthy();
    expect(screen.getByTestId(`avatar-tone-${personTone('u-maya')}`)).toBeTruthy();
  });

  it('Avatar shows one initial when small, and the username when there is no name', async () => {
    await render(<Avatar path={null} name="sam.k" userId="u-sam" size={22} />);
    expect(screen.getByText('S')).toBeTruthy();
  });

  it('GroupAvatar overlaps the first two other members by id', async () => {
    await render(
      <GroupAvatar
        label="Trip"
        members={[
          { id: 'c', username: 'cy' },
          { id: 'a', username: 'al', display_name: 'Al Bo' },
          { id: 'b', username: 'bea' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Trip')).toBeTruthy();
    // The member avatars are decorative inside the labelled group image.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText('AB', hidden)).toBeTruthy();
    expect(screen.getByText('B', hidden)).toBeTruthy();
    expect(screen.queryByText('C', hidden)).toBeNull();
    expect(screen.queryByText('AB')).toBeNull();
  });
});
