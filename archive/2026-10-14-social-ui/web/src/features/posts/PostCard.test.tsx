import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostCard } from '@vybora/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePost, renderWithProviders } from '@/test/utils';

const setLiked = vi.fn();
const setSaved = vi.fn();

vi.mock('@vybora/api', async (orig) => ({
  ...((await orig()) as object),
  setLiked: (...args: unknown[]) => setLiked(...args),
  setSaved: (...args: unknown[]) => setSaved(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
  supabaseConfig: { url: 'http://x', anonKey: 'k' },
  signedMedia: () => new Promise(() => undefined),
  signedDm: () => new Promise(() => undefined),
}));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ userId: 'viewer-1' }) }));

const { PostCardView } = await import('./PostCard');

/** Renders the card from the query cache, like the real feeds do. */
function CachedPost({ initial }: { initial: PostCard }) {
  const { data } = useQuery({
    queryKey: ['post', initial.id],
    queryFn: () => initial,
    initialData: initial,
    staleTime: Infinity,
  });
  return data ? <PostCardView post={data} /> : null;
}

describe('PostCardView', () => {
  beforeEach(() => {
    setLiked.mockReset();
    setSaved.mockReset();
  });

  it('renders caption tokens as links, never as HTML', () => {
    renderWithProviders(
      <CachedPost initial={makePost({ caption: 'hi @maya #sunset <b>x</b>' })} />,
    );
    expect(screen.getByRole('link', { name: '@maya' })).toHaveAttribute('href', '/u/maya');
    expect(screen.getByRole('link', { name: '#sunset' })).toHaveAttribute('href', '/tags/sunset');
    expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument();
  });

  it('optimistically likes and persists through the API', async () => {
    setLiked.mockResolvedValue(undefined);
    renderWithProviders(<CachedPost initial={makePost()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(screen.getByText('42 likes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlike' })).toHaveAttribute('aria-pressed', 'true');
    expect(setLiked).toHaveBeenCalledWith(expect.anything(), 'viewer-1', 'post-1', true);
  });

  it('rolls back the optimistic like when the server rejects it', async () => {
    setLiked.mockRejectedValue({ message: 'new row violates row-level security policy' });
    renderWithProviders(<CachedPost initial={makePost()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Like' }));
    await waitFor(() => expect(screen.getByText('41 likes')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('alert')).toHaveTextContent('permission');
  });

  it('shows owner-only actions only to the author', async () => {
    renderWithProviders(<CachedPost initial={makePost()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Post options' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument();
  });

  it('shows the comment prompt or count', () => {
    renderWithProviders(<CachedPost initial={makePost({ comment_count: 0 })} />);
    expect(screen.getByRole('link', { name: 'Add a comment…' })).toHaveAttribute(
      'href',
      '/p/post-1',
    );
  });
});
