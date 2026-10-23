import {
  ChartBarIcon,
  FileIcon,
  ImageIcon,
  MapPinIcon,
  MicrophoneIcon,
  NumberOneIcon,
  StarIcon,
  UserIcon,
  VideoCameraIcon,
  type Icon,
} from '@phosphor-icons/react';
import { formatRowTime, messageSummary } from '@vybora/core';
import type { LocalMessage } from '@vybora/e2ee';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, Skeleton } from '@/components/ui/States';

export interface StarredRowInfo {
  /** The chat's name (shown when listing every chat). */
  chat: string;
  sender: string;
  nameOf: (userId: string) => string;
  /** So my own view-once copy reads "View once photo", never "Opened". */
  myUserId?: string;
  /** The sender's avatar (path and names); initials in their tone without a path. */
  avatar?: { path: string | null; username: string; displayName?: string | null };
}

/** A kind is shown as an icon and its own words, not a "Poll:" / "Location:" prefix. */
function rowContent(
  m: LocalMessage,
  d: StarredRowInfo,
): { kind?: string; Icon?: Icon; text: string } {
  const summary = messageSummary(m, { nameOf: d.nameOf, myUserId: d.myUserId });
  if (m.deleted || m.kind === 'undecryptable' || m.kind === 'unsupported') return { text: summary };
  if (m.viewOnce) return { kind: 'view-once', Icon: NumberOneIcon, text: summary };
  if (m.kind === 'contact') return { kind: 'contact', Icon: UserIcon, text: 'Contact card' };
  if (m.kind === 'location')
    return { kind: 'location', Icon: MapPinIcon, text: m.location?.label || 'Location' };
  if (m.kind === 'poll') return { kind: 'poll', Icon: ChartBarIcon, text: m.poll?.question ?? '' };
  if (m.kind === 'attachment') {
    const k = m.attachment?.kind;
    const Icon =
      k === 'image'
        ? ImageIcon
        : k === 'video'
          ? VideoCameraIcon
          : k === 'voice'
            ? MicrophoneIcon
            : FileIcon;
    const words =
      m.caption?.trim() ||
      (k === 'image'
        ? 'Photo'
        : k === 'video'
          ? 'Video'
          : k === 'voice'
            ? 'Voice message'
            : (m.attachment?.name ?? 'File'));
    return { kind: k ?? 'file', Icon, text: words };
  }
  return { text: summary };
}

/**
 * Starred messages on this device (stars are never synced), most recently
 * starred first: for one chat, or for every chat. Picking one opens it in its chat.
 */
export function StarredDialog({
  open,
  onClose,
  scope,
  loading,
  messages,
  describe,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  scope: 'chat' | 'all';
  loading: boolean;
  messages: readonly LocalMessage[];
  describe: (m: LocalMessage) => StarredRowInfo;
  onOpen: (m: LocalMessage) => void;
}) {
  const now = new Date();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Starred messages"
      description={
        scope === 'all' ? 'In every chat, on this browser' : 'In this chat, on this browser'
      }
    >
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading starred messages">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<StarIcon size={22} className="text-accent" aria-hidden="true" />}
          title="No starred messages"
          body="Star a message from its menu to find it here."
        />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {messages.map((m) => {
            const d = describe(m);
            const row = rowContent(m, d);
            return (
              <li key={`${m.conversationId}/${m.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="vy-row flex w-full items-start gap-3 px-2 py-2.5 text-left"
                >
                  <span className="mt-0.5" data-starred-avatar="">
                    <Avatar
                      path={d.avatar?.path ?? null}
                      name={d.avatar?.username ?? d.sender}
                      userId={m.senderId}
                      displayName={d.avatar?.displayName ?? d.sender}
                      size={28}
                      decorative
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {scope === 'all' && d.chat ? `${d.sender} in ${d.chat}` : d.sender}
                      </span>
                      <time
                        className="shrink-0 font-mono text-[11px] text-subtle"
                        dateTime={m.createdAt}
                      >
                        {formatRowTime(m.createdAt, now)}
                      </time>
                    </span>
                    <span className="text-msg-sm flex min-w-0 items-start gap-1.5 text-muted">
                      {row.Icon && (
                        <row.Icon
                          size={15}
                          className="mt-[0.2em] shrink-0"
                          aria-hidden="true"
                          data-kind-icon={row.kind}
                        />
                      )}
                      <span className="line-clamp-2 break-anywhere">{row.text}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
