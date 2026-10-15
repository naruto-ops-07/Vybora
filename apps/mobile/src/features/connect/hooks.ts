import {
  acknowledgeConversation,
  fetchNicknames,
  fetchSecureInbox,
  joinTypingChannel,
  peerOf,
  qk,
  subscribeToSecureConversation,
  type SecureConversation,
} from '@vybora/api';
import type { LocalMessage } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMe } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useConnect } from './ConnectProvider';

export function useSecureInbox() {
  return useQuery({
    queryKey: qk.connect.inbox,
    queryFn: () => fetchSecureInbox(supabase),
    staleTime: 5_000,
  });
}

export function useNicknames() {
  return useQuery({
    queryKey: qk.connect.nicknames,
    queryFn: () => fetchNicknames(supabase),
    staleTime: 60_000,
  });
}

/** Display name for a conversation: private nickname > group title > name > username. */
export function conversationTitle(
  conv: SecureConversation,
  myId: string,
  nicknames: Record<string, string> = {},
): string {
  if (conv.kind === 'group')
    return (
      conv.title ||
      conv.members
        .filter((m) => m.id !== myId)
        .map((m) => nicknames[m.id] ?? m.display_name ?? m.username)
        .join(', ') ||
      'Group'
    );
  const peer = peerOf(conv, myId);
  if (!peer) return 'Unknown';
  return nicknames[peer.id] || peer.display_name || peer.username;
}

export function useConversation(id: string) {
  const inbox = useSecureInbox();
  return { ...inbox, data: inbox.data?.find((c) => c.id === id) };
}

/** Latest decrypted message per conversation (local only). */
export function usePreviews(ids: string[]) {
  const { engine } = useConnect();
  return useQuery({
    queryKey: [...qk.connect.previews, ids.join(',')],
    enabled: !!engine && ids.length > 0,
    queryFn: async () => {
      const out: Record<string, LocalMessage | undefined> = {};
      for (const id of ids) out[id] = (await engine!.listMessages(id, { limit: 1 }))[0];
      return out;
    },
  });
}

/**
 * Messages for one conversation: local decrypted history + sync on open,
 * on realtime signals and on reconnect. Acknowledges delivery/read only while
 * the screen is focused and the app is in the foreground.
 */
export function useSecureMessages(conversationId: string, focused: boolean) {
  const { engine, setActiveConversation } = useConnect();
  const { userId } = useMe();
  const qc = useQueryClient();
  const [syncState, setSyncState] = useState<
    'syncing' | 'ready' | 'waiting_for_access' | 'broken' | 'offline'
  >('syncing');
  const [live, setLive] = useState(true);
  const lastAck = useRef(0);

  const messages = useQuery({
    queryKey: qk.connect.messages(conversationId),
    enabled: !!engine,
    queryFn: () => engine!.listMessages(conversationId, { limit: 500 }),
  });

  const sync = useCallback(async () => {
    if (!engine) return;
    try {
      const r = await engine.sync(conversationId);
      setSyncState(r.status);
    } catch (e) {
      setSyncState((e as { code?: string }).code === 'network' ? 'offline' : 'ready');
    }
    void qc.invalidateQueries({ queryKey: qk.connect.messages(conversationId) });
  }, [engine, conversationId, qc]);

  useEffect(() => {
    if (!engine) return;
    void sync();
    let connectedBefore = false;
    const unsubscribe = subscribeToSecureConversation(supabase, conversationId, {
      onEnvelope: () => void sync(),
      onMetadata: () => void qc.invalidateQueries({ queryKey: qk.connect.inbox }),
      onStatus: (s) => {
        if (s === 'SUBSCRIBED') {
          if (connectedBefore) void sync(); // catch up after reconnect
          connectedBefore = true;
          setLive(true);
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setLive(false);
      },
    });
    const appSub = AppState.addEventListener(
      'change',
      (state) => state === 'active' && void sync(),
    );
    return () => {
      unsubscribe();
      appSub.remove();
    };
  }, [engine, conversationId, sync, qc]);

  useEffect(() => {
    setActiveConversation(focused ? conversationId : null);
    return () => setActiveConversation(null);
  }, [focused, conversationId, setActiveConversation]);

  // Read/delivery receipts.
  const maxSeq = useMemo(
    () => Math.max(0, ...(messages.data ?? []).map((m) => m.seq ?? 0)),
    [messages.data],
  );
  useEffect(() => {
    if (!focused || !maxSeq || maxSeq <= lastAck.current || AppState.currentState !== 'active')
      return;
    lastAck.current = maxSeq;
    void acknowledgeConversation(supabase, conversationId, maxSeq, maxSeq).then(() => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      void qc.invalidateQueries({ queryKey: qk.unread });
    });
  }, [focused, maxSeq, conversationId, qc]);

  return { messages, sync, syncState, live, userId };
}

/** Ephemeral typing indicators (respects the user's own setting for sending). */
export function useTyping(conversationId: string, enabled: boolean) {
  const { userId } = useMe();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channel = useRef<ReturnType<typeof joinTypingChannel> | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastSent = useRef(0);

  useEffect(() => {
    const timersMap = timers.current;
    const ch = joinTypingChannel(supabase, conversationId, userId, (who, typing) => {
      const existing = timersMap.get(who);
      if (existing) clearTimeout(existing);
      if (typing) {
        setTypingUsers((u) => (u.includes(who) ? u : [...u, who]));
        timersMap.set(
          who,
          setTimeout(() => setTypingUsers((u) => u.filter((x) => x !== who)), 5000),
        );
      } else setTypingUsers((u) => u.filter((x) => x !== who));
    });
    channel.current = ch;
    return () => {
      ch.leave();
      timersMap.forEach(clearTimeout);
      timersMap.clear();
    };
  }, [conversationId, userId]);

  const notifyTyping = useCallback(
    (typing: boolean) => {
      if (!enabled) return;
      const now = Date.now();
      if (typing && now - lastSent.current < 2500) return;
      lastSent.current = typing ? now : 0;
      channel.current?.send(typing);
    },
    [enabled],
  );

  return { typingUsers, notifyTyping };
}
