import '@/lib/connect/polyfills';
import {
  announcePresence,
  createSupabaseConnectTransport,
  fetchConnectPrivacy,
  fetchSecureInbox,
  isMuted,
  qk,
  signOut,
  subscribeToSecureInbox,
  touchActivity,
  type SecureConversation,
} from '@vybora/api';
import { ConnectEngine, cryptoBackend, type LocalMessage } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { clearMediaCache, destroySecureStore, openSecureStore } from '@/lib/connect/storage';
import { playTone } from '@/lib/connect/tones';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'starting' | 'ready' | 'error';

interface ConnectState {
  engine: ConnectEngine | null;
  status: Status;
  error: string | null;
  backend: 'native' | 'adapter' | null;
  retry: () => void;
  /** Mark which conversation is on screen (suppresses its tone, enables read receipts). */
  setActiveConversation: (id: string | null) => void;
  /** Sync every conversation (previews, welcomes, tones). */
  syncAll: () => Promise<void>;
  /** Revoke this device, erase local keys/history, then sign out. */
  signOutAndWipe: () => Promise<void>;
}

const Ctx = createContext<ConnectState | null>(null);

export function ConnectProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [engine, setEngine] = useState<ConnectEngine | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = useRef<string | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!userId) {
      setEngine(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('starting');
    setError(null);
    (async () => {
      try {
        const store = await openSecureStore(userId);
        const label =
          [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') ||
          (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
        const e = new ConnectEngine(createSupabaseConnectTransport(supabase, userId), store, {
          userId,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          label: label.slice(0, 60),
        });
        await e.init();
        if (cancelled) return;
        setEngine(e);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  // Re-render message lists whenever the engine stores something.
  useEffect(() => {
    if (!engine) return;
    return engine.onChange((conversationId) => {
      void qc.invalidateQueries({ queryKey: qk.connect.messages(conversationId) });
      void qc.invalidateQueries({ queryKey: qk.connect.previews });
    });
  }, [engine, qc]);

  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId!),
    enabled: !!userId,
  });

  const syncAll = useCallback(async () => {
    if (!engine || syncing.current) return;
    syncing.current = true;
    try {
      const inbox = await qc.fetchQuery({
        queryKey: qk.connect.inbox,
        queryFn: () => fetchSecureInbox(supabase),
        staleTime: 2_000,
      });
      for (const conv of inbox.slice(0, 40)) {
        const before = (await engine.listMessages(conv.id, { limit: 1 }))[0];
        await engine.sync(conv.id).catch(() => undefined);
        const after = (await engine.listMessages(conv.id, { limit: 1 }))[0];
        if (after && after.id !== before?.id && after.senderId !== userId) maybeChime(conv, after);
      }
      void qc.invalidateQueries({ queryKey: qk.connect.previews });
    } finally {
      syncing.current = false;
    }
    function maybeChime(conv: SecureConversation, m: LocalMessage) {
      const p = privacy.data;
      if (AppState.currentState !== 'active' || active.current === conv.id) return;
      if (p && !p.notifications_enabled) return;
      if (!conv.notificationsEnabled || isMuted(conv) || m.status === 'undecryptable') return;
      void playTone(conv.tone);
    }
  }, [engine, qc, userId, privacy.data]);

  // Realtime signal → refresh inbox + background sync. Postgres stays the source of truth.
  useEffect(() => {
    if (!engine) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToSecureInbox(supabase, () => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncAll(), 400);
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void qc.invalidateQueries({ queryKey: qk.connect.inbox });
        void syncAll();
      }
    });
    void syncAll();
    return () => {
      unsubscribe();
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [engine, qc, syncAll]);

  // Online presence only if the user allows it.
  useEffect(() => {
    if (!engine || !userId || !privacy.data?.show_online) return;
    return announcePresence(supabase, userId);
  }, [engine, userId, privacy.data?.show_online]);

  // "Last seen": only recorded while the user shows their online status.
  useEffect(() => {
    if (!engine || !userId || !privacy.data?.show_online) return;
    const touch = () => {
      if (AppState.currentState === 'active') void touchActivity(supabase).catch(() => undefined);
    };
    touch();
    const timer = setInterval(touch, 120_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && touch());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [engine, userId, privacy.data?.show_online]);

  const value = useMemo<ConnectState>(
    () => ({
      engine,
      status,
      error,
      backend: cryptoBackend(),
      retry: () => setAttempt((a) => a + 1),
      setActiveConversation: (id) => {
        active.current = id;
      },
      syncAll,
      signOutAndWipe: async () => {
        if (engine) await engine.signOutAndWipe().catch(() => undefined);
        if (userId) await destroySecureStore(userId).catch(() => undefined);
        clearMediaCache();
        await signOut(supabase);
      },
    }),
    [engine, status, error, syncAll, userId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConnect() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConnect must be used within ConnectProvider');
  return ctx;
}
