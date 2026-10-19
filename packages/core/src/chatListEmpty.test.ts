import { describe, expect, it } from 'vitest';
import { CHAT_LIST_EMPTY_COPY, chatListEmptyState } from './chatListEmpty';

describe('chatListEmptyState', () => {
  it('stays neutral while the friends list loads', () => {
    expect(chatListEmptyState({ friendsLoaded: false, friendCount: 0, outgoingCount: 0 })).toBe(
      'loading',
    );
    expect(chatListEmptyState({ friendsLoaded: false, friendCount: 3, outgoingCount: 1 })).toBe(
      'loading',
    );
  });

  it('no friends and no requests sent: no-friends', () => {
    expect(chatListEmptyState({ friendsLoaded: true, friendCount: 0, outgoingCount: 0 })).toBe(
      'no-friends',
    );
  });

  it('no friends but requests sent: waiting', () => {
    expect(chatListEmptyState({ friendsLoaded: true, friendCount: 0, outgoingCount: 2 })).toBe(
      'waiting',
    );
    expect(chatListEmptyState({ friendsLoaded: true, friendCount: 0, outgoingCount: 1 })).toBe(
      'waiting',
    );
  });

  it('at least one friend: say-hi', () => {
    expect(chatListEmptyState({ friendsLoaded: true, friendCount: 1, outgoingCount: 0 })).toBe(
      'say-hi',
    );
    expect(chatListEmptyState({ friendsLoaded: true, friendCount: 4, outgoingCount: 2 })).toBe(
      'say-hi',
    );
  });
});

describe('CHAT_LIST_EMPTY_COPY', () => {
  it('fresh account', () => {
    expect(CHAT_LIST_EMPTY_COPY['no-friends']).toEqual({
      title: 'No friends yet',
      body: 'Find your friends by their username and start chatting.',
      action: 'Find friends',
      secondaryAction: 'Share your username',
    });
  });

  it('waiting on requests, pluralised', () => {
    const c = CHAT_LIST_EMPTY_COPY.waiting;
    expect(c.title).toBe('No friends yet');
    expect(c.action).toBe('Find friends');
    expect(c.body(1)).toBe('Waiting on 1 request. Find more friends while you wait.');
    expect(c.body(2)).toBe('Waiting on 2 requests. Find more friends while you wait.');
  });

  it('friends but no chats', () => {
    expect(CHAT_LIST_EMPTY_COPY['say-hi']).toEqual({
      title: 'No chats yet',
      body: 'Say hi to a friend.',
      action: 'New message',
    });
  });
});
