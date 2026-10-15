import { tokenizeText } from '@vybora/core';
import { Link } from 'react-router';

/** Renders captions/comments as React text nodes + safe links (never HTML). */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {tokenizeText(text).map((t, i) => {
        switch (t.type) {
          case 'hashtag':
            return (
              <Link
                key={i}
                to={`/tags/${encodeURIComponent(t.tag)}`}
                className="font-medium text-accent hover:underline"
              >
                {t.value}
              </Link>
            );
          case 'mention':
            return (
              <Link
                key={i}
                to={`/u/${encodeURIComponent(t.username)}`}
                className="font-medium text-accent hover:underline"
              >
                {t.value}
              </Link>
            );
          case 'url':
            return (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="text-accent hover:underline"
              >
                {t.value.replace(/^https?:\/\//, '')}
              </a>
            );
          default:
            return <span key={i}>{t.value}</span>;
        }
      })}
    </span>
  );
}
