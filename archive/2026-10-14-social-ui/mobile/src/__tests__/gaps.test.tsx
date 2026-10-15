import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpdatePost = jest.fn();
const mockCreatePost = jest.fn();
const mockUpload = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPick = jest.fn();

const post = {
  id: 'p1',
  author_id: 'u1',
  kind: 'post',
  caption: 'Original caption',
  comments_enabled: true,
  status: 'published',
  like_count: 0,
  comment_count: 0,
  created_at: '2026-10-09T10:00:00Z',
  updated_at: '2026-10-09T10:00:00Z',
  author: { id: 'u1', username: 'maya', display_name: '', avatar_path: null, is_private: false },
  media: [],
  liked_by_me: false,
  saved_by_me: false,
};

jest.mock('@vybora/api', () => ({
  ...jest.requireActual('@vybora/api'),
  fetchPost: () => Promise.resolve(post),
  updatePost: (...a: unknown[]) => mockUpdatePost(...a),
  createPost: (...a: unknown[]) => mockCreatePost(...a),
  uploadObject: (...a: unknown[]) => mockUpload(...a),
  removeObjects: () => Promise.resolve(),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
}));
jest.mock('@/lib/media', () => ({ pickMedia: (...a: unknown[]) => mockPick(...a) }));
jest.mock('@/features/auth/AuthProvider', () => ({
  useMe: () => ({ userId: 'u1', profile: null }),
}));
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (...a: unknown[]) => mockPush(...a) },
  useLocalSearchParams: () => ({ id: 'p1' }),
}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

import EditPost from '@/app/edit-post/[id]';
import Create from '@/app/(tabs)/create';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('Edit post', () => {
  it('saves only after a change and returns to the previous screen', async () => {
    mockUpdatePost.mockResolvedValue(undefined);
    await render(wrap(<EditPost />));
    const field = await screen.findByDisplayValue('Original caption');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(field, 'Edited #caption');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockUpdatePost).toHaveBeenCalledWith({}, 'p1', {
        caption: 'Edited #caption',
        comments_enabled: true,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('Create post', () => {
  it('sends per-photo alt text with the post', async () => {
    mockPick.mockResolvedValue([
      {
        uri: 'file:///a.jpg',
        body: new ArrayBuffer(8),
        mime: 'image/jpeg',
        mediaType: 'image',
        width: 10,
        height: 10,
        durationMs: null,
      },
    ]);
    mockUpload.mockResolvedValue({});
    mockCreatePost.mockResolvedValue('new-post');

    await render(wrap(<Create />));
    await fireEvent.press(screen.getByRole('button', { name: 'Select from library' }));
    const alt = await screen.findByLabelText('Alt text for photo 1 (optional)');
    await fireEvent.changeText(alt, '  A dog on a beach  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Share post' }));

    await waitFor(() => expect(mockCreatePost).toHaveBeenCalled());
    const input = mockCreatePost.mock.calls[0][1];
    expect(input.media[0]).toMatchObject({ mime_type: 'image/jpeg', alt_text: 'A dog on a beach' });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/p/[id]', params: { id: 'new-post' } });
  });
});
