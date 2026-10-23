import {
  ChatsCircleIcon,
  GearSixIcon,
  MonitorIcon,
  UsersThreeIcon,
  WarningIcon,
  type Icon,
} from '@phosphor-icons/react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useOutletContext,
} from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { FriendRequestBadge } from '@/features/friends/FriendRequestBadge';
import { FriendsPane } from '@/features/friends/FriendsPane';
import { HandleCard } from '@/features/friends/HandleCard';
import { WelcomeEmpty } from '@/features/onboarding/EmptyStates';
import { useFriendRequests } from '@/features/friends/hooks';
import { ConversationList as LegacyList } from '@/features/messages/InboxPage';
import { SettingsNav } from '@/features/settings/SettingsNav';
import { cn } from '@/lib/cn';
import { ConnectProvider, useConnect } from './ConnectProvider';
import { CommandPalette } from './CommandPalette';
import { InboxPane } from './InboxPane';
import { switchChatByKey } from './threadKeys';

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
            'vy-tile mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md',
            tone === 'warning' && 'text-warning',
          )}
        >
          {icon}
        </div>
        <h2 className="type-wide text-[17px] text-balance">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}

export interface WorkspaceOutletContext {
  /** Open the New message dialog in the chat list. */
  compose: () => void;
}

/** Conversation pane when no chat is selected (desktop and tablet). */
export function MessagesWelcome() {
  const ctx = useOutletContext<WorkspaceOutletContext | undefined>();
  return (
    <div className="scroll-thin hidden h-full flex-1 flex-col items-center overflow-y-auto p-10 md:flex">
      <div className="my-auto flex w-full justify-center">
        <WelcomeEmpty onCompose={ctx?.compose} handle={<HandleCard />} />
      </div>
    </div>
  );
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

type Section = 'messages' | 'friends' | 'settings';

function RailLink({
  to,
  label,
  icon: Glyph,
  badge,
  current,
}: {
  to: string;
  label: string;
  icon: Icon;
  badge?: ReactNode;
  /** Overrides the route match (the dev gallery shows a chosen section as current). */
  current?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'vy-rail-item relative flex min-h-14 w-full flex-col items-center justify-center gap-1 py-1.5 text-[11px] leading-4 font-medium transition-colors duration-150',
          (current ?? isActive) ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
        )
      }
    >
      {({ isActive: matched }) => {
        const isActive = current ?? matched;
        return (
          <>
            {/* The current section's icon sits in an accent pill, filled: never colour alone. */}
            <span
              className="vy-rail-pill relative flex h-8 w-14 items-center justify-center rounded-full"
              data-active={isActive || undefined}
              aria-hidden="true"
            >
              <Glyph size={22} weight={isActive ? 'fill' : 'regular'} />
            </span>
            {label}
            {/* After the label so screen readers hear "Friends, 2 friend requests". */}
            {badge && <span className="absolute top-0.5 left-1/2 ml-2 flex">{badge}</span>}
          </>
        );
      }}
    </NavLink>
  );
}

const NAV_LINKS = (friendsBadge?: ReactNode, current?: Section) => {
  const is = (s: Section) => (current ? current === s : undefined);
  return (
    <>
      <RailLink to="/messages" label="Chats" icon={ChatsCircleIcon} current={is('messages')} />
      <RailLink
        to="/friends"
        label="Friends"
        icon={UsersThreeIcon}
        badge={friendsBadge}
        current={is('friends')}
      />
      <RailLink to="/settings" label="Settings" icon={GearSixIcon} current={is('settings')} />
    </>
  );
};

interface NavProfile {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_path?: string | null;
}

/** The desktop rail: the mark, the three sections, and your profile at the foot. */
export function RailNav({
  friendsBadge,
  profile,
  className,
  current,
}: {
  friendsBadge?: ReactNode;
  profile?: NavProfile | null;
  className?: string;
  current?: Section;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'w-[76px] shrink-0 flex-col items-center border-r border-line bg-bg py-4',
        className,
      )}
    >
      <LogoMark size={32} />
      <div className="mt-6 flex w-full flex-1 flex-col gap-1">
        {NAV_LINKS(friendsBadge, current)}
      </div>
      {profile && (
        <NavLink
          to="/settings/profile"
          aria-label="Your profile"
          className="rounded-full ring-2 ring-line ring-offset-2 ring-offset-bg transition-shadow duration-150 hover:ring-accent/70"
        >
          <Avatar
            path={profile.avatar_path}
            name={profile.username}
            userId={profile.id}
            displayName={profile.display_name}
            size={32}
          />
        </NavLink>
      )}
    </nav>
  );
}

/** Phones: the same sections in a bar under the list, on the look's panel. */
export function BottomNav({
  friendsBadge,
  className,
  current,
}: {
  friendsBadge?: ReactNode;
  className?: string;
  current?: Section;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn('vy-panel pb-safe flex shrink-0 border-t px-2 pt-1', className)}
    >
      {NAV_LINKS(friendsBadge, current)}
    </nav>
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
  const inFriends = location.pathname === '/friends' || location.pathname.startsWith('/friends/');
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
  // Friends need no keys: adding and listing work even while the engine is locked.
  const needsEngine =
    !legacy && !inFriends && (!inSettings || location.pathname.startsWith('/settings/privacy'));
  const incomingRequests = useFriendRequests().data?.incoming.length ?? 0;
  const friendsBadge = <FriendRequestBadge count={incomingRequests} />;
  const [composeSignal, setComposeSignal] = useState(0);
  const outletContext = useMemo<WorkspaceOutletContext>(
    () => ({ compose: () => setComposeSignal((n) => n + 1) }),
    [],
  );
  const content = (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-accent">
          <Spinner size={22} label="Loading" />
        </div>
      }
    >
      <Outlet context={outletContext} />
    </Suspense>
  );
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
      } else switchChatByKey(e);
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
        <RailNav friendsBadge={friendsBadge} profile={profile} className="hidden md:flex" />

        <aside
          className={cn(
            'h-full w-full shrink-0 flex-col border-line bg-surface md:w-[340px] md:border-r lg:w-[368px]',
            showingContent ? 'hidden md:flex' : 'flex',
          )}
          aria-label={
            inSettings
              ? 'Settings sections'
              : inFriends
                ? 'Friends'
                : legacy
                  ? 'Legacy conversations'
                  : 'Conversations'
          }
        >
          <div className="min-h-0 flex-1">
            {inSettings ? (
              <SettingsNav />
            ) : inFriends ? (
              <FriendsPane inputRef={searchRef} />
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
          <BottomNav friendsBadge={friendsBadge} className="md:hidden" />
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
          if (inSettings || legacy || inFriends) navigate('/messages');
          setComposeSignal((n) => n + 1);
        }}
      />
    </ConnectProvider>
  );
}
