import { CheckIcon, LockSimpleIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { createSecureConversation, qk, searchProfiles } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import type { UserSummary } from '@vybora/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

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
  const isGroup = picked.length > 1;

  const close = () => {
    setTerm('');
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
                <Avatar path={u.avatar_path} name={u.username} size={20} />
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
      <ul className="mt-2 divide-y divide-line" aria-busy={results.isFetching}>
        {results.data?.map((u) => {
          const on = picked.some((p) => p.id === u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(u)}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-muted"
              >
                <Avatar path={u.avatar_path} name={u.username} size={36} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-medium">{u.username}</span>
                  {u.display_name && (
                    <span className="block truncate text-[13px] text-muted">{u.display_name}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-sm border',
                    on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                  )}
                  aria-hidden="true"
                >
                  {on && <CheckIcon size={12} weight="bold" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {results.isFetching && (
        <div className="flex justify-center py-4 text-accent">
          <Spinner size={18} label="Searching" />
        </div>
      )}
      {q && results.isSuccess && results.data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No people found for “{q}”.</p>
      )}
      {results.isError && (
        <p className="py-6 text-center text-sm text-danger" role="alert">
          Search failed. Check your connection and try again.
        </p>
      )}
    </Dialog>
  );
}
