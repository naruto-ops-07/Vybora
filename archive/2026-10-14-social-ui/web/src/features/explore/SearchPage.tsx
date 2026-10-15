import { qk, searchHashtags, searchProfiles } from '@vybora/api';
import { formatCount } from '@vybora/core';
import { useQuery } from '@tanstack/react-query';
import { Hash, Lock, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { SuggestedAccounts } from '@/features/feed/SuggestedAccounts';
import { supabase } from '@/lib/supabase';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const deferred = useDeferredValue(term.trim());
  const isTag = deferred.startsWith('#');

  useEffect(() => {
    const t = setTimeout(() => setParams(deferred ? { q: deferred } : {}, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [deferred, setParams]);

  const people = useQuery({
    queryKey: qk.search(deferred),
    queryFn: () => searchProfiles(supabase, deferred),
    enabled: deferred.length > 0 && !isTag,
  });
  const tags = useQuery({
    queryKey: qk.hashtagSearch(deferred),
    queryFn: () => searchHashtags(supabase, deferred),
    enabled: deferred.length > 0,
  });

  return (
    <div className="mx-auto max-w-[600px] px-4 py-6">
      <h1 className="mb-4 font-display text-3xl font-semibold">Search</h1>
      <Input
        type="search"
        autoFocus
        placeholder="Search usernames, names or #tags"
        aria-label="Search"
        leading={<Search size={16} />}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {!deferred && (
        <div className="mt-8">
          <SuggestedAccounts limit={8} title="People you might like" />
        </div>
      )}

      {deferred && (
        <div className="mt-6 space-y-8">
          {!isTag && (
            <section aria-labelledby="people-h">
              <h2 id="people-h" className="mb-3 text-sm font-semibold text-muted">
                Accounts
              </h2>
              {people.isPending && <Skeleton className="h-14" />}
              {people.isError && (
                <ErrorState error={people.error} onRetry={() => void people.refetch()} />
              )}
              {people.data?.length === 0 && (
                <p className="text-sm text-subtle">No accounts match “{deferred}”.</p>
              )}
              <ul className="space-y-1">
                {people.data?.map((u) => (
                  <li key={u.id}>
                    <Link
                      to={`/u/${u.username}`}
                      className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-muted"
                    >
                      <Avatar path={u.avatar_path} name={u.username} size={44} />
                      <div className="min-w-0 leading-tight">
                        <p className="flex items-center gap-1 truncate text-sm font-semibold">
                          {u.username}{' '}
                          {u.is_private && <Lock size={12} aria-label="Private account" />}
                        </p>
                        <p className="truncate text-sm text-muted">
                          {u.display_name}
                          {u.display_name && ' · '}
                          {formatCount(u.followers_count ?? 0)} followers
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="tags-h">
            <h2 id="tags-h" className="mb-3 text-sm font-semibold text-muted">
              Hashtags
            </h2>
            {tags.isPending && <Skeleton className="h-14" />}
            {tags.data?.length === 0 && <p className="text-sm text-subtle">No hashtags match.</p>}
            <ul className="space-y-1">
              {tags.data?.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/tags/${t.tag}`}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-muted"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong">
                      <Hash size={18} />
                    </span>
                    <div className="leading-tight">
                      <p className="text-sm font-semibold">#{t.tag}</p>
                      <p className="text-sm text-muted">{formatCount(t.post_count)} posts</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {people.data?.length === 0 && tags.data?.length === 0 && (
            <EmptyState title="No results" body="Try a different spelling or a shorter search." />
          )}
        </div>
      )}
    </div>
  );
}
