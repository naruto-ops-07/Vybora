import { unwrap, unwrapMaybe, type VyboraClient } from './client';

/** All functions below are authorized server-side (private.require_staff). */

export async function fetchAdminOverview(client: VyboraClient) {
  const rows = unwrap(await client.rpc('admin_overview'));
  return rows[0] ?? null;
}

export async function adminSearchUsers(client: VyboraClient, query: string) {
  return unwrap(await client.rpc('admin_search_users', { p_query: query, p_limit: 50 }));
}

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export async function fetchReports(
  client: VyboraClient,
  opts: { status: ReportStatus | 'all'; page: number; pageSize?: number; targetType?: string },
) {
  const size = opts.pageSize ?? 20;
  let q = client
    .from('reports')
    .select(
      'id, target_type, target_id, reason, details, status, created_at, handled_at, reporter:profiles!reports_reporter_id_fkey(username), handler:profiles!reports_handled_by_fkey(username)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(opts.page * size, opts.page * size + size - 1);
  if (opts.status !== 'all') q = q.eq('status', opts.status);
  if (opts.targetType) q = q.eq('target_type', opts.targetType);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchModerationLog(client: VyboraClient, page: number, pageSize = 25) {
  const { data, error, count } = await client
    .from('moderation_actions')
    .select(
      'id, action, target_type, target_id, reason, metadata, created_at, moderator:profiles!moderation_actions_moderator_id_fkey(username)',
      {
        count: 'exact',
      },
    )
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchAuditLog(client: VyboraClient, page: number, pageSize = 25) {
  const { data, error, count } = await client
    .from('audit_logs')
    .select(
      'id, action, entity, entity_id, metadata, created_at, actor:profiles!audit_logs_actor_id_fkey(username)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchReportTarget(client: VyboraClient, type: string, id: string) {
  switch (type) {
    case 'post':
      return unwrap(await client.rpc('get_post', { p_id: id }))[0] ?? null;
    case 'comment':
      return unwrapMaybe(
        await client
          .from('comments')
          .select('id, body, post_id, author_id, created_at')
          .eq('id', id)
          .maybeSingle(),
      );
    case 'profile':
      return unwrapMaybe(
        await client
          .from('profiles')
          .select('id, username, display_name, bio, status, avatar_path')
          .eq('id', id)
          .maybeSingle(),
      );
    case 'story':
      return unwrapMaybe(
        await client
          .from('stories')
          .select('id, author_id, storage_path, media_type, expires_at')
          .eq('id', id)
          .maybeSingle(),
      );
    default:
      return null;
  }
}

export const moderation = {
  setReportStatus: async (
    client: VyboraClient,
    reportId: string,
    status: ReportStatus,
    note?: string,
  ) =>
    unwrap(
      await client.rpc('mod_set_report_status', {
        p_report: reportId,
        p_status: status,
        p_note: note,
      }),
    ),
  removePost: async (client: VyboraClient, postId: string, reason: string, reportId?: string) =>
    unwrap(
      await client.rpc('mod_remove_post', { p_post: postId, p_reason: reason, p_report: reportId }),
    ),
  restorePost: async (client: VyboraClient, postId: string, reason?: string) =>
    unwrap(await client.rpc('mod_restore_post', { p_post: postId, p_reason: reason })),
  removeComment: async (
    client: VyboraClient,
    commentId: string,
    reason: string,
    reportId?: string,
  ) =>
    unwrap(
      await client.rpc('mod_remove_comment', {
        p_comment: commentId,
        p_reason: reason,
        p_report: reportId,
      }),
    ),
  removeStory: async (client: VyboraClient, storyId: string, reason: string, reportId?: string) =>
    unwrap(
      await client.rpc('mod_remove_story', {
        p_story: storyId,
        p_reason: reason,
        p_report: reportId,
      }),
    ),
  setUserStatus: async (
    client: VyboraClient,
    userId: string,
    status: 'active' | 'suspended',
    reason: string,
    reportId?: string,
  ) =>
    unwrap(
      await client.rpc('admin_set_user_status', {
        p_user: userId,
        p_status: status,
        p_reason: reason,
        p_report: reportId,
      }),
    ),
  setRole: async (
    client: VyboraClient,
    userId: string,
    role: 'admin' | 'moderator',
    grant: boolean,
  ) => unwrap(await client.rpc('admin_set_role', { p_user: userId, p_role: role, p_grant: grant })),
};
