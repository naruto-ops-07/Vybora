import { describe, expect, it } from 'vitest';
import {
  GET_STARTED_STEPS,
  emptyOnboarding,
  friendInviteLink,
  getStartedProgress,
  onboardingKey,
  orderQuickPick,
  parseOnboarding,
  usernameFromAddParam,
} from './onboarding';

describe('onboarding storage record', () => {
  it('is keyed per user', () => {
    expect(onboardingKey('u1')).toBe('vybora.onboarding.u1');
  });

  it('parses a saved record and ignores anything that is not a boolean', () => {
    expect(
      parseOnboarding(JSON.stringify({ shared: true, dismissed: 'yes', done: 1, extra: true })),
    ).toEqual({ ...emptyOnboarding(), shared: true });
  });

  it.each([null, '', 'not json', '42', 'null', '[]', '"x"'])(
    'treats %j as a fresh start',
    (raw) => {
      expect(parseOnboarding(raw)).toEqual(emptyOnboarding());
    },
  );
});

describe('get started progress', () => {
  const base = {
    record: emptyOnboarding(),
    friendCount: 0,
    outgoingCount: 0,
    lastSenderIds: [] as (string | undefined)[],
    myUserId: 'me',
  };

  it('lists three steps in order', () => {
    expect(GET_STARTED_STEPS).toEqual(['share', 'friend', 'hi']);
  });

  it('starts at 0 of 3', () => {
    expect(getStartedProgress(base)).toEqual({
      steps: { share: false, friend: false, hi: false },
      done: 0,
      complete: false,
    });
  });

  it('share is done once the handle was copied or shared (stored)', () => {
    const p = getStartedProgress({ ...base, record: { ...emptyOnboarding(), shared: true } });
    expect(p.steps.share).toBe(true);
    expect(p.done).toBe(1);
  });

  it('add a friend is done with one friend or one outgoing request', () => {
    expect(getStartedProgress({ ...base, friendCount: 1 }).steps.friend).toBe(true);
    expect(getStartedProgress({ ...base, outgoingCount: 1 }).steps.friend).toBe(true);
  });

  it('say hi is done when any chat’s latest message is mine', () => {
    expect(getStartedProgress({ ...base, lastSenderIds: ['them', undefined] }).steps.hi).toBe(
      false,
    );
    expect(getStartedProgress({ ...base, lastSenderIds: ['them', 'me'] }).steps.hi).toBe(true);
  });

  it('steps once seen stay done, so removing a friend never undoes progress', () => {
    const record = { ...emptyOnboarding(), friend: true, saidHi: true };
    const p = getStartedProgress({ ...base, record });
    expect(p.steps).toEqual({ share: false, friend: true, hi: true });
  });

  it('is complete at 3 of 3', () => {
    const p = getStartedProgress({
      ...base,
      record: { ...emptyOnboarding(), shared: true },
      friendCount: 2,
      lastSenderIds: ['me'],
    });
    expect(p).toMatchObject({ done: 3, complete: true });
  });
});

describe('friend invite link', () => {
  it('points at the friends page with the username to add', () => {
    expect(friendInviteLink('https://vybora.app', 'maya.rose')).toBe(
      'https://vybora.app/friends?add=maya.rose',
    );
  });

  it('drops trailing slashes from the site URL', () => {
    expect(friendInviteLink('https://vybora.app//', 'maya')).toBe(
      'https://vybora.app/friends?add=maya',
    );
  });

  it('encodes the username', () => {
    expect(friendInviteLink('https://x.test', 'a b&c')).toBe(
      'https://x.test/friends?add=a%20b%26c',
    );
  });
});

describe('?add= prefill', () => {
  it('normalises a username the way the add field does', () => {
    expect(usernameFromAddParam(' @Maya.Rose ')).toBe('maya.rose');
    expect(usernameFromAddParam('kofi_m')).toBe('kofi_m');
  });

  it.each([null, '', '@', 'a', 'has space', '<script>', 'x'.repeat(31), 'emoji😀'])(
    'ignores %j',
    (raw) => {
      expect(usernameFromAddParam(raw)).toBeNull();
    },
  );
});

describe('new message quick-pick order', () => {
  const f = (userId: string, displayName: string | null, username = userId) => ({
    userId,
    displayName,
    username,
  });

  it('puts the most recent chats first, then everyone else by name', () => {
    const friends = [f('a', 'Zed'), f('b', 'Ines'), f('c', null, 'adele'), f('d', 'Kofi')];
    const activity = { d: '2026-10-17T09:00:00Z', b: '2026-10-17T10:00:00Z' };
    expect(orderQuickPick(friends, activity).map((x) => x.userId)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('breaks equal activity by name', () => {
    const t = '2026-10-17T09:00:00Z';
    const friends = [f('a', 'Theo'), f('b', 'Ines')];
    expect(orderQuickPick(friends, { a: t, b: t }).map((x) => x.userId)).toEqual(['b', 'a']);
  });

  it('does not change the input', () => {
    const friends = [f('a', 'Zed'), f('b', 'Ines')];
    orderQuickPick(friends, {});
    expect(friends.map((x) => x.userId)).toEqual(['a', 'b']);
  });
});
