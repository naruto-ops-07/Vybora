import { adminSearchUsers, moderation, qk } from '@vybora/api';
import { formatCount, formatJoinDate, friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { StatusPill } from './Pagination';

type Pending =
  | { kind: 'status'; userId: string; username: string; status: 'active' | 'suspended' }
  | { kind: 'role'; userId: string; username: string; role: 'admin' | 'moderator'; grant: boolean };

export default function AdminUsers() {
  const { isAdmin, userId: me } = useAuth();
  const [term, setTerm] = useState('');
  const query = useDeferredValue(term.trim());
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: qk.admin.users(query),
    queryFn: () => adminSearchUsers(supabase, query),
  });

  const act = useMutation({
    mutationFn: async (p: Pending) =>
      p.kind === 'status'
        ? moderation.setUserStatus(supabase, p.userId, p.status, reason.trim() || 'No reason given')
        : moderation.setRole(supabase, p.userId, p.role, p.grant),
    onSuccess: () => {
      toast.show('Change recorded in the moderation log', 'success');
      setPending(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold">Users</h1>
      <div className="mb-4 max-w-md">
        <Input
          aria-label="Search users"
          placeholder="Username, display name or user ID"
          leading={<Search size={16} />}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-subtle">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Posts</th>
              <th className="px-4 py-3">Followers</th>
              <th className="px-4 py-3">Open reports</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isPending && (
              <tr>
                <td colSpan={7} className="p-4">
                  <Skeleton className="h-8" />
                </td>
              </tr>
            )}
            {q.data?.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/u/${u.username}`} className="flex items-center gap-3">
                    <Avatar path={u.avatar_path} name={u.username ?? '?'} size={34} />
                    <span className="leading-tight">
                      <span className="block font-semibold">@{u.username}</span>
                      <span className="text-xs text-subtle">
                        Joined {u.created_at ? formatJoinDate(u.created_at) : '—'}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={u.status ?? 'active'} />
                </td>
                <td className="px-4 py-3 tabular-nums">{formatCount(u.posts_count ?? 0)}</td>
                <td className="px-4 py-3 tabular-nums">{formatCount(u.followers_count ?? 0)}</td>
                <td className="px-4 py-3 tabular-nums">{u.open_reports ?? 0}</td>
                <td className="px-4 py-3">
                  {u.roles?.length ? u.roles.join(', ') : <span className="text-subtle">—</span>}
                </td>
                <td className="px-4 py-3">
                  {isAdmin && u.id !== me ? (
                    <div className="flex flex-wrap gap-1.5">
                      {u.status === 'suspended' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPending({
                              kind: 'status',
                              userId: u.id!,
                              username: u.username!,
                              status: 'active',
                            })
                          }
                        >
                          Restore
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setPending({
                              kind: 'status',
                              userId: u.id!,
                              username: u.username!,
                              status: 'suspended',
                            })
                          }
                        >
                          Suspend
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPending({
                            kind: 'role',
                            userId: u.id!,
                            username: u.username!,
                            role: 'moderator',
                            grant: !u.roles?.includes('moderator'),
                          })
                        }
                      >
                        {u.roles?.includes('moderator') ? 'Revoke mod' : 'Make mod'}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-subtle">
                      {u.id === me ? 'You' : 'Admin only'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.data?.length === 0 && <EmptyState title="No users found" className="py-10" />}
      </div>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={
          pending?.kind === 'status'
            ? `${pending.status === 'suspended' ? 'Suspend' : 'Restore'} @${pending.username}?`
            : pending
              ? `${pending.grant ? 'Grant' : 'Revoke'} ${pending.role} for @${pending.username}?`
              : ''
        }
        description={
          pending?.kind === 'status' && pending.status === 'suspended'
            ? 'Suspended accounts are hidden and cannot post, comment, follow or message.'
            : 'This change is audited.'
        }
        confirmLabel="Confirm"
        danger={pending?.kind === 'status' && pending.status === 'suspended'}
        loading={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
      >
        {pending?.kind === 'status' && (
          <Textarea
            label="Reason"
            value={reason}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
