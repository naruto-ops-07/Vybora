import { CheckIcon, LockSimpleIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import {
  createSecureConversation,
  directChatActivity,
  fetchFriends,
  qk,
  searchProfiles,
} from '@vybora/api';
import {
  friendlyError,
  orderQuickPick,
  QUICK_PICK_LIMIT,
  usernameFromAddParam,
} from '@vybora/core';
import type { UserSummary } from '@vybora/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { NoResultsEmpty } from '@/features/onboarding/EmptyStates';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useSecureInbox } from './hooks';

function PersonOption({
  user,
  checked,
  onToggle,
}: {
  user: UserSummary;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-muted"
      >
        <Avatar
          path={user.avatar_path}
          name={user.username}
          userId={user.id}
          displayName={user.display_name}
          size={36}
        />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-medium">{user.username}</span>
          {user.display_name && (
            <span className="block truncate text-[13px] text-muted">{user.display_name}</span>
          )}
        </span>
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-sm border',
            checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
          )}
          aria-hidden="true"
        >
          {checked && <CheckIcon size={12} weight="bold" />}
        </span>
      </button>
    </li>
  );
}

/** Start a direct chat (one person) or a group (two or more). */
export function NewChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const q = useDeferredValue(term.trim());
  const results = useQuery({
    queryKey: qk.search(q),
    queryFn: () => searchProfiles(supabase, q),
    enabled: open && q.length > 0,
  });
  // Friends first: a one-tap quick-pick while the search box is empty.
  const friends = useQuery({
    queryKey: qk.connect.friends,
    queryFn: () => fetchFriends(supabase),
    enabled: open,
  });
  // Recent direct chats first, then by name; the first eight unless expanded.
  const { userId } = useMe();
  const inbox = useSecureInbox();
  const [showAll, setShowAll] = useState(false);
  const friendOptions = useMemo<UserSummary[]>(
    () =>
      orderQuickPick(friends.data ?? [], directChatActivity(inbox.data, userId)).map((f) => ({
        id: f.userId,
        username: f.username,
        display_name: f.displayName ?? '',
        avatar_path: f.avatarPath,
      })),
    [friends.data, inbox.data, userId],
  );
  const shownFriends = showAll ? friendOptions : friendOptions.slice(0, QUICK_PICK_LIMIT);
  const friendsHeadingId = useId();
  const isGroup = picked.length > 1;

  const close = () => {
    setTerm('');
    setShowAll(false);
    setTitle('');
    setPicked([]);
    onClose();
  };

  const create = useMutation({
    mutationFn: () =>
      createSecureConversation(
        supabase,
        isGroup ? 'group' : 'direct',
        picked.map((p) => p.id),
        isGroup ? title.trim() || undefined : undefined,
      ),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      close();
      navigate(`/messages/${id}`);
    },
    onError: (e) =>
      toast.show(
        (e as { message?: string }).message?.includes('cannot_message')
          ? 'One of these people doesn’t accept messages from you.'
          : friendlyError(e),
        'error',
      ),
  });

  const toggle = (u: UserSummary) =>
    setPicked((p) =>
      p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u].slice(0, 50),
    );

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isGroup ? 'New group' : 'New message'}
      description="Choose one person for a direct chat, or several for a group."
      size="sm"
      footer={
        <Button
          disabled={!picked.length}
          loading={create.isPending}
          onClick={() => create.mutate()}
          leftIcon={<LockSimpleIcon size={14} />}
        >
          {isGroup
            ? `Create group · ${picked.length + 1}`
            : picked[0]
              ? `Message ${picked[0].username}`
              : 'Choose someone'}
        </Button>
      }
    >
      {picked.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Selected people">
          {picked.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => toggle(u)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line-strong py-1 pl-1 pr-2 text-sm hover:bg-surface-muted"
                aria-label={`Remove ${u.username}`}
              >
                <Avatar path={u.avatar_path} name={u.username} userId={u.id} size={20} />
                {u.username}
                <XIcon size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3">
        {isGroup && (
          <Input
            label="Group name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Optional"
          />
        )}
        <Input
          autoFocus
          aria-label="Search people"
          placeholder="Search by username or name"
          leading={<MagnifyingGlassIcon size={16} />}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {!term.trim() && friendOptions.length > 0 && (
        <>
          <h3 id={friendsHeadingId} className="mt-4 px-1 text-[13px] font-semibold text-muted">
            Friends
          </h3>
          <ul className="mt-1 divide-y divide-line" aria-labelledby={friendsHeadingId}>
            {shownFriends.map((u) => (
              <PersonOption
                key={u.id}
                user={u}
                checked={picked.some((p) => p.id === u.id)}
                onToggle={() => toggle(u)}
              />
            ))}
          </ul>
          {!showAll && friendOptions.length > QUICK_PICK_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="touch-target mt-1 text-accent"
              onClick={() => setShowAll(true)}
            >
              Show all friends ({friendOptions.length})
            </Button>
          )}
        </>
      )}
      <ul className="mt-2 divide-y divide-line" aria-busy={results.isFetching}>
        {results.data?.map((u) => (
          <PersonOption
            key={u.id}
            user={u}
            checked={picked.some((p) => p.id === u.id)}
            onToggle={() => toggle(u)}
          />
        ))}
      </ul>
      {results.isFetching && (
        <div className="flex justify-center py-4 text-accent">
          <Spinner size={18} label="Searching" />
        </div>
      )}
      {q && results.isSuccess && results.data.length === 0 && (
        <NoResultsEmpty
          className="px-2 py-6"
          action={
            <Button
              variant="outline"
              size="sm"
              className="touch-target"
              onClick={() => {
                const u = usernameFromAddParam(q);
                close();
                navigate(u ? `/friends?add=${encodeURIComponent(u)}` : '/friends', {
                  state: { focusAddFriend: true },
                });
              }}
            >
              Add a friend
            </Button>
          }
        />
      )}
      {results.isError && (
        <p className="py-6 text-center text-sm text-danger" role="alert">
          Search failed. Check your connection and try again.
        </p>
      )}
    </Dialog>
  );
}
