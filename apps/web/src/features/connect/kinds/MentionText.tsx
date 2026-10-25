import { matchRanges, parseMentions, tokenizeText } from '@vybora/core';
import { cn } from '@/lib/cn';
import { toneVars } from '@/lib/tones';

/**
 * A run of plain text with the search query marked. The ranges are computed over
 * this very string, so a match is marked wherever it really is on screen.
 */
function Marks({ text, match, current }: { text: string; match: string; current?: boolean }) {
  const ranges = matchRanges(text, match);
  if (!ranges.length) return <>{text}</>;
  const out = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) out.push(<span key={`t${at}`}>{text.slice(at, a)}</span>);
    out.push(
      <mark key={`m${a}`} className="vy-mark rounded-[3px]" data-current={current || undefined}>
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  if (at < text.length) out.push(<span key={`t${at}`}>{text.slice(at)}</span>);
  return <>{out}</>;
}

/** Text with safe, clickable links (never rendered as HTML). */
export function Linkified({
  text,
  match,
  current,
}: {
  text: string;
  /** The search query: its matches are marked in this text. */
  match?: string;
  current?: boolean;
}) {
  return (
    <>
      {tokenizeText(text).map((t, i) =>
        t.type === 'url' ? (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {match ? <Marks text={t.value} match={match} current={current} /> : t.value}
          </a>
        ) : (
          <span key={i}>
            {match ? <Marks text={t.value} match={match} current={current} /> : t.value}
          </span>
        ),
      )}
    </>
  );
}

/**
 * A message body with links and mentions. Only mentions the engine validated
 * (`mentions`) become `@Name`, in that person's tone: on my own (filled) bubble
 * and in high contrast the tone isn't certain of its contrast, so the name is
 * bold in the bubble's own text colour instead. Any other `@[id]` stays literal.
 */
export function MentionText({
  body,
  mentions,
  nameOf,
  onFill,
  highContrast,
  match,
  current,
}: {
  body: string;
  mentions?: readonly string[];
  nameOf: (userId: string) => string;
  /** On my own bubble: the fill only guarantees contrast for its own text colour. */
  onFill?: boolean;
  highContrast?: boolean;
  /** The search query: its matches are marked here. */
  match?: string;
  current?: boolean;
}) {
  if (!mentions?.length) return <Linkified text={body} match={match} current={current} />;
  return (
    <>
      {parseMentions(body, mentions).map((s, i) => {
        if (s.type === 'text')
          return <Linkified key={i} text={s.text} match={match} current={current} />;
        const token = `@[${s.userId}]`;
        if (!s.valid) return <Linkified key={i} text={token} match={match} current={current} />;
        const plain = onFill || highContrast;
        return (
          <span
            key={i}
            data-mention={s.userId}
            className={cn(plain ? 'font-bold' : 'font-semibold')}
            style={plain ? undefined : { color: toneVars(s.userId).text }}
          >
            @{nameOf(s.userId)}
          </span>
        );
      })}
    </>
  );
}
