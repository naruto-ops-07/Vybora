import { fetchReports, qk, type ReportStatus } from '@vybora/api';
import { formatRelativeTime } from '@vybora/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import { Pagination, StatusPill } from './Pagination';

const PAGE_SIZE = 20;

export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'open') as ReportStatus | 'all';
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? 0);
  const set = (patch: Record<string, string>) => setParams({ status, type, page: '0', ...patch });

  const q = useQuery({
    queryKey: qk.admin.reports(status, page, type),
    queryFn: () =>
      fetchReports(supabase, { status, page, pageSize: PAGE_SIZE, targetType: type || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold">Report queue</h1>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mr-2 font-semibold">Status</span>
          <select
            value={status}
            onChange={(e) => set({ status: e.target.value })}
            className="h-10 rounded-xl border border-line-strong bg-surface px-3"
          >
            {['open', 'reviewing', 'actioned', 'dismissed', 'all'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-2 font-semibold">Type</span>
          <select
            value={type}
            onChange={(e) => set({ type: e.target.value })}
            className="h-10 rounded-xl border border-line-strong bg-surface px-3"
          >
            <option value="">all</option>
            {['post', 'comment', 'profile', 'story'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-4 py-3">Reported</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Reporter</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-3">
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              ))}
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-muted">
                <td className="px-4 py-3 text-muted">{formatRelativeTime(r.created_at)}</td>
                <td className="px-4 py-3 font-medium capitalize">{r.target_type}</td>
                <td className="px-4 py-3 capitalize">{r.reason.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">@{r.reporter?.username ?? 'deleted'}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/admin/reports/${r.id}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.data?.rows.length === 0 && (
          <EmptyState
            title="Queue is clear"
            body="No reports match these filters."
            className="py-10"
          />
        )}
      </div>
      {q.data && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={q.data.total}
          onChange={(p) => set({ page: String(p) })}
        />
      )}
    </div>
  );
}
