import { MagnifyingGlassIcon, UserIcon } from '@phosphor-icons/react';
import type { Friend } from '@vybora/api';
import { foldText } from '@vybora/core';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Skeleton } from '@/components/ui/States';

export interface ContactDraft {
  userId: string;
  username: string;
  displayName: string;
}

/**
 * Share a friend's contact card. The card carries what the server says about
 * them now; whoever receives it looks the person up again by id anyway.
 */
export function ContactPicker({
  open,
  onClose,
  friends,
  loading,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  friends: readonly Friend[];
  loading: boolean;
  onSend: (contact: ContactDraft) => void;
}) {
  const [term, setTerm] = useState('');
  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const shown = useMemo(() => {
    const q = foldText(term.trim());
    const all = [...friends].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username),
    );
    return q
      ? all.filter(
          (f) => foldText(f.displayName ?? '').includes(q) || foldText(f.username).includes(q),
        )
      : all;
  }, [friends, term]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share a contact"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {!loading && friends.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<UserIcon size={22} className="text-accent" aria-hidden="true" />}
          title="No friends yet"
          body="Add a friend first, then you can share their contact."
        />
      ) : (
        <>
          <label className="vy-search flex h-10 items-center gap-2 rounded-md px-3">
            <MagnifyingGlassIcon size={16} className="text-subtle" aria-hidden="true" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search friends"
              aria-label="Search friends"
              data-autofocus
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
            />
          </label>
          {loading ? (
            <div className="mt-3 space-y-2" role="status" aria-label="Loading friends">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No friends match</p>
          ) : (
            <ul className="-mx-2 mt-3 space-y-0.5" aria-label="Friends">
              {shown.map((f) => {
                const name = f.displayName || f.username;
                return (
                  <li key={f.userId}>
                    <button
                      type="button"
                      aria-label={`Share ${name}`}
                      onClick={() =>
                        onSend({
                          userId: f.userId,
                          username: f.username,
                          displayName: f.displayName ?? '',
                        })
                      }
                      className="vy-row flex min-h-12 w-full items-center gap-3 px-2 py-1.5 text-left"
                    >
                      <Avatar
                        path={f.avatarPath}
                        name={f.username}
                        userId={f.userId}
                        displayName={f.displayName}
                        size={36}
                        decorative
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{name}</span>
                        <span className="block truncate text-xs text-muted">@{f.username}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
