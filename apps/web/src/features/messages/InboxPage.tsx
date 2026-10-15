import { ArrowLeftIcon, ChatCircleIcon } from '@phosphor-icons/react';
import { fetchConversations, qk } from '@vybora/api';
import { truncate } from '@vybora/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useMe } from '@/features/auth/AuthProvider';
import { listTime } from '@/features/connect/InboxPane';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

/**
 * Pre-encryption (legacy) conversations: protected by access control only.
 * Kept readable; new conversations are always end-to-end encrypted.
 */
export function ConversationList({ activeId }: { activeId?: string }) {
  const { userId } = useMe();
  const q = useQuery({ queryKey: qk.conversations, queryFn: () => fetchConversations(supabase) });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
        <Link
          to="/messages"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Back to encrypted chats"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <h1 className="text-[17px] font-semibold">Legacy messages</h1>
      </header>
      <p className="border-b border-line bg-warning-soft px-4 py-2.5 text-xs leading-relaxed">
        These chats predate end-to-end encryption and are protected by access control only. Start
        new conversations from Chats.
      </p>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {q.isPending && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        )}
        {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
        {q.data?.length === 0 && (
          <EmptyState
            icon={<ChatCircleIcon size={22} />}
            title="No legacy chats"
            body="You have no conversations from before encryption."
          />
        )}
        <ul>
          {q.data?.map((c) => {
            const preview = c.last_message_body
              ? truncate(c.last_message_body, 60)
              : c.last_message_has_attachment
                ? 'Photo'
                : 'No messages';
            const mine = c.last_message_sender === userId;
            const active = activeId === c.conversation_id;
            return (
              <li key={c.conversation_id}>
                <Link
                  to={`/messages/legacy/${c.conversation_id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-150',
                    active ? 'bg-surface-strong' : 'hover:bg-surface-muted',
                  )}
                >
                  {active && (
                    <span
                      className="absolute inset-y-0 left-0 w-0.5 bg-accent"
                      aria-hidden="true"
                    />
                  )}
                  <Avatar
                    path={c.other_avatar_path}
                    name={c.other_username ?? 'Deleted account'}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-[15px]',
                          c.unread_count ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {c.other_username ?? 'Unavailable account'}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-subtle">
                        {listTime(c.last_message_at)}
                      </span>
                    </p>
                    <p
                      className={cn(
                        'truncate text-[13px]',
                        c.unread_count ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {mine && 'You: '}
                      {preview}
                    </p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-accent px-1 font-mono text-[11px] text-on-accent">
                      {c.unread_count}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Content pane for /messages/legacy (the list itself lives in the workspace list pane). */
export default function InboxPage() {
  return (
    <div className="hidden flex-1 md:flex">
      <EmptyState
        className="m-auto"
        icon={<ChatCircleIcon size={22} />}
        title="Legacy messages"
        body="Select a chat to read it. New conversations are always end-to-end encrypted."
      />
    </div>
  );
}
