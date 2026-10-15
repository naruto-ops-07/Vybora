import {
  announcePresence,
  createSupabaseConnectTransport,
  fetchConnectPrivacy,
  fetchSecureInbox,
  isMuted,
  qk,
  signOut,
  subscribeToSecureInbox,
  type SecureConversation,
} from '@vybora/api';
import { ConnectEngine, cryptoBackend, type LocalMessage } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useAuth } from '@/features/auth/AuthProvider';
import { acquireEngineLock, destroySecureStore, openSecureStore } from '@/lib/connect/storage';
import { playTone } from '@/lib/connect/tones';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'starting' | 'ready' | 'error' | 'elsewhere';

interface ConnectState {
  engine: ConnectEngine | null;
  status: Status;
  error: string | null;
  backend: 'native' | 'adapter' | null;
  retry: () => void;
  /** Take over secure messaging from another open tab. */
  useHere: () => void;
  setActiveConversation: (id: string | null) => void;
  syncAll: () => Promise<void>;
  signOutAndWipe: () => Promise<void>;
}

const Ctx = createContext<ConnectState | null>(null);

function browserLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Hosts this browser's Connect engine (one per browser profile, enforced with
 * Web Locks). Mounted lazily by the Messages area so the rest of the site
 * never loads the crypto bundle.
 */
export function ConnectProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [engine, setEngine] = useState<ConnectEngine | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [steal, setSteal] = useState(false);
  const active = useRef<string | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!userId) {
      setEngine(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    let release: (() => void) | null = null;
    setStatus('starting');
    setError(null);
    (async () => {
      try {
        const lock = await acquireEngineLock(userId, steal);
        if (cancelled) return lock?.release();
        if (!lock) {
          setStatus('elsewhere');
          return;
        }
        release = lock.release;
        void lock.lost.then(() => {
          if (cancelled) return;
          setEngine(null);
          setStatus('elsewhere');
        });
        const store = await openSecureStore(userId);
        const e = new ConnectEngine(createSupabaseConnectTransport(supabase, userId), store, {
          userId,
          platform: 'web',
          label: browserLabel(),
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
      release?.();
    };
  }, [userId, attempt, steal]);

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
      if (active.current === conv.id && document.visibilityState === 'visible') return;
      if (p && !p.notifications_enabled) return;
      if (!conv.notificationsEnabled || isMuted(conv) || m.status === 'undecryptable') return;
      playTone(conv.tone);
    }
  }, [engine, qc, userId, privacy.data]);

  useEffect(() => {
    if (!engine) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToSecureInbox(supabase, () => {
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncAll(), 400);
    });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void qc.invalidateQueries({ queryKey: qk.connect.inbox });
      void syncAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    void syncAll();
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [engine, qc, syncAll]);

  useEffect(() => {
    if (!engine || !userId || !privacy.data?.show_online) return;
    return announcePresence(supabase, userId);
  }, [engine, userId, privacy.data?.show_online]);

  const value = useMemo<ConnectState>(
    () => ({
      engine,
      status,
      error,
      backend: cryptoBackend(),
      retry: () => setAttempt((a) => a + 1),
      useHere: () => setSteal(true),
      setActiveConversation: (id) => {
        active.current = id;
      },
      syncAll,
      signOutAndWipe: async () => {
        if (engine) await engine.signOutAndWipe().catch(() => undefined);
        if (userId) await destroySecureStore(userId);
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
