import { formatRowTime } from '@vybora/core';
import { useMemo } from 'react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { useA11y } from '@/features/a11y/A11yProvider';
import { ChatRowView } from '@/features/connect/ChatRowView';
import { sampleRows } from '../sample';

const noop = () => undefined;

/** The chat list column, drawn by the same ChatRowView the inbox uses. */
export function ChatListSection() {
  const { prefs } = useA11y();
  const now = useMemo(() => new Date(), []);
  const rows = useMemo(() => sampleRows(now), [now]);
  return (
    <div className="max-w-[380px] overflow-hidden rounded-lg border border-line bg-surface">
      <ul className="py-1" aria-label="Sample chats">
        {rows.map((r) => {
          const peer = r.members[0]!;
          return (
            <ChatRowView
              key={r.id}
              to="#chat-list"
              title={r.title}
              avatar={
                r.kind === 'group' ? (
                  <GroupAvatar members={r.members} size={48} />
                ) : (
                  <Avatar
                    path={null}
                    name={peer.username}
                    userId={peer.id}
                    displayName={peer.display_name}
                    size={48}
                  />
                )
              }
              online={r.online}
              time={formatRowTime(r.at, now)}
              preview={r.preview}
              unreadCount={r.unreadCount}
              pinned={!!r.pinned}
              archived={false}
              muted={!!r.muted}
              active={r.id === 'row-crew'}
              alwaysShowActions={prefs.alwaysShowActions}
              onPin={noop}
              onArchive={noop}
            />
          );
        })}
      </ul>
    </div>
  );
}
