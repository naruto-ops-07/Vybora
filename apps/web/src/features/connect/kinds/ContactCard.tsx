import {
  ChatCircleIcon,
  CheckIcon,
  ClockIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';
import type { ContactCard as ContactPayload } from '@vybora/e2ee';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { useMessageKinds, type ContactProfile, type ContactState } from './context';

const personName = (p: ContactProfile) => p.displayName || `@${p.username}`;

function CardButton({
  label,
  onClick,
  icon,
  children,
  busy,
  filled,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  busy?: boolean;
  filled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={busy}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors duration-150 disabled:cursor-wait',
        filled
          ? 'hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]'
          : 'text-accent hover:bg-accent-soft',
      )}
    >
      {busy ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}

function RelationNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-h-11 flex-1 items-center justify-center gap-2 px-3 text-sm">
      {icon}
      {children}
    </span>
  );
}

/**
 * A shared contact. Who it is comes ONLY from the server's profile for the
 * card's user id: the name and username inside the card are the sender's
 * words and could be anyone's, so they are never shown.
 */
export function ContactCardView({
  state,
  filled,
  onMessage,
  onAdd,
}: {
  state: ContactState;
  filled: boolean;
  onMessage: (p: ContactProfile) => void;
  onAdd: (p: ContactProfile) => void;
}) {
  const divider = filled ? 'border-current/25' : 'border-line';
  let head: ReactNode;
  if (state.status === 'loading') {
    head = (
      <div className="flex items-center gap-3" role="status" aria-label="Loading contact">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  } else if (state.status === 'missing') {
    head = (
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border',
            divider,
          )}
          aria-hidden="true"
        >
          <UserIcon size={20} />
        </span>
        <p className="text-msg font-semibold">VYBORA user</p>
      </div>
    );
  } else {
    const p = state.profile;
    head = (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          path={p.avatarPath}
          name={p.username}
          userId={p.id}
          displayName={p.displayName}
          size={44}
          decorative
        />
        <div className="min-w-0">
          <p className="type-wide truncate text-[15px] leading-snug">{personName(p)}</p>
          <p className={cn('truncate text-[13px]', !filled && 'text-muted')}>@{p.username}</p>
        </div>
      </div>
    );
  }

  let actions: ReactNode = null;
  if (state.status === 'found' && state.relation !== 'self') {
    const p = state.profile;
    const name = personName(p);
    const relation =
      state.relation === 'friends' ? (
        <RelationNote icon={<CheckIcon size={15} aria-hidden="true" />}>Friends</RelationNote>
      ) : state.relation === 'outgoing' ? (
        <RelationNote icon={<ClockIcon size={15} aria-hidden="true" />}>Request sent</RelationNote>
      ) : (
        <CardButton
          label={
            state.relation === 'incoming'
              ? `Accept ${name}’s friend request`
              : `Add ${name} as a friend`
          }
          onClick={() => onAdd(p)}
          icon={<UserPlusIcon size={16} aria-hidden="true" />}
          busy={state.adding}
          filled={filled}
        >
          {state.relation === 'incoming' ? 'Accept request' : 'Add friend'}
        </CardButton>
      );
    actions = (
      <div className={cn('-mx-3.5 -mb-2 mt-2.5 flex border-t', divider)}>
        <CardButton
          label={`Message ${name}`}
          onClick={() => onMessage(p)}
          icon={<ChatCircleIcon size={16} aria-hidden="true" />}
          filled={filled}
        >
          Message
        </CardButton>
        <span className={cn('w-px self-stretch border-l', divider)} aria-hidden="true" />
        {relation}
      </div>
    );
  }

  return (
    <div className="w-[min(16rem,62vw)] pt-0.5" data-contact-card="">
      {head}
      {actions}
    </div>
  );
}

/** The card in a bubble: resolves the person through the chat's lookup. */
export function ContactCardContent({
  contact,
  filled,
}: {
  contact: ContactPayload;
  filled: boolean;
}) {
  const kinds = useMessageKinds();
  const state = kinds.useContact(contact.userId);
  return (
    <ContactCardView
      state={state}
      filled={filled}
      onMessage={kinds.onMessageContact}
      onAdd={kinds.onAddFriend}
    />
  );
}
