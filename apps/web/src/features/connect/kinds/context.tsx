import type { LocalMessage } from '@vybora/e2ee';
import { createContext, useContext, type ReactNode } from 'react';

/** A contact card's person, as the SERVER knows them (never the card's own fields). */
export interface ContactProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
}

export type ContactRelation = 'self' | 'friends' | 'outgoing' | 'incoming' | 'none';

export type ContactState =
  | { status: 'loading' }
  | { status: 'missing' }
  /** The lookup failed (offline, server error): never shown as "VYBORA user". */
  | { status: 'error' }
  | { status: 'found'; profile: ContactProfile; relation: ContactRelation; adding?: boolean };

/**
 * What the new message kinds need from the chat around them: the server
 * profile behind a contact card, voting, and opening view-once media. The
 * chat pane provides the real thing; tests and the dev gallery pass fakes.
 */
export interface MessageKinds {
  isGroup: boolean;
  /** A hook: resolve a contact card's person by user id from the server. */
  useContact: (userId: string) => ContactState;
  onMessageContact: (profile: ContactProfile) => void;
  /** `accept`: they already asked me, so this accepts their request (by id). */
  onAddFriend: (profile: ContactProfile, accept: boolean) => void;
  /** Resolves once the server has stored the vote (true) or it was refused (false). */
  onVote: (poll: LocalMessage, choices: number[]) => Promise<boolean>;
  /** Resolves once it has opened (or failed); a second tap waits for it. */
  onOpenViewOnce: (message: LocalMessage) => Promise<void> | void;
}

const useNoContact = (): ContactState => ({ status: 'missing' });

/** Inert: contacts unresolved, no voting, nothing opens. */
export const INERT_KINDS: MessageKinds = {
  isGroup: false,
  useContact: useNoContact,
  onMessageContact: () => undefined,
  onAddFriend: () => undefined,
  onVote: async () => false,
  onOpenViewOnce: () => undefined,
};

const Ctx = createContext<MessageKinds>(INERT_KINDS);

export function MessageKindsProvider({
  value,
  children,
}: {
  value: MessageKinds;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMessageKinds = () => useContext(Ctx);
