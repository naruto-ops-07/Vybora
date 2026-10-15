export type CaptionToken =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; tag: string }
  | { type: 'mention'; value: string; username: string }
  | { type: 'url'; value: string; href: string };

// Kept in sync with the SQL in 0003_content.sql (extract_hashtags / notify_mentions).
const TOKEN_RE = /(#[A-Za-z0-9_]{1,50})|(@[A-Za-z0-9._]{3,30})|(https?:\/\/[^\s]+)/g;

/** Split a caption/comment into renderable tokens (never produces HTML). */
export function tokenizeText(input: string): CaptionToken[] {
  const tokens: CaptionToken[] = [];
  let last = 0;
  for (const match of input.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: 'text', value: input.slice(last, index) });
    const [value, hashtag, mention, url] = match;
    if (hashtag) tokens.push({ type: 'hashtag', value, tag: hashtag.slice(1).toLowerCase() });
    else if (mention) {
      const username = mention.slice(1).replace(/\.+$/, '').toLowerCase();
      tokens.push({ type: 'mention', value: `@${username}`, username });
      const trailing = mention.slice(1 + username.length);
      if (trailing) tokens.push({ type: 'text', value: trailing });
    } else if (url) {
      const clean = url.replace(/[).,!?]+$/, '');
      tokens.push({ type: 'url', value: clean, href: clean });
      if (clean.length < url.length) tokens.push({ type: 'text', value: url.slice(clean.length) });
    }
    last = index + value.length;
  }
  if (last < input.length) tokens.push({ type: 'text', value: input.slice(last) });
  return tokens;
}

export function extractHashtags(input: string): string[] {
  const set = new Set<string>();
  for (const m of input.matchAll(/#([A-Za-z0-9_]{1,50})/g)) {
    set.add(m[1]!.toLowerCase());
    if (set.size >= 30) break;
  }
  return [...set];
}

/** Returns the partial @mention being typed at the caret, if any (for autocomplete). */
export function activeMention(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([a-z0-9._]{0,30})$/i.exec(before);
  return m ? m[2]!.toLowerCase() : null;
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
