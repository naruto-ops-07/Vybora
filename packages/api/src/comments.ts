import type { CommentView } from '@vybora/types';
import { commentSchema } from '@vybora/validation';
import { unwrap, type VyboraClient } from './client';

export const COMMENT_PAGE = 20;

export async function fetchComments(
  client: VyboraClient,
  postId: string,
  parentId: string | null,
  after?: { created_at: string; id: string } | null,
): Promise<CommentView[]> {
  const rows = unwrap(
    await client.rpc('list_comments', {
      p_post: postId,
      p_parent: parentId ?? undefined,
      p_after_created: after?.created_at,
      p_after_id: after?.id,
      p_limit: COMMENT_PAGE,
    }),
  );
  return rows.map((r) => ({
    id: r.id!,
    post_id: r.post_id!,
    parent_id: r.parent_id,
    body: r.body!,
    created_at: r.created_at!,
    author_id: r.author_id!,
    author_username: r.author_username!,
    author_display_name: r.author_display_name ?? '',
    author_avatar_path: r.author_avatar_path,
    reply_count: r.reply_count ?? 0,
  }));
}

export async function addComment(
  client: VyboraClient,
  userId: string,
  input: { postId: string; body: string; parentId?: string | null },
) {
  const body = commentSchema.parse(input.body);
  return unwrap(
    await client
      .from('comments')
      .insert({ post_id: input.postId, author_id: userId, body, parent_id: input.parentId ?? null })
      .select('id, created_at, parent_id')
      .single(),
  );
}

export async function deleteComment(client: VyboraClient, id: string) {
  const rows = unwrap(await client.from('comments').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('forbidden');
}
