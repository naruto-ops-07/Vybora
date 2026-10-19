/**
 * Four authored empty-state illustrations (spec "Your circle, in colour" §2).
 * All decorative (`aria-hidden`): the heading beside each one carries the meaning.
 */
import {
  bubblePath,
  FILL,
  Frame,
  LINE,
  LockSeal,
  STROKE,
  TextLines,
  type IllustrationProps,
} from './parts';

export type { IllustrationProps } from './parts';

/** Two overlapping bubbles, the front one sealed; three people in their tones. */
export function WelcomeIllustration({ width = 184, className }: IllustrationProps) {
  return (
    <Frame name="welcome" viewBox="0 0 200 140" width={width} className={className}>
      {/* Back bubble: someone else, in a tone. */}
      <path d={bubblePath(22, 18, 100, 54, 'left')} fill={FILL.tone('glacier')} {...LINE} />
      <TextLines x={36} y={36} widths={[58, 34]} color={FILL.toneInk('glacier')} />
      {/* Front bubble: mine, in the look's own bubble colour, sealed before it's sent. */}
      <path d={bubblePath(68, 56, 108, 54, 'right')} fill={FILL.mine} {...LINE} />
      <TextLines x={82} y={74} widths={[66, 42]} color={FILL.mineText} />
      <LockSeal cx={170} cy={58} />
      {/* Three people, as their tone dots. */}
      <g {...LINE}>
        <circle cx={30} cy={118} r={9} fill={FILL.tone('emerald')} />
        <circle cx={46} cy={118} r={9} fill={FILL.tone('sky')} />
        <circle cx={62} cy={118} r={9} fill={FILL.tone('lime')} />
      </g>
    </Frame>
  );
}

/** An open envelope, its seal on the flap, with a bubble rising out of it. */
export function NoChatsIllustration({ width = 176, className }: IllustrationProps) {
  const env = FILL.tone('sky');
  return (
    <Frame name="no-chats" viewBox="0 0 200 140" width={width} className={className}>
      {/* Inside of the envelope and the open flap behind the bubble. */}
      <rect x={36} y={70} width={128} height={56} rx={10} fill={env} {...LINE} />
      <path d="M36 72 L100 26 L164 72 Z" fill={env} {...LINE} />
      {/* The bubble, rising out of the pocket. */}
      <path d={bubblePath(66, 44, 72, 46, 'left')} fill={FILL.bubble} {...LINE} />
      <TextLines x={78} y={58} widths={[44, 26]} />
      {/* Front pocket: the V of the side flaps, over the bubble's base. */}
      <path
        d="M36 74 L100 104 L164 74 V116 A10 10 0 0 1 154 126 H46 A10 10 0 0 1 36 116 Z"
        fill={env}
        {...LINE}
      />
      <path d="M36 116 L82 96 M164 116 L118 96" {...LINE} />
      <LockSeal cx={100} cy={28} r={12} />
    </Frame>
  );
}

/** Three seats joined by a line: two friends in their tones, the third one open. */
export function NoFriendsIllustration({ width = 176, className }: IllustrationProps) {
  const face = (cx: number, cy: number, tone: string) => (
    <g>
      <circle cx={cx} cy={cy} r={21} fill={FILL.tone(tone)} {...LINE} />
      <g fill={FILL.toneInk(tone)}>
        <circle cx={cx - 6} cy={cy - 3} r={1.9} />
        <circle cx={cx + 6} cy={cy - 3} r={1.9} />
      </g>
      <path
        d={`M${cx - 6} ${cy + 5} Q${cx} ${cy + 10} ${cx + 6} ${cy + 5}`}
        stroke={FILL.toneInk(tone)}
        {...STROKE}
      />
    </g>
  );
  return (
    <Frame name="no-friends" viewBox="0 0 200 140" width={width} className={className}>
      {/* The link: made between the first two, waiting for the third. */}
      <path d="M38 92 Q62 44 100 58" {...LINE} />
      <path d="M100 58 Q138 44 162 92" {...LINE} strokeDasharray="1 5" />
      {face(38, 92, 'emerald')}
      {face(100, 58, 'ocean')}
      {/* The empty seat, with room for someone. */}
      <circle cx={162} cy={92} r={21} fill={FILL.surface} {...LINE} strokeDasharray="4 4" />
      <circle cx={162} cy={92} r={10} fill={FILL.accent} {...LINE} />
      <path d="M162 87.5V96.5M157.5 92H166.5" stroke={FILL.onAccent} {...STROKE} />
    </Frame>
  );
}

/** A bubble, and a magnifier over its corner that found nothing. */
export function NothingFoundIllustration({ width = 168, className }: IllustrationProps) {
  return (
    <Frame name="nothing-found" viewBox="0 0 200 140" width={width} className={className}>
      <path d={bubblePath(30, 22, 106, 62, 'left')} fill={FILL.bubble} {...LINE} />
      <TextLines x={44} y={40} widths={[70, 52, 30]} />
      {/* Handle first, so the lens ring sits over its end. */}
      <rect
        x={150}
        y={92}
        width={11}
        height={36}
        rx={5.5}
        transform="rotate(-45 155.5 110)"
        fill={FILL.accent}
        {...LINE}
      />
      <circle cx={136} cy={86} r={25} fill={FILL.tone('aqua')} {...LINE} />
      <circle cx={136} cy={86} r={18} fill="none" {...LINE} />
      {/* Under the glass: an empty line where a match would be. */}
      <path d="M127 86H145" {...LINE} strokeDasharray="1 4.5" />
    </Frame>
  );
}
