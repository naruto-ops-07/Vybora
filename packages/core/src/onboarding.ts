import { normalizeUsername } from './friends';

/**
 * First run ("Get started") and the shareable username. Pure rules shared by
 * web and mobile; each app stores the record itself (localStorage / SecureStore).
 */

export type GetStartedStep = 'share' | 'friend' | 'hi';
export const GET_STARTED_STEPS: readonly GetStartedStep[] = ['share', 'friend', 'hi'];

/** What this device remembers for one user. Steps once seen stay done. */
export interface OnboardingRecord {
  /** Copied or shared their username. */
  shared: boolean;
  /** Had a friend or an outgoing request at some point. */
  friend: boolean;
  /** Sent a message in some chat at some point. */
  saidHi: boolean;
  /** Hid the panel. */
  dismissed: boolean;
  /** Reached 3 of 3 (shown "You're all set" once, then never again). */
  done: boolean;
}

export const emptyOnboarding = (): OnboardingRecord => ({
  shared: false,
  friend: false,
  saidHi: false,
  dismissed: false,
  done: false,
});

export const onboardingKey = (userId: string) => `vybora.onboarding.${userId}`;

/** A stored record, tolerant of anything malformed (treated as a fresh start). */
export function parseOnboarding(raw: string | null | undefined): OnboardingRecord {
  const out = emptyOnboarding();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const key of Object.keys(out) as (keyof OnboardingRecord)[]) {
    const v = (data as Record<string, unknown>)[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export interface GetStartedInput {
  record: OnboardingRecord;
  friendCount: number;
  outgoingCount: number;
  /** Sender of each chat's latest message (undefined when unknown or empty). */
  lastSenderIds: readonly (string | undefined)[];
  myUserId: string;
}

export interface GetStartedProgress {
  steps: Record<GetStartedStep, boolean>;
  done: number;
  complete: boolean;
}

/**
 * 1. Share your username: copied or shared (stored).
 * 2. Add a friend: at least one friend or one outgoing request.
 * 3. Say hi: some chat's latest message is mine.
 * A step seen done before (stored) stays done.
 */
export function getStartedProgress({
  record,
  friendCount,
  outgoingCount,
  lastSenderIds,
  myUserId,
}: GetStartedInput): GetStartedProgress {
  const steps: Record<GetStartedStep, boolean> = {
    share: record.shared,
    friend: record.friend || friendCount > 0 || outgoingCount > 0,
    hi: record.saidHi || lastSenderIds.some((id) => !!id && id === myUserId),
  };
  const done = GET_STARTED_STEPS.filter((s) => steps[s]).length;
  return { steps, done, complete: done === GET_STARTED_STEPS.length };
}

/** `${siteUrl}/friends?add=<username>`: opens the add-friend field prefilled. */
export function friendInviteLink(siteUrl: string, username: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/friends?add=${encodeURIComponent(username)}`;
}

const USERNAME_SHAPE = /^[a-z0-9._]{3,30}$/;

/**
 * The username from a `?add=` link, normalised like the add field, or null
 * when it can't be a username. Only ever prefills; never sends a request.
 */
export function usernameFromAddParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = normalizeUsername(raw);
  return USERNAME_SHAPE.test(u) ? u : null;
}

export interface QuickPickPerson {
  userId: string;
  displayName?: string | null;
  username: string;
}

/** How many friends the new-message quick-pick shows before "Show all friends". */
export const QUICK_PICK_LIMIT = 8;

/**
 * Friends for the new-message quick-pick: most recent direct-chat activity
 * first (ISO times by peer id), then by name. Returns a new array.
 */
export function orderQuickPick<T extends QuickPickPerson>(
  friends: readonly T[],
  lastActivity: Readonly<Record<string, string | undefined>>,
): T[] {
  const name = (p: T) => p.displayName || p.username;
  return [...friends].sort((a, b) => {
    const ta = lastActivity[a.userId] ?? '';
    const tb = lastActivity[b.userId] ?? '';
    return tb.localeCompare(ta) || name(a).localeCompare(name(b));
  });
}
