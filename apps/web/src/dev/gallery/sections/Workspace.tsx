/**
 * The messaging workspace assembled from its real pieces (rail, chat list header and
 * rows, chat header, canvas glow, bubbles, composer) with sample data, so each look can
 * be judged as the place people spend the day. Nothing is sent and nothing is fetched.
 */
import type { ChatTheme } from '@vybora/api';
import { formatRowTime, layoutThread } from '@vybora/core';
import { useMemo, useState, type ReactNode } from 'react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { useA11y } from '@/features/a11y/A11yProvider';
import { Bubble } from '@/features/connect/Bubble';
import { ChatGlow } from '@/features/connect/Canvas';
import { ChatHeaderView } from '@/features/connect/ChatHeader';
import { ChatRowView } from '@/features/connect/ChatRowView';
import { Composer } from '@/features/connect/Composer';
import { ChatListHeader, type Filter } from '@/features/connect/InboxPane';
import { DateChip, groupByDay, ThreadDay, UnreadDivider } from '@/features/connect/ThreadParts';
import { BottomNav, RailNav } from '@/features/connect/Workspace';
import { chatBackground, useChatTheme } from '@/features/connect/ui';
import { FriendRequestBadge } from '@/features/friends/FriendRequestBadge';
import { CREW, ME, nameOf, PEOPLE, sampleRows, sampleThread } from '../sample';
import { Frame } from './FirstRun';

const noop = () => undefined;
const DEFAULT_THEME: ChatTheme = {};
const OCEAN: ChatTheme = { preset: 'ocean' };
const people = [ME, ...CREW];
const nameFor = (id: string) =>
  id === ME.id ? 'You' : nameOf(people.find((p) => p.id === id) ?? ME);

function SampleRows({ activeId }: { activeId?: string }) {
  const { prefs } = useA11y();
  const now = useMemo(() => new Date(), []);
  const rows = useMemo(() => sampleRows(now), [now]);
  return (
    <ul className="px-2 py-1.5" aria-label="Sample chats">
      {rows.map((r) => {
        const peer = r.members[0]!;
        return (
          <ChatRowView
            key={r.id}
            to="#workspace"
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
            active={r.id === activeId}
            alwaysShowActions={prefs.alwaysShowActions}
            onPin={noop}
            onArchive={noop}
          />
        );
      })}
    </ul>
  );
}

/** The thread of the sample group chat, drawn by the real Bubble in a chat theme. */
function SampleThread({ theme, limit }: { theme: ChatTheme; limit?: number }) {
  const def = useChatTheme(theme);
  const now = useMemo(() => new Date(), []);
  const { messages, receipts, lastReadSeq } = useMemo(() => sampleThread(now), [now]);
  const days = useMemo(() => {
    const shown = limit ? messages.slice(-limit) : messages;
    return groupByDay(layoutThread(shown, { myUserId: ME.id, lastReadSeq, now }));
  }, [messages, lastReadSeq, now, limit]);
  return (
    <>
      {days.map((day) => (
        <ThreadDay key={day.key}>
          {day.items.map((it) => {
            if (it.type === 'date') return <DateChip key={it.key} label={it.label} />;
            if (it.type === 'unread') return <UnreadDivider key={it.key} count={it.count} />;
            const m = it.message;
            const sender = people.find((p) => p.id === m.senderId);
            return (
              <Bubble
                key={it.key}
                message={m}
                mine={it.mine}
                theme={def}
                senderName={nameFor(m.senderId)}
                showSender={it.runStart}
                runStart={it.runStart}
                runEnd={it.runEnd}
                avatar={
                  !it.mine && sender
                    ? { path: null, name: sender.username, displayName: sender.display_name }
                    : undefined
                }
                receipt={receipts[m.id]}
                myUserId={ME.id}
                nameOf={nameFor}
                onReact={noop}
                onCopy={noop}
                onReply={noop}
                onDelete={noop}
                onRetry={noop}
                onOpenImage={noop}
                onSelect={noop}
              />
            );
          })}
        </ThreadDay>
      ))}
    </>
  );
}

/** A chat pane: canvas + glow, frosted header, thread, composer. */
function SampleChat({
  theme = DEFAULT_THEME,
  limit,
  className,
}: {
  theme?: ChatTheme;
  limit?: number;
  className?: string;
}) {
  const def = useChatTheme(theme);
  const [details, setDetails] = useState(false);
  return (
    <div
      className={
        'relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-bg ' + (className ?? '')
      }
      style={chatBackground(theme, def)}
    >
      <ChatGlow />
      <ChatHeaderView
        title="Weekend crew"
        avatar={<GroupAvatar members={CREW} size={40} />}
        subtitle="Theo is typing…"
        typing
        online={false}
        accent={def.accent}
        disappearing="1d"
        details={details}
        onToggleDetails={() => setDetails((d) => !d)}
      />
      <div className="vy-canvas-layer scroll-thin min-h-0 flex-1 overflow-y-auto py-4">
        <SampleThread theme={theme} limit={limit} />
      </div>
      <Composer
        accent={def.accent}
        replyTo={null}
        onCancelReply={noop}
        onSend={() => true}
        onFiles={noop}
        onTyping={noop}
        draftKey={`gallery-workspace-${theme.preset ?? 'default'}`}
      />
    </div>
  );
}

function ListPane({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <aside
      aria-label="Sample chat list"
      className="flex min-h-0 w-full shrink-0 flex-col border-line bg-surface md:w-[340px] md:border-r lg:w-[368px]"
    >
      {children}
      {footer}
    </aside>
  );
}

export function WorkspaceSection() {
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const badge = <FriendRequestBadge count={2} />;
  const header = (
    <ChatListHeader
      term={term}
      onTerm={setTerm}
      filter={filter}
      onFilter={setFilter}
      onCompose={noop}
    />
  );
  return (
    <div className="space-y-8">
      <Frame label="Desktop: rail, chat list, chat (Default chat theme)" className="bg-bg">
        <div className="flex h-[760px] min-h-0" data-workspace-frame="desktop">
          <RailNav
            friendsBadge={badge}
            profile={{ id: PEOPLE.turquoise.id, username: 'maya', display_name: 'Maya Chen' }}
            current="messages"
            className="hidden md:flex"
          />
          <ListPane>
            {header}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-line">
              <SampleRows activeId="row-crew" />
            </div>
          </ListPane>
          <SampleChat className="hidden md:flex" />
        </div>
      </Frame>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Frame label="Phone: chat list with the bottom bar" className="bg-surface">
          <div className="flex h-[640px] min-h-0 flex-col" data-workspace-frame="phone-list">
            <div className="flex min-h-0 flex-1 flex-col">
              {header}
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-line">
                <SampleRows />
              </div>
            </div>
            <BottomNav friendsBadge={badge} current="messages" />
          </div>
        </Frame>
        <Frame label="A named chat theme (Ocean): its own colour, the look’s depth and shape">
          <div className="flex h-[640px] min-h-0" data-workspace-frame="phone-chat">
            <SampleChat theme={OCEAN} limit={7} />
          </div>
        </Frame>
      </div>
    </div>
  );
}
