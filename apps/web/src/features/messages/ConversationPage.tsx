import { ArrowLeftIcon, LockSimpleIcon, TrashIcon, WifiSlashIcon } from '@phosphor-icons/react';
import {
  createSecureConversation,
  deleteMessage,
  fetchConversationPeer,
  fetchMessages,
  markConversationRead,
  MESSAGE_PAGE,
  qk,
  subscribeToConversation,
} from '@vybora/api';
import { formatRelativeTimeLong, friendlyError } from '@vybora/core';
import type { Message } from '@vybora/types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAppLocked } from '@/features/applock/lockState';
import { useMe } from '@/features/auth/AuthProvider';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

type Pages = InfiniteData<Message[], { created_at: string; id: string } | null>;

function Attachment({ path, mine }: { path: string; mine: boolean }) {
  // Short-lived signed URL; the `dm` bucket is private.
  const { data: url, isError } = useSignedUrl(path, 'dm');
  if (isError) return <p className="text-xs italic text-muted">Image unavailable</p>;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt="Shared image"
        loading="lazy"
        className={cn('max-h-72 rounded-md border border-line object-cover', mine && 'ml-auto')}
      />
    </a>
  ) : (
    <div className="skeleton h-48 w-48 rounded-md" />
  );
}

/**
 * Read-only view of a pre-encryption conversation. New messages must go through
 * an end-to-end encrypted chat; the sender can still unsend old messages.
 */
export default function ConversationPage() {
  const { conversationId = '' } = useParams();
  const { userId } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>(
    'connecting',
  );
  const [unsending, setUnsending] = useState<Message | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const key = qk.messages(conversationId);

  const peer = useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: () => fetchConversationPeer(supabase, conversationId, userId),
  });
  const messages = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchMessages(supabase, conversationId, pageParam),
    initialPageParam: null as { created_at: string; id: string } | null,
    getNextPageParam: (last) =>
      last.length < MESSAGE_PAGE
        ? null
        : { created_at: last[last.length - 1]!.created_at, id: last[last.length - 1]!.id },
  });

  // Newest-first pages → chronological list for display.
  const list = (messages.data?.pages.flat() ?? []).slice().reverse();

  // Nothing is marked read while the app lock is up; unlocking re-runs this once.
  const locked = useAppLocked();
  const markRead = useCallback(() => {
    if (locked || document.visibilityState !== 'visible' || !messages.isSuccess) return;
    void markConversationRead(supabase, conversationId).then(() => {
      void qc.invalidateQueries({ queryKey: qk.unread });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    });
  }, [locked, conversationId, messages.isSuccess, qc]);

  useEffect(() => {
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [markRead]);

  // Realtime keeps unsends (and any message the other side still sends) in sync.
  useEffect(() => {
    let hadConnection = false;
    const unsubscribe = subscribeToConversation(supabase, conversationId, {
      onInsert: () => void qc.invalidateQueries({ queryKey: key }),
      onDelete: (id) =>
        qc.setQueryData<Pages>(key, (data) =>
          data ? { ...data, pages: data.pages.map((p) => p.filter((m) => m.id !== id)) } : data,
        ),
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          if (hadConnection) void qc.invalidateQueries({ queryKey: key });
          hadConnection = true;
          setConnection('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('reconnecting');
        }
      },
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  const other = peer.data?.other;
  const continueSecurely = useMutation({
    mutationFn: () => createSecureConversation(supabase, 'direct', [other!.id]),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      navigate(`/messages/${id}`);
    },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  });

  return (
    <div className="flex h-full w-full">
      <section className="flex min-w-0 flex-1 flex-col bg-bg" aria-label="Legacy conversation">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-2 md:px-4">
          <Link
            to="/messages/legacy"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-ink md:hidden"
            aria-label="Back to legacy messages"
          >
            <ArrowLeftIcon size={20} />
          </Link>
          {other ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                path={other.avatar_path}
                name={other.username}
                userId={other.id}
                displayName={other.display_name}
                size={34}
              />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-semibold">{other.username}</p>
                <p className="font-mono text-[11px] text-warning">
                  legacy · not end-to-end encrypted
                </p>
              </div>
            </div>
          ) : (
            <div className="skeleton h-9 w-40 rounded-md" />
          )}
          {connection === 'reconnecting' && (
            <span
              className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted"
              role="status"
            >
              <WifiSlashIcon size={13} aria-hidden="true" /> reconnecting
            </span>
          )}
        </header>

        <div
          ref={scroller}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (el.scrollTop < 60 && messages.hasNextPage && !messages.isFetchingNextPage)
              void messages.fetchNextPage();
          }}
        >
          {messages.isFetchingNextPage && (
            <div className="flex justify-center py-2 text-accent">
              <Spinner size={18} label="Loading earlier messages" />
            </div>
          )}
          {messages.isPending && (
            <div className="flex justify-center py-10 text-accent">
              <Spinner label="Loading messages" />
            </div>
          )}
          {messages.isError && (
            <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
          )}
          {messages.isSuccess && list.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">No messages in this chat.</p>
          )}
          <ol className="space-y-1.5">
            {list.map((m) => {
              const mine = m.sender_id === userId;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'group flex items-end gap-1',
                    mine ? 'justify-end' : 'justify-start',
                  )}
                >
                  {mine && (
                    <button
                      type="button"
                      aria-label="Unsend message"
                      title="Unsend"
                      className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-subtle opacity-0 hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      onClick={() => setUnsending(m)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                  <div className="max-w-[75%]" title={formatRelativeTimeLong(m.created_at)}>
                    {m.attachment_path && <Attachment path={m.attachment_path} mine={mine} />}
                    {m.body && (
                      <p
                        className={cn(
                          'break-anywhere whitespace-pre-wrap rounded-lg px-3 py-2 text-[15px]',
                          mine
                            ? 'rounded-br-sm bg-surface-strong'
                            : 'rounded-bl-sm border border-line bg-surface',
                        )}
                      >
                        {m.body}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="pb-safe flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3">
          <LockSimpleIcon size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-muted">
            This chat is read-only. Continue the conversation with end-to-end encryption.
          </p>
          <Button
            size="sm"
            disabled={!other}
            loading={continueSecurely.isPending}
            onClick={() => continueSecurely.mutate()}
          >
            Continue in encrypted chat
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={!!unsending}
        onClose={() => setUnsending(null)}
        title="Unsend message?"
        description="It will be removed for both of you."
        confirmLabel="Unsend"
        danger
        onConfirm={() => {
          const m = unsending!;
          setUnsending(null);
          void deleteMessage(supabase, m.id).catch((e) => toast.show(friendlyError(e), 'error'));
        }}
      />
    </div>
  );
}
