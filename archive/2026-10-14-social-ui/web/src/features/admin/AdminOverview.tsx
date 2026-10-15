import { fetchAdminOverview, qk } from '@vybora/api';
import { formatCount } from '@vybora/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';

function Stat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
  to?: string;
}) {
  const body = (
    <div className="rounded-[20px] border border-line bg-surface p-5 transition-shadow hover:shadow-card">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
        {value == null ? '—' : formatCount(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function AdminOverview() {
  const q = useQuery({
    queryKey: qk.admin.overview,
    queryFn: () => fetchAdminOverview(supabase),
    refetchInterval: 60_000,
  });
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Overview</h1>
      <p className="mb-6 text-sm text-muted">
        Live counts from the production database. Message content is never shown here.
      </p>
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[20px]" />
          ))}
        </div>
      ) : (
        q.data && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Open reports"
              value={q.data.open_reports}
              hint="Open + reviewing"
              to="/admin/reports"
            />
            <Stat
              label="Total users"
              value={q.data.total_users}
              hint={`${q.data.new_users_7d ?? 0} joined in 7 days`}
              to="/admin/users"
            />
            <Stat label="Suspended users" value={q.data.suspended_users} />
            <Stat label="Published posts" value={q.data.total_posts} />
            <Stat label="Posts (24h)" value={q.data.posts_24h} />
            <Stat label="Removed posts" value={q.data.removed_posts} />
            <Stat label="Active stories" value={q.data.active_stories} />
            <Stat label="Messages (24h)" value={q.data.messages_24h} hint="Volume only" />
          </div>
        )
      )}
    </div>
  );
}
