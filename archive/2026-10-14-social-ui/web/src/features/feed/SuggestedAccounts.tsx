import { fetchSuggested, follow, qk } from '@vybora/api';
import { formatCount, friendlyError } from '@vybora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function SuggestedAccounts({
  limit = 6,
  title = 'Suggested for you',
}: {
  limit?: number;
  title?: string;
}) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [followed, setFollowed] = useState<Record<string, 'accepted' | 'pending'>>({});
  const { data, isPending } = useQuery({
    queryKey: [...qk.suggested, limit],
    queryFn: () => fetchSuggested(supabase, limit),
  });

  const followMut = useMutation({
    mutationFn: (id: string) => follow(supabase, userId!, id),
    onSuccess: (status, id) => {
      setFollowed((f) => ({ ...f, [id]: status }));
      void qc.invalidateQueries({ queryKey: qk.feed.home });
      void qc.invalidateQueries({ queryKey: qk.stories.tray });
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }
  if (!data?.length) return null;

  return (
    <section aria-labelledby="suggested-title">
      <h2 id="suggested-title" className="mb-3 text-sm font-semibold text-muted">
        {title}
      </h2>
      <ul className="space-y-3">
        {data.map((u) => (
          <li key={u.id} className="flex items-center gap-3">
            <Link to={`/u/${u.username}`}>
              <Avatar path={u.avatar_path} name={u.username} size={40} />
            </Link>
            <div className="min-w-0 flex-1 leading-tight">
              <Link
                to={`/u/${u.username}`}
                className="block truncate text-sm font-semibold hover:underline"
              >
                {u.username}
              </Link>
              <span className="text-xs text-subtle">
                {formatCount(u.followers_count ?? 0)} followers
              </span>
            </div>
            <Button
              size="sm"
              variant={followed[u.id] ? 'secondary' : 'primary'}
              disabled={!!followed[u.id]}
              loading={followMut.isPending && followMut.variables === u.id}
              onClick={() => followMut.mutate(u.id)}
            >
              {followed[u.id] === 'pending' ? 'Requested' : followed[u.id] ? 'Following' : 'Follow'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
