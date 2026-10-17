import { describe, expect, it } from 'vitest';
import { directChatActivity, isMuted, muteUntil, peerOf } from './connect';

const now = Date.parse('2026-10-09T12:00:00Z');

describe('mute helpers', () => {
  it('computes mute deadlines for each preset', () => {
    expect(muteUntil('1h', now)).toBe('2026-10-09T13:00:00.000Z');
    expect(muteUntil('8h', now)).toBe('2026-10-09T20:00:00.000Z');
    expect(muteUntil('1w', now)).toBe('2026-10-16T12:00:00.000Z');
    expect(muteUntil('always', now)).toBe('infinity');
  });

  it('treats "always" (Postgres infinity) as muted', () => {
    expect(isMuted({ mutedUntil: 'infinity' }, now)).toBe(true);
    expect(isMuted({ mutedUntil: muteUntil('always', now) }, now)).toBe(true);
  });

  it('expires timed mutes', () => {
    expect(isMuted({ mutedUntil: muteUntil('1h', now) }, now)).toBe(true);
    expect(isMuted({ mutedUntil: muteUntil('1h', now) }, now + 3_600_001)).toBe(false);
    expect(isMuted({ mutedUntil: null }, now)).toBe(false);
  });
});

describe('peerOf', () => {
  const member = (id: string) => ({
    id,
    username: id,
    display_name: '',
    avatar_path: null,
    role: 'member' as const,
    delivered_seq: 0,
    read_seq: 0,
  });
  it('returns the other person only in direct chats', () => {
    expect(peerOf({ kind: 'direct', members: [member('me'), member('them')] }, 'me')?.id).toBe(
      'them',
    );
    expect(peerOf({ kind: 'group', members: [member('me'), member('them')] }, 'me')).toBeNull();
  });
});

describe('directChatActivity', () => {
  const member = (id: string) => ({
    id,
    username: id,
    display_name: '',
    avatar_path: null,
    role: 'member' as const,
    delivered_seq: 0,
    read_seq: 0,
  });
  const conv = (kind: 'direct' | 'group', ids: string[], lastMessageAt: string) => ({
    kind,
    members: ids.map(member),
    lastMessageAt,
  });

  it('maps each direct-chat peer to that chat’s latest activity; groups are ignored', () => {
    expect(
      directChatActivity(
        [
          conv('direct', ['me', 'ines'], '2026-10-17T09:00:00Z'),
          conv('group', ['me', 'theo', 'kofi'], '2026-10-17T11:00:00Z'),
          conv('direct', ['kofi', 'me'], '2026-10-16T08:00:00Z'),
        ],
        'me',
      ),
    ).toEqual({ ines: '2026-10-17T09:00:00Z', kofi: '2026-10-16T08:00:00Z' });
  });

  it('keeps the newest when two direct chats share a peer', () => {
    expect(
      directChatActivity(
        [
          conv('direct', ['me', 'ines'], '2026-10-15T09:00:00Z'),
          conv('direct', ['me', 'ines'], '2026-10-17T09:00:00Z'),
        ],
        'me',
      ),
    ).toEqual({ ines: '2026-10-17T09:00:00Z' });
  });

  it('is empty without chats', () => {
    expect(directChatActivity(undefined, 'me')).toEqual({});
  });
});
