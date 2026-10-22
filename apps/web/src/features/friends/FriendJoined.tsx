import { ChatCircleIcon, XIcon } from '@phosphor-icons/react';
import type { Friend } from '@vybora/api';
import { useId } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { nameOf } from './hooks';

export type JoinedPerson = Pick<Friend, 'userId' | 'username' | 'displayName' | 'avatarPath'>;

const SIZE = 40;
/** How far the two avatars overlap once joined. They start 16 px apart (see `.join-*`). */
const OVERLAP = 12;
/**
 * Theirs covers the right of mine, so mine shows one initial moved left into what stays
 * visible: its right edge clears their ring (pinned by a test).
 */
const MINE_GLYPH = { x: 0.38, y: 0.5 };
/** The pair's layout, for the no-clipping test. */
export const joinedAvatarGeometry = {
  size: SIZE,
  overlap: OVERLAP,
  ring: 2,
  mineGlyph: MINE_GLYPH,
};

/** The sentence the card shows, and the one a screen reader hears when it appears. */
export const joinedText = (friend: JoinedPerson) => `You and ${nameOf(friend)} are now friends`;

/**
 * "Friendship joined": shown at the top of Friends right after a request is
 * accepted (by me, or because they'd already asked me). My avatar and theirs
 * slide together into an overlap, once; under reduced motion they start joined.
 * `run` restarts the slide (the gallery's replay, or a newer friendship).
 */
export function FriendJoinedCard({
  me,
  friend,
  animate,
  run = 0,
  sayingHi,
  onSayHi,
  onDismiss,
  className,
}: {
  me: JoinedPerson;
  friend: JoinedPerson;
  animate: boolean;
  run?: number;
  /** The direct chat is being created. */
  sayingHi?: boolean;
  onSayHi: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const titleId = useId();
  const name = nameOf(friend);
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex items-start gap-3 vy-card rounded-lg p-4', className)}
      data-friend-joined={friend.userId}
    >
      {/* Their avatar sits in front with a ring in the surface colour (a border, not a shadow). */}
      <span
        className="relative shrink-0"
        style={{ width: SIZE * 2 - OVERLAP, height: SIZE }}
        aria-hidden="true"
        data-joined-avatars={animate ? 'slide' : 'still'}
      >
        <span key={`mine-${run}`} className={cn('absolute left-0 top-0', animate && 'join-mine')}>
          <Avatar
            path={me.avatarPath}
            name={me.username}
            userId={me.userId}
            displayName={me.displayName}
            username={me.username}
            size={SIZE}
            decorative
            className="block"
            glyphAt={MINE_GLYPH}
          />
        </span>
        <span
          key={`theirs-${run}`}
          className={cn(
            'absolute -top-0.5 rounded-full border-2 border-surface',
            animate && 'join-theirs',
          )}
          style={{ left: SIZE - OVERLAP - 2 }}
        >
          <Avatar
            path={friend.avatarPath}
            name={friend.username}
            userId={friend.userId}
            displayName={friend.displayName}
            username={friend.username}
            size={SIZE}
            decorative
            className="block"
          />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="break-anywhere text-[15px] font-semibold leading-snug">
          {joinedText(friend)}
        </h2>
        <Button
          size="sm"
          className="touch-target mt-3"
          aria-label={`Say hi to ${name}`}
          loading={sayingHi}
          leftIcon={<ChatCircleIcon size={14} aria-hidden="true" />}
          onClick={onSayHi}
        >
          Say hi
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="touch-target -mr-1.5 -mt-1.5 text-muted"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <XIcon size={16} />
      </Button>
    </section>
  );
}
