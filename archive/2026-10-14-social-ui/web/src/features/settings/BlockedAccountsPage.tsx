import { fetchBlocked, qk, unblock } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function BlockedAccountsPage() {
  const { userId } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.blocked, queryFn: () => fetchBlocked(supabase) });
  const unblockMut = useMutation({
    mutationFn: (id: string) => unblock(supabase, userId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.blocked });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      toast.show('Unblocked', 'success');
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-semibold">Blocked accounts</h2>
      <p className="mb-5 text-sm text-muted">
        Blocked accounts can’t see your profile or content, follow you, or message you.
      </p>
      {q.isPending && <Skeleton className="h-12" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data?.length === 0 && (
        <EmptyState icon={<Ban size={26} />} title="You haven’t blocked anyone" className="py-8" />
      )}
      <ul className="space-y-2">
        {q.data?.map((u) => (
          <li key={u.id} className="flex items-center gap-3">
            <Avatar path={u.avatar_path} name={u.username} size={40} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{u.username}</p>
              <p className="truncate text-sm text-muted">{u.display_name}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={unblockMut.isPending && unblockMut.variables === u.id}
              onClick={() => unblockMut.mutate(u.id)}
            >
              Unblock
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
