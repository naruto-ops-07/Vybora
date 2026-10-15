import {
  ChatsCircleIcon,
  FingerprintIcon,
  GearSixIcon,
  KeyIcon,
  LockSimpleIcon,
  MonitorIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { ConversationList as LegacyList } from '@/features/messages/InboxPage';
import { SettingsNav } from '@/features/settings/SettingsNav';
import { cn } from '@/lib/cn';
import { ConnectProvider, useConnect } from './ConnectProvider';
import { CommandPalette } from './CommandPalette';
import { InboxPane } from './InboxPane';
import { Meta } from './ui';

/** Waits for this browser's encryption engine; explains every non-ready state. */
function Gate({ children, quietOnDesktop }: { children: ReactNode; quietOnDesktop?: boolean }) {
  const { status, error, retry, useHere } = useConnect();
  if (status === 'ready') return <>{children}</>;
  // When the list pane already shows this state (desktop), keep the content pane empty.
  if (quietOnDesktop)
    return (
      <div className="flex flex-1 md:hidden">
        <Gate>{children}</Gate>
      </div>
    );
  if (status === 'elsewhere')
    return (
      <Centered
        icon={<MonitorIcon size={22} />}
        title="Messages are open in another tab"
        body="To keep encryption keys consistent, secure messaging runs in one tab at a time in this browser."
      >
        <Button onClick={useHere}>Use here instead</Button>
      </Centered>
    );
  if (status === 'error')
    return (
      <Centered
        icon={<WarningIcon size={22} />}
        title="Secure messaging couldn’t start"
        body={error ?? 'Something went wrong while unlocking this device.'}
        tone="warning"
      >
        <Button onClick={retry}>Try again</Button>
      </Centered>
    );
  return (
    <Centered
      icon={<Spinner size={20} />}
      title="Unlocking secure messages"
      body="Loading this browser’s encryption keys. Messages are decrypted only here."
    />
  );
}

function Centered({
  icon,
  title,
  body,
  children,
  tone,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
  tone?: 'warning';
}) {
  return (
    <div
      className="flex h-full flex-1 items-center justify-center p-8"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-sm text-center">
        <div
          className={cn(
            'mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border',
            tone === 'warning' ? 'border-warning text-warning' : 'border-line text-accent',
          )}
        >
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}

/** Conversation pane when no chat is selected (desktop and tablet). */
export function MessagesWelcome() {
  return (
    <div className="hidden h-full flex-1 items-center justify-center p-10 md:flex">
      <div className="w-full max-w-md">
        <LockSimpleIcon size={28} className="text-accent" aria-hidden="true" />
        <h2 className="type-display mt-4 text-4xl">Private by design</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Messages and attachments are end-to-end encrypted on your devices. VYBORA’s servers store
          only ciphertext.
        </p>
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {[
            { icon: <LockSimpleIcon size={18} />, t: 'MLS encryption', d: 'Per device, RFC 9420' },
            { icon: <KeyIcon size={18} />, t: 'Your keys', d: 'Never leave this browser' },
            {
              icon: <FingerprintIcon size={18} />,
              t: 'Verifiable',
              d: 'Compare safety numbers',
            },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-3 py-3">
              <span className="text-accent" aria-hidden="true">
                {f.icon}
              </span>
              <dt className="flex-1 text-sm font-medium">{f.t}</dt>
              <dd>
                <Meta>{f.d}</Meta>
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-8 text-[13px] font-semibold text-muted">Keyboard shortcuts</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {[
            ['Ctrl K', 'Command menu'],
            ['Alt N', 'New chat'],
            ['/', 'Search chats'],
            ['Alt ↑ ↓', 'Previous or next chat'],
            ['Alt I', 'Chat details'],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-sm border border-line-strong px-1.5 font-mono text-[11px]">
                  {k}
                </kbd>
              </dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function RailLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150',
          isActive ? 'text-accent' : 'text-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent" aria-hidden="true" />
          )}
          <span aria-hidden="true">{icon}</span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/**
 * The signed-in app: rail | list pane | content. On phones one pane shows at a
 * time with a bottom bar on list screens. The encryption engine only loads here.
 */
export default function Workspace() {
  const { profile } = useAuth();
  const location = useLocation();
  const chat = useMatch('/messages/:conversationId');
  const inSettings = location.pathname.startsWith('/settings');
  const settingsSection = inSettings && location.pathname !== '/settings';
  const legacy = location.pathname.startsWith('/messages/legacy');
  const legacyChat = useMatch('/messages/legacy/:conversationId');
  const activeId =
    chat && !legacy && chat.params.conversationId !== 'privacy'
      ? chat.params.conversationId
      : undefined;
  const showingContent = !!activeId || settingsSection || !!legacyChat;
  // Profile/account settings and legacy chats must stay reachable even if the
  // encryption engine can't start (e.g. to sign out).
  const needsEngine = !legacy && (!inSettings || location.pathname.startsWith('/settings/privacy'));
  const content = (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-accent">
          <Spinner size={22} label="Loading" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
  const [composeSignal, setComposeSignal] = useState(0);
  const resetCompose = useCallback(() => setComposeSignal(0), []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setComposeSignal((n) => n + 1);
      } else if (e.key === '/' && !isTyping(e.target)) {
        if (!searchRef.current) return;
        e.preventDefault();
        searchRef.current.focus();
      } else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-chat-link]')];
        if (!links.length) return;
        e.preventDefault();
        const i = links.findIndex((a) => a.getAttribute('aria-current') === 'page');
        links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ConnectProvider>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-bg text-ink">
        <nav
          aria-label="Primary"
          className="hidden w-[72px] shrink-0 flex-col items-center border-r border-line bg-surface py-4 md:flex"
        >
          <LogoMark size={30} />
          <div className="mt-6 flex w-full flex-1 flex-col">
            <RailLink to="/messages" label="Chats" icon={<ChatsCircleIcon size={22} />} />
            <RailLink to="/settings" label="Settings" icon={<GearSixIcon size={22} />} />
          </div>
          {profile && (
            <NavLink to="/settings/profile" aria-label="Your profile" className="rounded-full">
              <Avatar path={profile.avatar_path} name={profile.username} size={32} />
            </NavLink>
          )}
        </nav>

        <aside
          className={cn(
            'h-full w-full shrink-0 flex-col border-line bg-surface md:w-[340px] md:border-r lg:w-[360px]',
            showingContent ? 'hidden md:flex' : 'flex',
          )}
          aria-label={
            inSettings ? 'Settings sections' : legacy ? 'Legacy conversations' : 'Conversations'
          }
        >
          <div className="min-h-0 flex-1">
            {inSettings ? (
              <SettingsNav />
            ) : legacy ? (
              <LegacyList activeId={legacyChat?.params.conversationId} />
            ) : (
              <Gate>
                <InboxPane
                  activeId={activeId}
                  composeSignal={composeSignal}
                  onComposeHandled={resetCompose}
                  searchRef={searchRef}
                />
              </Gate>
            )}
          </div>
          <nav
            aria-label="Primary"
            className="pb-safe flex shrink-0 border-t border-line bg-surface md:hidden"
          >
            <RailLink to="/messages" label="Chats" icon={<ChatsCircleIcon size={22} />} />
            <RailLink to="/settings" label="Settings" icon={<GearSixIcon size={22} />} />
          </nav>
        </aside>

        <main
          id="content"
          className={cn('h-full min-w-0 flex-1', showingContent ? 'flex' : 'hidden md:flex')}
        >
          {needsEngine ? <Gate quietOnDesktop={!inSettings}>{content}</Gate> : content}
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewChat={() => {
          if (inSettings || legacy) navigate('/messages');
          setComposeSignal((n) => n + 1);
        }}
      />
    </ConnectProvider>
  );
}
