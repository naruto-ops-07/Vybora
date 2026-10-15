import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { A11yProvider } from '@/features/a11y/A11yProvider';
import { TooltipProvider } from '@/components/ui/Tooltip';
import type { PostCard } from '@vybora/types';

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', client }: { route?: string; client?: QueryClient } = {},
) {
  const qc =
    client ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <A11yProvider>
            <TooltipProvider>
              <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
            </TooltipProvider>
          </A11yProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

export function makePost(overrides: Partial<PostCard> = {}): PostCard {
  return {
    id: 'post-1',
    author_id: 'author-1',
    kind: 'post',
    caption: 'Golden hour with @maya #sunset',
    comments_enabled: true,
    status: 'published',
    like_count: 41,
    comment_count: 2,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    updated_at: new Date().toISOString(),
    author: {
      id: 'author-1',
      username: 'lena',
      display_name: 'Lena',
      avatar_path: null,
      is_private: false,
    },
    media: [
      {
        id: 'm1',
        position: 0,
        storage_path: 'author-1/a.jpg',
        media_type: 'image',
        mime_type: 'image/jpeg',
        width: 1080,
        height: 1350,
        duration_ms: null,
        alt_text: 'A beach',
      },
    ],
    liked_by_me: false,
    saved_by_me: false,
    ...overrides,
  };
}
