import { MagnifyingGlassIcon, NotePencilIcon } from '@phosphor-icons/react';
import {
  isMuted,
  peerOf,
  qk,
  updateConversationPreferences,
  type SecureConversation,
} from '@vybora/api';
import { chatRowPreview, formatRowTime, receiptOf, usernameFromAddParam } from '@vybora/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { useA11y } from '@/features/a11y/A11yProvider';
import { useMe } from '@/features/auth/AuthProvider';
import { AddFriendLink, NoChatsEmpty, NoResultsEmpty } from '@/features/onboarding/EmptyStates';
import { GetStarted } from '@/features/onboarding/GetStarted';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { ChatRowMenu } from './ChatRowParts';
import { ChatRowView } from './ChatRowView';
import { useConnect } from './ConnectProvider';
import {
  conversationTitle,
  useInboxTyping,
  useNicknames,
  useOnlinePeers,
  usePreviews,
  useSecureInbox,
} from './hooks';
import { NewChatDialog } from './NewChatDialog';

type Filter = 'all' | 'unread' | 'groups' | 'pinned' | 'archived';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'archived', label: 'Archived' },
];

/** "No chats yet", "No one by that name", or a plain line for an empty filter. */
function InboxEmpty({
  term,
  filter,
  hasChats,
  onCompose,
}: {
  term: string;
  filter: Filter;
  hasChats: boolean;
  onCompose: () => void;
}) {
  if (term)
    return (
      <NoResultsEmpty
        headingLevel={2}
        action={<AddFriendLink username={usernameFromAddParam(term)} variant="outline" size="sm" />}
      />
    );
  if (filter === 'all' && !hasChats) return <NoChatsEmpty onCompose={onCompose} />;
  return (
    <p className="px-8 py-12 text-center text-sm text-muted">
      {filter === 'all' ? 'No chats here' : `No ${filter} chats`}
    </p>
  );
}

/** Short, fixed-width timestamp for list rows. */
export function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (now.getTime() - d.getTime() < 6 * 86_400_000)
    return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function InboxPane({
  activeId,
  composeSignal,
  onComposeHandled,
  searchRef,
}: {
  activeId?: string;
  composeSignal: number;
  /** Reset the signal so a later remount (e.g. back from Settings) doesn’t reopen the dialog. */
  onComposeHandled: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { userId } = useMe();
  const { engine } = useConnect();
  const qc = useQueryClient();
  const toast = useToast();
  const inbox = useSecureInbox();
  const nicknames = useNicknames();
  const [filter, setFilter] = useState<Filter>('all');
  const [term, setTerm] = useState('');
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!composeSignal) return;
    setComposing(true);
    onComposeHandled();
  }, [composeSignal, onComposeHandled]);

  const convs = useMemo(() => inbox.data ?? [], [inbox.data]);
  const previews = usePreviews(convs.map((c) => c.id));
  const { prefs: a11y } = useA11y();
  const recentIds = useMemo(
    () =>
      [...convs]
        .filter((c) => c.id !== activeId && !c.archived)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .slice(0, 20)
        .map((c) => c.id),
    [convs, activeId],
  );
  const typing = useInboxTyping(recentIds, !!engine);
  const memberName = (c: SecureConversation, uid: string) => {
    const m = c.members.find((x) => x.id === uid);
    return nicknames.data?.[uid] ?? (m?.display_name || m?.username || 'Someone');
  };
  const peerIds = useMemo(
    () => convs.flatMap((c) => (c.kind === 'direct' ? [peerOf(c, userId)?.id ?? ''] : [])),
    [convs, userId],
  );
  const shownOnline = useOnlinePeers(peerIds);

  const visible = useMemo(() => {
    const t = term.trim().toLowerCase();
    return convs
      .filter((c) => (filter === 'archived' ? c.archived : !c.archived))
      .filter((c) =>
        filter === 'unread'
          ? c.unreadCount > 0
          : filter === 'groups'
            ? c.kind === 'group'
            : filter === 'pinned'
              ? c.pinned
              : true,
      )
      .filter(
        (c) =>
          !t ||
          conversationTitle(c, userId, nicknames.data).toLowerCase().includes(t) ||
          c.members.some((m) => m.username.toLowerCase().includes(t)),
      )
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt),
      );
  }, [convs, filter, term, userId, nicknames.data]);

  const prefs = (
    c: SecureConversation,
    patch: Parameters<typeof updateConversationPreferences>[3],
  ) =>
    void updateConversationPreferences(supabase, userId, c.id, patch).then(
      () => qc.invalidateQueries({ queryKey: qk.connect.inbox }),
      () => toast.show('Couldn’t update this chat. Check your connection and try again.', 'error'),
    );

  const archive = (c: SecureConversation) => {
    const next = !c.archived;
    prefs(c, { archived: next });
    if (next)
      toast.show('Archived', 'success', {
        label: 'Undo',
        onClick: () => prefs(c, { archived: false }),
      });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
        <h1 className="type-wide text-lg font-semibold">Chats</h1>
        <Tip label="New message" shortcut="Alt N">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setComposing(true)}
            aria-label="New message"
          >
            <NotePencilIcon size={20} />
          </Button>
        </Tip>
      </header>

      <div className="shrink-0 px-3 pt-3">
        {/* The wrapper carries the focus ring so the input itself needs none. */}
        <label className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <MagnifyingGlassIcon size={16} className="text-subtle" aria-hidden="true" />
          <input
            ref={searchRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded-sm border border-line px-1.5 font-mono text-[10px] text-subtle lg:inline">
            /
          </kbd>
        </label>
        <div
          className="scrollbar-none mt-2 flex gap-4 overflow-x-auto border-b border-line px-1"
          role="tablist"
          aria-label="Filter chats"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                '-mb-px shrink-0 border-b-2 py-2 text-[13px] font-medium transition-colors duration-150',
                filter === f.id
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" aria-busy={inbox.isPending}>
        {inbox.isPending && (
          <ul className="space-y-1 p-3" aria-label="Loading chats">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <div className="skeleton h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-32 rounded-sm" />
                  <div className="skeleton h-3 w-48 rounded-sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {inbox.isError && (
          <div className="px-6 py-10 text-center text-sm text-muted" role="alert">
            Couldn’t load your chats.{' '}
            <button
              type="button"
              className="font-semibold text-accent underline-offset-2 hover:underline"
              onClick={() => void inbox.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {inbox.isSuccess && filter === 'all' && !term && (
          <GetStarted
            previews={previews.data}
            previewsReady={convs.length === 0 || previews.isSuccess}
            onSayHi={() => setComposing(true)}
            onDismissed={() => searchRef.current?.focus()}
          />
        )}
        {inbox.isSuccess && visible.length === 0 && (
          <InboxEmpty
            term={term.trim()}
            filter={filter}
            hasChats={convs.some((c) => !c.archived)}
            onCompose={() => setComposing(true)}
          />
        )}
        <ul className="py-1">
          {visible.map((c) => {
            const peer = peerOf(c, userId);
            const title = conversationTitle(c, userId, nicknames.data);
            const last = previews.data?.[c.id];
            const preview = chatRowPreview(last, {
              myUserId: userId,
              isGroup: c.kind === 'group',
              typingUserIds: typing[c.id] ?? [],
              nameOf: (uid) => memberName(c, uid),
              receipt: last ? receiptOf(last, userId, c.members) : undefined,
            });
            const muted = isMuted(c) || !c.notificationsEnabled;
            return (
              <ChatRowView
                key={c.id}
                to={`/messages/${c.id}`}
                title={title}
                avatar={
                  c.kind === 'group' ? (
                    <GroupAvatar members={c.members.filter((m) => m.id !== userId)} size={48} />
                  ) : (
                    <Avatar
                      path={peer?.avatar_path}
                      name={peer?.username ?? '?'}
                      userId={peer?.id ?? c.id}
                      displayName={peer?.display_name}
                      size={48}
                    />
                  )
                }
                online={!!peer && shownOnline.has(peer.id)}
                time={formatRowTime(last?.createdAt ?? c.lastMessageAt, new Date())}
                preview={engine ? preview : null}
                unreadCount={c.unreadCount}
                pinned={c.pinned}
                archived={c.archived}
                muted={muted}
                active={activeId === c.id}
                alwaysShowActions={a11y.alwaysShowActions}
                onPin={() => prefs(c, { pinned: !c.pinned })}
                onArchive={() => archive(c)}
                wrapLink={(link) => (
                  <ChatRowMenu
                    conv={c}
                    title={title}
                    onPrefs={(p) => prefs(c, p)}
                    onArchive={() => archive(c)}
                  >
                    {link}
                  </ChatRowMenu>
                )}
              />
            );
          })}
        </ul>
        <p className="px-4 pb-4 pt-2 text-xs text-muted">
          Chats from before end-to-end encryption are in{' '}
          <Link
            to="/messages/legacy"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            legacy messages
          </Link>
          .
        </p>
      </div>
      <NewChatDialog open={composing} onClose={() => setComposing(false)} />
    </div>
  );
}
