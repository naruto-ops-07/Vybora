import { parseMentions, tokenizeText } from '@vybora/core';
import { cn } from '@/lib/cn';
import { toneVars } from '@/lib/tones';

/** Text with safe, clickable links (never rendered as HTML). */
export function Linkified({ text }: { text: string }) {
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
            {t.value}
          </a>
        ) : (
          <span key={i}>{t.value}</span>
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
}: {
  body: string;
  mentions?: readonly string[];
  nameOf: (userId: string) => string;
  /** On my own bubble: the fill only guarantees contrast for its own text colour. */
  onFill?: boolean;
  highContrast?: boolean;
}) {
  if (!mentions?.length) return <Linkified text={body} />;
  return (
    <>
      {parseMentions(body, mentions).map((s, i) => {
        if (s.type === 'text') return <Linkified key={i} text={s.text} />;
        const token = `@[${s.userId}]`;
        if (!s.valid) return <Linkified key={i} text={token} />;
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
