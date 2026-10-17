/**
 * The four empty-state illustrations (spec "Your circle, in colour" §2), drawn
 * in the web's grammar (apps/web/src/components/illustrations): graphite line
 * (muted text) at 1.5 px with round caps and joins, flat fills from the
 * personal tones and the accent for the current theme, radii 8–12, no
 * gradients or shadows. All decorative: the heading beside each carries the meaning.
 */
import { personToneHighContrastInk, personTones, type PersonToneName } from '@vybora/config';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useA11y } from '@/lib/a11y';
import { useTheme } from '@/lib/theme';

interface Paint {
  line: string;
  accent: string;
  onAccent: string;
  surface: string;
  bubble: string;
  text: string;
  tone: (name: PersonToneName) => string;
  toneInk: (name: PersonToneName) => string;
}

const PaintCtx = createContext<Paint | null>(null);
const usePaint = () => useContext(PaintCtx)!;

function usePaintFor(): Paint {
  const t = useTheme();
  const { prefs } = useA11y();
  return useMemo(() => {
    const mode = t.dark ? 'dark' : 'light';
    return {
      line: t.textMuted,
      accent: t.accent,
      onAccent: t.onAccent,
      surface: t.surface,
      bubble: t.bubbleIn,
      text: t.borderStrong,
      tone: (n) => personTones[n][mode].fill,
      toneInk: (n) =>
        prefs.highContrast ? personToneHighContrastInk[mode] : personTones[n][mode].ink,
    };
  }, [t, prefs.highContrast]);
}

/** The one stroke: 1.5 px, round, unscaled by the viewBox. */
const STROKE = {
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

function useLine() {
  const p = usePaint();
  return { stroke: p.line, ...STROKE };
}

/** A chat bubble with VYBORA's tail (the web `bubblePath`, same numbers). */
export function bubblePath(
  x: number,
  y: number,
  w: number,
  h: number,
  tail: 'left' | 'right',
  r = 10,
): string {
  const x1 = x + w;
  const y1 = y + h;
  const t = 1.4;
  if (tail === 'right')
    return [
      `M${x + r} ${y}`,
      `H${x1 - r}`,
      `A${r} ${r} 0 0 1 ${x1} ${y + r}`,
      `V${y1 - 10 * t}`,
      `C${x1 + 0.5 * t} ${y1 - 4 * t} ${x1 + 3.5 * t} ${y1 - t} ${x1 + 8 * t} ${y1}`,
      `H${x + r}`,
      `A${r} ${r} 0 0 1 ${x} ${y1 - r}`,
      `V${y + r}`,
      `A${r} ${r} 0 0 1 ${x + r} ${y}`,
      'Z',
    ].join(' ');
  return [
    `M${x1 - r} ${y}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 0 ${x} ${y + r}`,
    `V${y1 - 10 * t}`,
    `C${x - 0.5 * t} ${y1 - 4 * t} ${x - 3.5 * t} ${y1 - t} ${x - 8 * t} ${y1}`,
    `H${x1 - r}`,
    `A${r} ${r} 0 0 0 ${x1} ${y1 - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 0 ${x1 - r} ${y}`,
    'Z',
  ].join(' ');
}

const BAR = 3.5;

/** Rounded "text" bars (flat fills): placeholders, never real words. */
function TextLines({
  x,
  y,
  widths,
  color,
  gap = 11,
}: {
  x: number;
  y: number;
  widths: number[];
  color?: string;
  gap?: number;
}) {
  const p = usePaint();
  return (
    <G fill={color ?? p.text}>
      {widths.map((w, i) => (
        <Rect
          key={i}
          x={x - BAR / 2}
          y={y + i * gap - BAR / 2}
          width={w + BAR}
          height={BAR}
          rx={BAR / 2}
        />
      ))}
    </G>
  );
}

/** The lock seal: an accent disc with a closed padlock. */
function LockSeal({ cx, cy, r = 13 }: { cx: number; cy: number; r?: number }) {
  const p = usePaint();
  const line = useLine();
  const s = r / 13;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={p.accent} {...line} />
      <G transform={`translate(${cx} ${cy}) scale(${s})`}>
        <Path
          d="M-3.6 -1.2V-3.8A3.6 3.6 0 0 1 3.6 -3.8V-1.2"
          fill="none"
          stroke={p.onAccent}
          {...STROKE}
        />
        <Rect x={-5.5} y={-1.6} width={11} height={8.4} rx={2} fill={p.onAccent} />
        <Circle cx={0} cy={2.4} r={1.15} fill={p.accent} />
      </G>
    </G>
  );
}

export interface IllustrationProps {
  /** Rendered width; height follows the drawing. */
  width?: number;
}

/** Decorative frame: hidden from assistive tech. */
function Frame({ width, name, children }: { width: number; name: string; children: ReactNode }) {
  const paint = usePaintFor();
  return (
    <PaintCtx.Provider value={paint}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`illustration-${name}`}
      >
        <Svg
          width={width}
          height={Math.round((width * 140) / 200)}
          viewBox="0 0 200 140"
          fill="none"
        >
          {children}
        </Svg>
      </View>
    </PaintCtx.Provider>
  );
}

function WelcomeArt() {
  const p = usePaint();
  const line = useLine();
  return (
    <>
      <Path d={bubblePath(22, 18, 100, 54, 'left')} fill={p.tone('glacier')} {...line} />
      <TextLines x={36} y={36} widths={[58, 34]} color={p.toneInk('glacier')} />
      <Path d={bubblePath(68, 56, 108, 54, 'right')} fill={p.bubble} {...line} />
      <TextLines x={82} y={74} widths={[66, 42]} />
      <LockSeal cx={170} cy={58} />
      <G {...line}>
        <Circle cx={30} cy={118} r={9} fill={p.tone('emerald')} />
        <Circle cx={46} cy={118} r={9} fill={p.tone('sky')} />
        <Circle cx={62} cy={118} r={9} fill={p.tone('lime')} />
      </G>
    </>
  );
}

/** Two overlapping bubbles, the front one sealed; three people in their tones. */
export function WelcomeIllustration({ width = 184 }: IllustrationProps) {
  return (
    <Frame width={width} name="welcome">
      <WelcomeArt />
    </Frame>
  );
}

function NoChatsArt() {
  const p = usePaint();
  const line = useLine();
  const env = p.tone('sky');
  return (
    <>
      <Rect x={36} y={70} width={128} height={56} rx={10} fill={env} {...line} />
      <Path d="M36 72 L100 26 L164 72 Z" fill={env} {...line} />
      <Path d={bubblePath(66, 44, 72, 46, 'left')} fill={p.bubble} {...line} />
      <TextLines x={78} y={58} widths={[44, 26]} />
      <Path
        d="M36 74 L100 104 L164 74 V116 A10 10 0 0 1 154 126 H46 A10 10 0 0 1 36 116 Z"
        fill={env}
        {...line}
      />
      <Path d="M36 116 L82 96 M164 116 L118 96" {...line} />
      <LockSeal cx={100} cy={28} r={12} />
    </>
  );
}

/** An open envelope, its seal on the flap, with a bubble rising out of it. */
export function NoChatsIllustration({ width = 176 }: IllustrationProps) {
  return (
    <Frame width={width} name="no-chats">
      <NoChatsArt />
    </Frame>
  );
}

function Face({ cx, cy, tone }: { cx: number; cy: number; tone: PersonToneName }) {
  const p = usePaint();
  const line = useLine();
  return (
    <G>
      <Circle cx={cx} cy={cy} r={21} fill={p.tone(tone)} {...line} />
      <G fill={p.toneInk(tone)}>
        <Circle cx={cx - 6} cy={cy - 3} r={1.9} />
        <Circle cx={cx + 6} cy={cy - 3} r={1.9} />
      </G>
      <Path
        d={`M${cx - 6} ${cy + 5} Q${cx} ${cy + 10} ${cx + 6} ${cy + 5}`}
        stroke={p.toneInk(tone)}
        {...STROKE}
      />
    </G>
  );
}

function NoFriendsArt() {
  const p = usePaint();
  const line = useLine();
  return (
    <>
      <Path d="M38 92 Q62 44 100 58" {...line} />
      <Path d="M100 58 Q138 44 162 92" {...line} strokeDasharray="1 5" />
      <Face cx={38} cy={92} tone="emerald" />
      <Face cx={100} cy={58} tone="ocean" />
      <Circle cx={162} cy={92} r={21} fill={p.surface} {...line} strokeDasharray="4 4" />
      <Circle cx={162} cy={92} r={10} fill={p.accent} {...line} />
      <Path d="M162 87.5V96.5M157.5 92H166.5" stroke={p.onAccent} {...STROKE} />
    </>
  );
}

/** Three seats joined by a line: two friends in their tones, the third one open. */
export function NoFriendsIllustration({ width = 176 }: IllustrationProps) {
  return (
    <Frame width={width} name="no-friends">
      <NoFriendsArt />
    </Frame>
  );
}

function NothingFoundArt() {
  const p = usePaint();
  const line = useLine();
  return (
    <>
      <Path d={bubblePath(30, 22, 106, 62, 'left')} fill={p.bubble} {...line} />
      <TextLines x={44} y={40} widths={[70, 52, 30]} />
      <Rect
        x={150}
        y={92}
        width={11}
        height={36}
        rx={5.5}
        transform="rotate(-45 155.5 110)"
        fill={p.accent}
        {...line}
      />
      <Circle cx={136} cy={86} r={25} fill={p.tone('aqua')} {...line} />
      <Circle cx={136} cy={86} r={18} fill="none" {...line} />
      <Path d="M127 86H145" {...line} strokeDasharray="1 4.5" />
    </>
  );
}

/** A bubble, and a magnifier over its corner that found nothing. */
export function NothingFoundIllustration({ width = 168 }: IllustrationProps) {
  return (
    <Frame width={width} name="nothing-found">
      <NothingFoundArt />
    </Frame>
  );
}

export const ILLUSTRATIONS = {
  welcome: WelcomeIllustration,
  noChats: NoChatsIllustration,
  noFriends: NoFriendsIllustration,
  nothingFound: NothingFoundIllustration,
} as const;
export type IllustrationName = keyof typeof ILLUSTRATIONS;
