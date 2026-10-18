/**
 * Gallery sections for D3: the two delight moments (sealed send, friendship
 * joined) and the friend and request rows around the joined card. Real
 * components; nothing is sent, and the buttons only replay the motion.
 */
import {
  ArrowCounterClockwiseIcon,
  DotsThreeIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useA11y } from '@/features/a11y/A11yProvider';
import { Composer } from '@/features/connect/Composer';
import { SEAL_MS, SendGlyph } from '@/features/connect/SealedSend';
import { Meta } from '@/features/connect/ui';
import { FriendJoinedCard, type JoinedPerson } from '@/features/friends/FriendJoined';
import { PersonRow } from '@/features/friends/FriendsPane';
import { PEOPLE, type SamplePerson } from '../sample';
import { Frame } from './FirstRun';

const noop = () => undefined;
const asFriend = (p: SamplePerson): JoinedPerson => ({
  userId: p.id,
  username: p.username,
  displayName: p.display_name,
  avatarPath: null,
});
const ME = asFriend(PEOPLE.turquoise);

/** Shown only when reduced motion is on (as in the screenshot script). */
function MotionNote({ children }: { children: string }) {
  const { reduceMotion } = useA11y();
  if (!reduceMotion) return null;
  return <p className="text-[13px] text-muted">{children}</p>;
}

/** Still frames of the timeline, in the real send button. */
const FRAMES = [0, 40, 100, SEAL_MS.close, SEAL_MS.close + SEAL_MS.hold, 280, SEAL_MS.total];

export function SealedSendSection() {
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          leftIcon={<PaperPlaneRightIcon size={16} aria-hidden="true" />}
          onClick={() => setRun((r) => r + 1)}
        >
          Play sealed send
        </Button>
        <MotionNote>
          Reduced motion is on, so the seal stays off. The frames below are drawn from its timeline.
        </MotionNote>
      </div>
      <Frame label="Composer (sending here only replays the seal)" className="max-w-2xl">
        <Composer
          accent="var(--vy-accent)"
          replyTo={null}
          onCancelReply={noop}
          onSend={() => true}
          onFiles={noop}
          onTyping={noop}
          draftKey="gallery-composer"
          sealDemoRun={run}
        />
      </Frame>
      <figure>
        <figcaption>
          <Meta>
            Frames: the lock fades in open, its shackle drops 3 px and closes by {SEAL_MS.close} ms,
            holds, then the plane is back by {SEAL_MS.total} ms
          </Meta>
        </figcaption>
        <ol className="mt-2 flex flex-wrap gap-4">
          {FRAMES.map((ms) => (
            <li key={ms} className="flex flex-col items-center gap-1.5">
              {/* Presentational copy of the send button: not focusable, not a control. */}
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-on-accent"
                aria-hidden="true"
                data-seal-frame={ms}
              >
                <SendGlyph frameAt={ms} />
              </span>
              <Meta>{ms} ms</Meta>
            </li>
          ))}
        </ol>
      </figure>
    </div>
  );
}

export function FriendsSection() {
  const [run, setRun] = useState(1);
  const { reduceMotion } = useA11y();
  const maya = asFriend(PEOPLE.ocean);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          leftIcon={<ArrowCounterClockwiseIcon size={16} aria-hidden="true" />}
          onClick={() => setRun((r) => r + 1)}
        >
          Replay joined card
        </Button>
        <MotionNote>Reduced motion is on, so the avatars start joined.</MotionNote>
      </div>
      <Frame label="Friends pane, just after accepting" className="max-w-md bg-surface">
        <div className="px-3 pt-3">
          <FriendJoinedCard
            me={ME}
            friend={maya}
            animate={!reduceMotion}
            run={run}
            onSayHi={noop}
            onDismiss={noop}
          />
        </div>
        <h3 className="px-4 pb-1 pt-4 text-[13px] font-semibold text-muted">Requests</h3>
        <PersonRow
          person={asFriend(PEOPLE.lime)}
          detail={
            <>
              <span aria-hidden="true">·</span>
              <Meta className="shrink-0">2h</Meta>
            </>
          }
          actions={
            <>
              <Button size="sm" className="touch-target">
                Accept
              </Button>
              <Button size="sm" variant="ghost" className="touch-target">
                Decline
              </Button>
            </>
          }
        />
        <PersonRow
          person={asFriend(PEOPLE.mint)}
          detail={
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">Pending</span>
            </>
          }
          actions={
            <Button size="sm" variant="ghost" className="touch-target">
              Cancel
            </Button>
          }
        />
        <h3 className="px-4 pb-1 pt-4 text-[13px] font-semibold text-muted">Friends</h3>
        {[maya, asFriend(PEOPLE.sky)].map((f, i) => (
          <PersonRow
            key={f.userId}
            person={f}
            avatarSize={48}
            online={i === 0}
            actions={
              <>
                <Button size="sm" variant="outline" className="touch-target">
                  Message
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="touch-target text-muted"
                  aria-label={`More actions for ${f.displayName || f.username}`}
                >
                  <DotsThreeIcon size={18} />
                </Button>
              </>
            }
          />
        ))}
        <div className="h-3" />
      </Frame>
    </div>
  );
}
