import { friendlyError } from '@vybora/core';

/** The message actions that travel as encrypted controls after a message was sent. */
export type ControlKind = 'edit' | 'pin' | 'vote' | 'reaction' | 'delete' | 'forward';

const REFUSED: Record<ControlKind, string> = {
  edit: 'This message can no longer be edited',
  pin: 'This message can’t be pinned right now',
  vote: 'This poll didn’t take your vote',
  reaction: 'That reaction wasn’t added',
  delete: 'This message can’t be deleted for everyone',
  forward: 'This message can’t be forwarded',
};

/**
 * What to tell someone when a message action fails. `forbidden` is a refusal
 * (the rules said no). `network`/`unknown` on edit, pin, vote and reaction are
 * kept and retried on the next sync, so they say so. A delete for everyone is
 * not replayed, so it asks the person to try again.
 */
export function controlErrorText(kind: ControlKind, error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'forbidden') return REFUSED[kind];
  if (code === 'not_ready')
    return 'This browser is still being added to the conversation. Try again in a moment.';
  if (kind === 'delete' && (code === 'network' || code === 'unknown'))
    return 'Couldn’t delete for everyone. Check your connection and try again.';
  if (kind === 'forward' && code === 'network')
    return 'Couldn’t forward. Check your connection and try again.';
  if (code === 'network' || code === 'unknown') return 'Couldn’t send yet. It will retry.';
  return friendlyError(error);
}
