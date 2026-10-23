import { ChecksIcon, ClockIcon } from '@phosphor-icons/react';
import type { ConnectMember } from '@vybora/api';
import { formatClock, messageInfo, messageSummary, type MessageInfoRow } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';

function Group({
  title,
  icon,
  rows,
  members,
  nameOf,
}: {
  title: string;
  icon: ReactNode;
  rows: MessageInfoRow[];
  members: readonly ConnectMember[];
  nameOf: (userId: string) => string;
}) {
  if (!rows.length) return null;
  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
        <span className="font-mono text-xs font-normal text-subtle">{rows.length}</span>
      </h3>
      <ul className="mt-2 space-y-0.5">
        {rows.map((r) => {
          const m = members.find((x) => x.id === r.userId);
          return (
            <li key={r.userId} className="flex min-h-11 items-center gap-3 text-[15px]">
              <Avatar
                path={m?.avatar_path ?? null}
                name={m?.username ?? nameOf(r.userId)}
                userId={r.userId}
                displayName={m?.display_name}
                size={32}
                decorative
              />
              <span className="min-w-0 flex-1 truncate">{nameOf(r.userId)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Who has one of my messages: read, delivered, or still waiting, per member, from
 * the same delivered/read positions as the ticks. Receipts carry no times, so the
 * only time shown is when it was sent.
 */
export function MessageInfoDialog({
  open,
  onClose,
  message,
  members,
  nameOf,
  myUserId,
}: {
  open: boolean;
  onClose: () => void;
  message: LocalMessage | null;
  members: readonly ConnectMember[];
  nameOf: (userId: string) => string;
  myUserId?: string;
}) {
  if (!message) return null;
  const info = messageInfo(message, members);
  const sent = new Date(message.createdAt);
  return (
    <Dialog open={open} onClose={onClose} title="Message info">
      <figure className="border-l-[3px] border-accent py-0.5 pl-3">
        <blockquote className="text-msg-sm line-clamp-3 break-anywhere">
          {messageSummary(message, { nameOf, myUserId })}
        </blockquote>
        <figcaption className="mt-1 text-xs text-muted">
          Sent{' '}
          <time dateTime={message.createdAt}>
            {sent.toLocaleDateString([], { day: 'numeric', month: 'short' })},{' '}
            {formatClock(message.createdAt)}
          </time>
        </figcaption>
      </figure>
      <div className="mt-5 space-y-5">
        <Group
          title="Read"
          icon={<ChecksIcon size={16} weight="bold" className="text-accent" aria-hidden="true" />}
          rows={info.read}
          members={members}
          nameOf={nameOf}
        />
        <Group
          title="Delivered"
          icon={<ChecksIcon size={16} className="text-muted" aria-hidden="true" />}
          rows={info.delivered}
          members={members}
          nameOf={nameOf}
        />
        <Group
          title="Waiting"
          icon={<ClockIcon size={16} className="text-muted" aria-hidden="true" />}
          rows={info.pending}
          members={members}
          nameOf={nameOf}
        />
      </div>
    </Dialog>
  );
}
