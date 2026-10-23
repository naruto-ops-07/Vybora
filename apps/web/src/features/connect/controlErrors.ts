import { friendlyError } from '@vybora/core';

/** Message actions whose failures get their own words. */
export type ControlKind =
  'edit' | 'pin' | 'vote' | 'reaction' | 'delete' | 'forward' | 'star' | 'unstar' | 'viewOnce';

const REFUSED: Partial<Record<ControlKind, string>> = {
  edit: 'This message can no longer be edited',
  pin: 'This message can’t be pinned right now',
  vote: 'This poll didn’t take your vote',
  reaction: 'That reaction wasn’t added',
  delete: 'This message can’t be deleted for everyone',
  forward: 'This message can’t be forwarded',
};

/** Controls the engine keeps and re-delivers on the next sync after a network failure. */
const RETRIED = new Set<ControlKind>(['edit', 'pin', 'vote', 'reaction']);

/**
 * What to tell someone when a message action fails. `forbidden` is a refusal (the
 * rules said no). `network`/`unknown` on a control means it is kept and sent again
 * on the next sync, so the copy says it will retry.
 */
export function controlErrorText(kind: ControlKind, error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code;
  if (kind === 'star') return 'Couldn’t star this message. Try again.';
  if (kind === 'unstar') return 'Couldn’t remove the star. Try again.';
  if (kind === 'viewOnce')
    return 'Couldn’t open it. Check your connection and try again. It’s still unopened.';
  if (code === 'forbidden' && e?.message?.includes('invalid_mentions'))
    return 'Some mentions aren’t in this chat any more';
  if (code === 'forbidden') return REFUSED[kind] ?? friendlyError(error);
  if (code === 'not_ready')
    return 'This browser is still being added to the conversation. Try again in a moment.';
  if (code === 'network' || code === 'unknown') {
    if (kind === 'delete')
      return 'Couldn’t delete for everyone yet. It will retry when you’re back online.';
    if (RETRIED.has(kind)) return 'Couldn’t send yet. It will retry.';
    if (kind === 'forward') return 'Couldn’t forward. Check your connection and try again.';
  }
  return friendlyError(error);
}

/** Captions are capped at 2000 characters (the payload schema's limit). */
export const MAX_CAPTION = 2000;
