import { fetchAuditLog, fetchModerationLog, qk } from '@vybora/api';
import { formatRelativeTimeLong } from '@vybora/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState, Skeleton, Tabs } from '@/components/ui/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Pagination } from './Pagination';

const SIZE = 25;

export default function AdminLog() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'moderation' | 'audit'>('moderation');
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: tab === 'moderation' ? qk.admin.log(page) : qk.admin.audit(page),
    queryFn: async () => {
      if (tab === 'moderation') {
        const r = await fetchModerationLog(supabase, page, SIZE);
        return {
          total: r.total,
          rows: r.rows.map((x) => ({
            id: x.id,
            when: x.created_at,
            who: x.moderator?.username,
            what: x.action,
            target: `${x.target_type} ${x.target_id.slice(0, 8)}`,
            note: x.reason,
          })),
        };
      }
      const r = await fetchAuditLog(supabase, page, SIZE);
      return {
        total: r.total,
        rows: r.rows.map((x) => ({
          id: x.id,
          when: x.created_at,
          who: x.actor?.username,
          what: x.action,
          target: `${x.entity} ${x.entity_id?.slice(0, 8) ?? ''}`,
          note: JSON.stringify(x.metadata),
        })),
      };
    },
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold">Activity log</h1>
      {isAdmin && (
        <div className="mb-4 max-w-xs">
          <Tabs
            label="Log type"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setPage(0);
            }}
            items={[
              { value: 'moderation', label: 'Moderation' },
              { value: 'audit', label: 'Audit' },
            ]}
          />
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {q.isPending && (
              <tr>
                <td colSpan={5} className="p-4">
                  <Skeleton className="h-8" />
                </td>
              </tr>
            )}
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-muted">{formatRelativeTimeLong(r.when)}</td>
                <td className="px-4 py-3">@{r.who ?? 'system'}</td>
                <td className="px-4 py-3 font-medium">{r.what.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.target}</td>
                <td className="max-w-xs truncate px-4 py-3 text-muted" title={r.note ?? ''}>
                  {r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data && <Pagination page={page} pageSize={SIZE} total={q.data.total} onChange={setPage} />}
    </div>
  );
}
