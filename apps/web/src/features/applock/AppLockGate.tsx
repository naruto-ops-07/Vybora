import { signOut } from '@vybora/api';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { AppLockProvider, useAppLock } from './AppLockProvider';
import { LockScreen } from './LockScreen';

/**
 * While locked, everything else in <body> (the app root, dialogs and toasts portaled
 * outside it) is inert and hidden from assistive tech: no focus, no announcements.
 */
function useIsolate(host: HTMLElement | null) {
  useEffect(() => {
    if (!host) return;
    const touched = new Map<Element, { inert: boolean; hidden: string | null }>();
    const hide = (el: Element) => {
      if (el === host || touched.has(el) || !(el instanceof HTMLElement)) return;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      touched.set(el, { inert: el.hasAttribute('inert'), hidden: el.getAttribute('aria-hidden') });
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    };
    [...document.body.children].forEach(hide);
    const obs = new MutationObserver((list) =>
      list.forEach((m) => m.addedNodes.forEach((n) => n instanceof Element && hide(n))),
    );
    obs.observe(document.body, { childList: true });
    return () => {
      obs.disconnect();
      touched.forEach((was, el) => {
        if (!was.inert) el.removeAttribute('inert');
        if (was.hidden === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', was.hidden);
      });
    };
  }, [host]);
}

/** Keeps the workspace mounted (drafts survive) but hidden and inert while locked. */
export function AppLockCover({ children }: { children: ReactNode }) {
  const lock = useAppLock();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!lock.locked) return;
    const el = document.createElement('div');
    el.dataset.applock = '';
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [lock.locked]);
  useIsolate(lock.locked ? host : null);
  return (
    <>
      <div
        className={lock.locked ? 'invisible contents' : 'contents'}
        inert={lock.locked || undefined}
        aria-hidden={lock.locked || undefined}
        data-testid="applock-content"
      >
        {children}
      </div>
      {lock.locked &&
        host &&
        createPortal(
          <LockScreen
            waitMs={lock.waitMs}
            offerSignOut={lock.offerSignOut}
            hasBiometric={lock.hasBiometric}
            onPasscode={lock.unlock}
            onBiometric={lock.unlockBiometric}
            onSignOut={() => void lock.signOutDevice()}
          />,
          host,
        )}
    </>
  );
}

/** Route element inside RequireAuth: the device lock around everything signed in. */
export function AppLockGate() {
  const { userId, profile, session } = useAuth();
  const out = useCallback(async () => {
    await signOut(supabase);
  }, []);
  if (!userId) return <Outlet />;
  return (
    <AppLockProvider
      key={userId}
      userId={userId}
      userName={profile?.username ?? session?.user.email ?? 'VYBORA'}
      signOut={out}
    >
      <AppLockCover>
        <Outlet />
      </AppLockCover>
    </AppLockProvider>
  );
}
