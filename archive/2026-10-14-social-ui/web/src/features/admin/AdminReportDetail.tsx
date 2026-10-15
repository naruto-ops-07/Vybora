import { fetchReportTarget, moderation, qk, type ReportStatus } from '@vybora/api';
import { formatRelativeTimeLong, friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { SignedImage } from '@/components/media/Media';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { StatusPill } from './Pagination';

type Action = {
  kind:
    | 'remove_post'
    | 'restore_post'
    | 'remove_comment'
    | 'remove_story'
    | 'suspend'
    | 'dismiss'
    | 'reviewing';
  label: string;
  danger?: boolean;
};

export default function AdminReportDetail() {
  const { reportId = '' } = useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Action | null>(null);

  const report = useQuery({
    queryKey: ['admin', 'report', reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select(
          'id, target_type, target_id, reason, details, status, created_at, handled_at, reporter:profiles!reports_reporter_id_fkey(username)',
        )
        .eq('id', reportId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const r = report.data;
  const target = useQuery({
    queryKey: qk.admin.target(r?.target_type ?? '', r?.target_id ?? ''),
    queryFn: () => fetchReportTarget(supabase, r!.target_type, r!.target_id),
    enabled: !!r,
  });

  const act = useMutation({
    mutationFn: async (a: Action) => {
      const why = reason.trim() || r!.reason;
      switch (a.kind) {
        case 'remove_post':
          return moderation.removePost(supabase, r!.target_id, why, r!.id);
        case 'restore_post':
          return moderation.restorePost(supabase, r!.target_id, why);
        case 'remove_comment':
          return moderation.removeComment(supabase, r!.target_id, why, r!.id);
        case 'remove_story':
          return moderation.removeStory(supabase, r!.target_id, why, r!.id);
        case 'suspend': {
          const t = target.data as { id?: string; author_id?: string } | null;
          const userId = r!.target_type === 'profile' ? r!.target_id : t?.author_id;
          if (!userId) throw new Error('Cannot determine account to suspend');
          return moderation.setUserStatus(supabase, userId, 'suspended', why, r!.id);
        }
        case 'dismiss':
          return moderation.setReportStatus(
            supabase,
            r!.id,
            'dismissed' as ReportStatus,
            reason.trim() || undefined,
          );
        case 'reviewing':
          return moderation.setReportStatus(supabase, r!.id, 'reviewing' as ReportStatus);
      }
    },
    onSuccess: () => {
      toast.show('Action recorded in the moderation log', 'success');
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  if (report.isPending) return <PageSpinner />;
  if (report.isError)
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (!r) return <ErrorState title="Report not found" />;

  const t = target.data as Record<string, unknown> | null | undefined;
  const actions: Action[] = [];
  if (r.status === 'open') actions.push({ kind: 'reviewing', label: 'Mark reviewing' });
  if (r.target_type === 'post' && t) {
    actions.push(
      t.status === 'removed'
        ? { kind: 'restore_post', label: 'Restore post' }
        : { kind: 'remove_post', label: 'Remove post', danger: true },
    );
  }
  if (r.target_type === 'comment' && t)
    actions.push({ kind: 'remove_comment', label: 'Remove comment', danger: true });
  if (r.target_type === 'story' && t)
    actions.push({ kind: 'remove_story', label: 'Remove story', danger: true });
  if (isAdmin && t) actions.push({ kind: 'suspend', label: 'Suspend account', danger: true });
  if (r.status === 'open' || r.status === 'reviewing')
    actions.push({ kind: 'dismiss', label: 'Dismiss report' });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <Link
          to="/admin/reports"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={16} /> Back to queue
        </Link>
        <h1 className="font-display text-2xl font-semibold capitalize">
          {r.reason.replace(/_/g, ' ')} · {r.target_type}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Reported by @{r.reporter?.username ?? 'deleted'} · {formatRelativeTimeLong(r.created_at)}{' '}
          · <StatusPill status={r.status} />
        </p>
        {r.details && (
          <blockquote className="mt-4 rounded-2xl border-l-4 border-accent bg-surface p-4 text-sm">
            {r.details}
          </blockquote>
        )}

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-subtle">
          Reported content
        </h2>
        <div className="rounded-[20px] border border-line bg-surface p-5">
          {target.isPending && <PageSpinner />}
          {target.data === null && (
            <p className="text-sm text-muted">This content no longer exists.</p>
          )}
          {t && r.target_type === 'post' && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>@{(t.author as { username: string }).username}</strong> ·{' '}
                <StatusPill status={String(t.status)} />
              </p>
              <div className="grid max-w-md grid-cols-3 gap-2">
                {(t.media as { id: string; storage_path: string; media_type: string }[]).map((m) =>
                  m.media_type === 'image' ? (
                    <div key={m.id} className="aspect-square overflow-hidden rounded-xl">
                      <SignedImage path={m.storage_path} alt="Reported media" />
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className="flex aspect-square items-center justify-center rounded-xl bg-surface-muted text-xs text-muted"
                    >
                      Video
                    </div>
                  ),
                )}
              </div>
              <p className="whitespace-pre-line text-sm">{String(t.caption ?? '')}</p>
              <Link to={`/p/${String(t.id)}`} className="text-sm font-semibold text-accent">
                Open post
              </Link>
            </div>
          )}
          {t && r.target_type === 'comment' && (
            <p className="whitespace-pre-line text-sm">“{String(t.body)}”</p>
          )}
          {t && r.target_type === 'profile' && (
            <div className="flex items-center gap-3">
              <Avatar path={t.avatar_path as string | null} name={String(t.username)} size={48} />
              <div>
                <p className="font-semibold">@{String(t.username)}</p>
                <p className="text-sm text-muted">{String(t.bio ?? '')}</p>
                <StatusPill status={String(t.status)} />
              </div>
            </div>
          )}
          {t && r.target_type === 'story' && (
            <div className="max-w-[200px] overflow-hidden rounded-xl">
              {t.media_type === 'image' ? (
                <SignedImage path={String(t.storage_path)} alt="Reported story" />
              ) : (
                <p className="text-sm">Video story</p>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-[20px] border border-line bg-surface p-5 lg:sticky lg:top-36">
        <h2 className="font-semibold">Take action</h2>
        <Textarea
          label="Reason / note"
          value={reason}
          max={1000}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Recorded in the moderation log"
        />
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <Button
              key={a.kind}
              variant={a.danger ? 'danger' : 'outline'}
              onClick={() => setPending(a)}
            >
              {a.label}
            </Button>
          ))}
          {!actions.length && <p className="text-sm text-muted">No actions available.</p>}
        </div>
        {!isAdmin && (
          <p className="text-xs text-subtle">Account suspension requires an administrator.</p>
        )}
      </aside>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={`${pending?.label ?? ''}?`}
        description="This action is logged with your account and the reason above."
        confirmLabel={pending?.label}
        danger={pending?.danger}
        loading={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
      />
    </div>
  );
}
