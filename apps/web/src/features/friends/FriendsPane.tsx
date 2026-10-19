import {
  ChatCircleIcon,
  CheckCircleIcon,
  DotsThreeIcon,
  InfoIcon,
  UserMinusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  directChatActivity,
  qk,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
} from '@vybora/api';
import {
  addFriendErrorNotice,
  addFriendResultNotice,
  formatRelativeTime,
  formatRelativeTimeLong,
  normalizeUsername,
  usernameFromAddParam,
  type AddFriendNotice,
} from '@vybora/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { menuContentClass, menuDangerItemClass, menuItemClass } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { Tip } from '@/components/ui/Tooltip';
import { useA11y } from '@/features/a11y/A11yProvider';
import { useMe } from '@/features/auth/AuthProvider';
import { useOnlinePeers, useSecureInbox } from '@/features/connect/hooks';
import { Meta } from '@/features/connect/ui';
import { FriendsEmpty } from '@/features/onboarding/EmptyStates';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { FriendJoinedCard, joinedText } from './FriendJoined';
import { HandleCard } from './HandleCard';
import { nameOf, useFriendActions, useFriendRequests, useFriends, useMessageFriend } from './hooks';

/** The friendship the joined card is for (or waiting to show). */
interface Joined {
  /** Bumped for every new friendship: restarts the slide. */
  run: number;
  userId?: string;
  username: string;
  displayName: string | null;
  /** I accepted their request, or my `send` found theirs waiting. */
  via: 'accept' | 'send';
  /** When the friends query had last settled, as it happened. */
  settles: number;
  /** The card has been up. */
  shown: boolean;
}

const NOTICE_ICON = {
  success: <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />,
  info: <InfoIcon size={16} aria-hidden="true" />,
  error: <WarningCircleIcon size={16} aria-hidden="true" />,
};

/**
 * Exact-username friend request with a per-outcome inline message. When they
 * had already asked me (`accepted`), the message says so at once and
 * `onAccepted` asks for the joined card; once that card is up it replaces the
 * message (`acceptedReplaced` changes), and if it never comes the message stays.
 */
function AddFriendForm({
  inputRef,
  onAccepted,
  acceptedReplaced,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  onAccepted?: (username: string) => void;
  /** Bumped when the joined card takes over from the `accepted` message. */
  acceptedReplaced?: number;
}) {
  const qc = useQueryClient();
  const location = useLocation();
  const [params] = useSearchParams();
  const local = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState<AddFriendNotice | null>(null);
  // The `accepted` message, so only it (not a later one) gives way to the card.
  const acceptedNotice = useRef<AddFriendNotice | null>(null);
  useEffect(() => {
    if (acceptedReplaced) setNotice((n) => (n && n === acceptedNotice.current ? null : n));
  }, [acceptedReplaced]);
  const headingId = useId();
  const noticeId = useId();
  const username = normalizeUsername(value);

  // Command menu → "Add a friend" lands here with the field focused. Deferred
  // so it wins over the closing menu restoring focus to where it was opened.
  const focusAsked = !!(location.state as { focusAddFriend?: boolean } | null)?.focusAddFriend;
  useEffect(() => {
    if (!focusAsked) return;
    const t = setTimeout(() => local.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [focusAsked, location.key]);

  // A shared link (`/friends?add=maya`) fills the field and focuses it. It never
  // sends: the request goes only when the person presses Send request.
  const prefill = usernameFromAddParam(params.get('add'));
  useEffect(() => {
    if (!prefill) return;
    setValue(prefill);
    setNotice(null);
    const t = setTimeout(() => {
      const el = local.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    return () => clearTimeout(t);
  }, [prefill, location.key]);

  const send = useMutation({
    mutationFn: (u: string) => sendFriendRequest(supabase, u),
    onSuccess: (result, u) => {
      const next = addFriendResultNotice(result, u);
      setNotice(next);
      if (result === 'accepted') {
        acceptedNotice.current = next;
        onAccepted?.(u);
      }
      setValue('');
      void qc.invalidateQueries({ queryKey: qk.connect.friendRequests });
      if (result === 'accepted') void qc.invalidateQueries({ queryKey: qk.connect.friends });
    },
    onError: (e) => setNotice(addFriendErrorNotice(e)),
  });

  const invalid = notice?.tone === 'error';
  return (
    <form
      aria-labelledby={headingId}
      className="shrink-0 border-b border-line px-3 pb-3 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!username || send.isPending) return;
        setNotice(null);
        send.mutate(username);
      }}
    >
      <h2 id={headingId} className="mb-1.5 px-1 text-[13px] font-semibold text-muted">
        Add a friend
      </h2>
      <div className="flex gap-2">
        {/* The wrapper carries the focus ring so the input itself needs none. */}
        <label
          className={cn(
            'flex h-10 min-w-0 flex-1 items-center gap-0.5 rounded-md border bg-surface px-3 focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
            invalid ? 'border-danger' : 'border-line-strong',
          )}
        >
          <span className="font-mono text-sm text-subtle" aria-hidden="true">
            @
          </span>
          <input
            ref={(el) => {
              local.current = el;
              if (inputRef) inputRef.current = el;
            }}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (notice) setNotice(null);
            }}
            aria-label="Friend’s username"
            aria-invalid={invalid || undefined}
            aria-describedby={noticeId}
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            maxLength={40}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </label>
        <Button type="submit" disabled={!username} loading={send.isPending}>
          Send request
        </Button>
      </div>
      <div
        id={noticeId}
        role="status"
        className={cn(
          'flex items-start gap-1.5 px-1 text-[13px] leading-snug',
          notice && 'mt-2',
          notice?.tone === 'success' && 'text-success',
          notice?.tone === 'info' && 'text-muted',
          notice?.tone === 'error' && 'text-danger',
        )}
      >
        {notice && (
          <>
            <span className="mt-px shrink-0">{NOTICE_ICON[notice.tone]}</span>
            <span>{notice.text}</span>
          </>
        )}
      </div>
      {!notice && (
        <p className="mt-2 px-1 text-xs text-muted">
          Usernames are exact. Ask your friend for theirs.
        </p>
      )}
    </form>
  );
}

export function PersonRow({
  person,
  online,
  detail,
  actions,
  avatarSize = 40,
}: {
  person: Pick<Friend, 'userId' | 'username' | 'displayName' | 'avatarPath'>;
  online?: boolean;
  detail?: ReactNode;
  actions: ReactNode;
  avatarSize?: number;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="relative shrink-0">
        <Avatar
          path={person.avatarPath}
          name={person.username}
          userId={person.userId}
          displayName={person.displayName}
          size={avatarSize}
        />
        {online && (
          <span
            role="img"
            aria-label="Online"
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-msg block truncate font-medium">
          {person.displayName || person.username}
        </span>
        <span className="text-msg-sm flex min-w-0 items-center gap-1.5 text-muted">
          <span className="truncate">@{person.username}</span>
          {detail}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">{actions}</span>
    </div>
  );
}

function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(menuItemClass, danger && menuDangerItemClass)}
    >
      {children}
    </ContextMenu.Item>
  );
}

/** Right-click (or the ⋯ button) on a friend: message or remove. */
function FriendMenu({
  children,
  name,
  onMessage,
  onRemove,
}: {
  children: ReactNode;
  name: string;
  onMessage: () => void;
  onRemove: () => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`Actions for ${name}`}
          collisionPadding={8}
          className={menuContentClass}
        >
          <MenuItem onSelect={onMessage}>
            <ChatCircleIcon size={16} aria-hidden="true" />
            Message
          </MenuItem>
          <MenuItem onSelect={onRemove} danger>
            <UserMinusIcon size={16} aria-hidden="true" />
            Remove friend
          </MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Opens the row's context menu from a button, anchored near the button. */
function openRowMenu(button: HTMLElement) {
  const row = button.closest<HTMLElement>('[data-friend-row]');
  const r = button.getBoundingClientRect();
  row?.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: r.left,
      clientY: r.bottom,
    }),
  );
}

/**
 * A row is about to disappear (optimistically): move keyboard focus to the
 * neighbouring row's first control, or to `fallback`, so focus is never lost.
 */
function focusNeighbour(from: Element | null | undefined, fallback: HTMLElement | null) {
  const li = from?.closest('li');
  const sibling = li?.nextElementSibling ?? li?.previousElementSibling;
  const target = sibling?.querySelector<HTMLElement>('button') ?? fallback;
  // Deferred so it wins over a closing dialog or menu restoring focus.
  setTimeout(() => target?.focus(), 0);
}

function SectionHeading({
  id,
  children,
  headingRef,
}: {
  id: string;
  children: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <h2
      id={id}
      ref={headingRef}
      tabIndex={headingRef ? -1 : undefined}
      className="px-4 pb-1 pt-4 text-[13px] font-semibold text-muted outline-none"
    >
      {children}
    </h2>
  );
}

function Skeleton() {
  return (
    <ul className="space-y-1 px-4 py-2" aria-label="Loading friends">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 py-2">
          <div className="skeleton h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-28 rounded-sm" />
            <div className="skeleton h-3 w-20 rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Retry({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <p className="px-6 py-6 text-center text-sm text-muted" role="alert">
      {children}{' '}
      <button
        type="button"
        className="touch-target inline-flex items-center justify-center font-semibold text-accent underline-offset-2 hover:underline"
        onClick={onRetry}
      >
        Try again
      </button>
    </p>
  );
}

/**
 * Friends list pane: add by username, pending requests both ways, and friends
 * with presence, one-tap Message and Remove.
 */
export function FriendsPane({ inputRef }: { inputRef?: RefObject<HTMLInputElement | null> }) {
  const friends = useFriends();
  const requests = useFriendRequests();
  const toast = useToast();
  // A new friendship: one card at a time, the latest wins. `run` restarts its slide.
  const [joined, setJoined] = useState<Joined | null>(null);
  // When the friends query last settled (data or error), to tell a fetch that
  // finished after the friendship from one that finished before it.
  const settles = Math.max(friends.dataUpdatedAt, friends.errorUpdatedAt);
  const settlesRef = useRef(settles);
  settlesRef.current = settles;
  const join = (who: Pick<Joined, 'userId' | 'username' | 'displayName' | 'via'>) =>
    setJoined((j) => ({
      run: (j?.run ?? 0) + 1,
      ...who,
      settles: settlesRef.current,
      shown: false,
    }));
  const { respond, cancel, remove } = useFriendActions({
    onAccepted: (r) =>
      join({ userId: r.userId, username: r.username, displayName: r.displayName, via: 'accept' }),
  });
  const message = useMessageFriend();
  const { reduceMotion } = useA11y();
  const joinedRef = useRef<HTMLDivElement>(null);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const requestsId = useId();
  const friendsId = useId();
  const friendsHeading = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const list = useMemo(() => friends.data ?? [], [friends.data]);
  // Presence is shared only between people who have a chat, so watch just the
  // friends I have a direct chat with (from the inbox cache): no denied subscriptions.
  const { userId, profile } = useMe();
  const inbox = useSecureInbox();
  const chatPeers = useMemo(() => directChatActivity(inbox.data, userId), [inbox.data, userId]);
  const online = useOnlinePeers(
    useMemo(() => list.map((f) => f.userId).filter((id) => id in chatPeers), [list, chatPeers]),
  );
  // The card shows once they're in my friends list (at once when I accept; after
  // the refetch when `send` comes back `accepted`).
  const joinedFriend = joined
    ? list.find((f) =>
        joined.userId ? f.userId === joined.userId : f.username === joined.username.toLowerCase(),
      )
    : undefined;
  const joinedRun = joinedFriend ? joined!.run : 0;
  const friendsSettled = !friends.isFetching && settles > (joined?.settles ?? Infinity);
  useEffect(() => {
    if (!joined) return;
    if (joinedFriend) {
      if (!joined.shown) setJoined({ ...joined, shown: true });
      return;
    }
    // Shown and since gone (removed), or never found once the friends list came
    // back (or failed): drop it, so a later refetch can't pop up a stale card.
    if (!joined.shown && !friendsSettled) return;
    setJoined(null);
    // No card, so say it another way: the add form's message already does for
    // `send`; an accepted request gets the toast it had before the card.
    if (!joined.shown && joined.via === 'accept')
      toast.show(
        `You and ${joined.displayName || `@${joined.username}`} are now friends`,
        'success',
      );
  }, [joined, joinedFriend, friendsSettled, toast]);
  // Bring it into view without taking focus from what I just pressed.
  useEffect(() => {
    if (joinedRun)
      joinedRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
  }, [joinedRun, reduceMotion]);
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const now = new Date();
  const when = (r: FriendRequest) =>
    r.createdAt ? (
      <>
        <span aria-hidden="true">·</span>
        <Meta className="shrink-0">
          <span aria-hidden="true">{formatRelativeTime(r.createdAt, now)}</span>
          <span className="sr-only">{formatRelativeTimeLong(r.createdAt, now)}</span>
        </Meta>
      </>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-4">
        <h1 className="type-wide text-lg font-semibold">Friends</h1>
      </header>
      <AddFriendForm
        inputRef={inputRef}
        onAccepted={(username) => join({ username, displayName: null, via: 'send' })}
        acceptedReplaced={joined?.via === 'send' ? joinedRun : 0}
      />
      {/* Polite, and always present so the change is heard. Only for an accept:
          after `send`, the add form's message has already said it. */}
      <p className="sr-only" aria-live="polite" data-joined-status="">
        {joinedFriend && joined?.via === 'accept' ? joinedText(joinedFriend) : ''}
      </p>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-4">
        {joinedFriend && profile && (
          <div ref={joinedRef} className="px-3 pt-3">
            <FriendJoinedCard
              me={{
                userId: profile.id,
                username: profile.username,
                displayName: profile.display_name,
                avatarPath: profile.avatar_path,
              }}
              friend={joinedFriend}
              animate={!reduceMotion}
              run={joinedRun}
              sayingHi={message.pendingId === joinedFriend.userId}
              onSayHi={() => message.open(joinedFriend)}
              onDismiss={() => {
                setJoined(null);
                // The card held focus (its X); hand it to the list it sat above.
                friendsHeading.current?.focus();
              }}
            />
          </div>
        )}
        {requests.isError && !requests.data && (
          <Retry onRetry={() => void requests.refetch()}>Couldn’t load friend requests.</Retry>
        )}
        {incoming.length + outgoing.length > 0 && (
          <section>
            <SectionHeading id={requestsId}>
              Requests <span aria-hidden="true">·</span>{' '}
              <Meta className="ml-0.5">{incoming.length + outgoing.length}</Meta>
            </SectionHeading>
            <ul aria-label="Requests">
              {incoming.map((r) => {
                const name = r.displayName || r.username;
                return (
                  <li key={`in-${r.userId}`}>
                    <PersonRow
                      person={r}
                      detail={when(r)}
                      actions={
                        <>
                          <Button
                            size="sm"
                            className="touch-target"
                            aria-label={`Accept request from ${name}`}
                            onClick={(e) => {
                              focusNeighbour(e.currentTarget, friendsHeading.current);
                              respond.mutate({ request: r, accept: true });
                            }}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="touch-target"
                            aria-label={`Decline request from ${name}`}
                            onClick={(e) => {
                              focusNeighbour(e.currentTarget, friendsHeading.current);
                              respond.mutate({ request: r, accept: false });
                            }}
                          >
                            Decline
                          </Button>
                        </>
                      }
                    />
                  </li>
                );
              })}
              {outgoing.map((r) => {
                const name = r.displayName || r.username;
                return (
                  <li key={`out-${r.userId}`}>
                    <PersonRow
                      person={r}
                      detail={
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">Pending</span>
                        </>
                      }
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          className="touch-target"
                          aria-label={`Cancel request to ${name}`}
                          onClick={(e) => {
                            focusNeighbour(e.currentTarget, friendsHeading.current);
                            cancel.mutate(r);
                          }}
                        >
                          Cancel
                        </Button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-busy={friends.isPending}>
          <SectionHeading id={friendsId} headingRef={friendsHeading}>
            Friends
            {friends.isSuccess && (
              <>
                {' '}
                <span aria-hidden="true">·</span> <Meta className="ml-0.5">{list.length}</Meta>
              </>
            )}
          </SectionHeading>
          {friends.isPending && <Skeleton />}
          {friends.isError && (
            <Retry onRetry={() => void friends.refetch()}>Couldn’t load your friends.</Retry>
          )}
          {friends.isSuccess && list.length === 0 && <FriendsEmpty handle={<HandleCard />} />}
          {list.length > 0 && (
            <ul aria-label="Friends" ref={listRef}>
              {list.map((f) => {
                const name = f.displayName || f.username;
                return (
                  <FriendMenu
                    key={f.userId}
                    name={name}
                    onMessage={() => message.open(f)}
                    onRemove={() => setRemoving(f)}
                  >
                    <li
                      data-friend-row={f.userId}
                      className="transition-colors duration-150 hover:bg-surface-muted"
                    >
                      <PersonRow
                        person={f}
                        avatarSize={48}
                        online={online.has(f.userId)}
                        actions={
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="touch-target"
                              aria-label={`Message ${name}`}
                              loading={message.pendingId === f.userId}
                              leftIcon={<ChatCircleIcon size={14} aria-hidden="true" />}
                              onClick={() => message.open(f)}
                            >
                              Message
                            </Button>
                            <Tip label="More actions" side="top">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="touch-target text-muted"
                                aria-label={`More actions for ${name}`}
                                aria-haspopup="menu"
                                onClick={(e) => openRowMenu(e.currentTarget)}
                              >
                                <DotsThreeIcon size={18} />
                              </Button>
                            </Tip>
                          </>
                        }
                      />
                    </li>
                  </FriendMenu>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            const row = [...(listRef.current?.querySelectorAll('[data-friend-row]') ?? [])].find(
              (el) => el.getAttribute('data-friend-row') === removing.userId,
            );
            focusNeighbour(row, friendsHeading.current);
            remove.mutate(removing);
          }
          setRemoving(null);
        }}
        title={removing ? `Remove ${nameOf(removing)} from friends?` : ''}
        description="Your chats stay as they are. You can send a new request any time."
        confirmLabel="Remove friend"
        danger
      />
    </div>
  );
}
