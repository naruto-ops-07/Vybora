import {
  Bookmark,
  Clapperboard,
  Compass,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  PlusSquare,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { signOut } from '@vybora/api';
import { Suspense, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUnreadCounts } from '@/hooks/useUnread';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white ring-2 ring-surface">
      {count > 99 ? '99+' : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

function NavItem({
  to,
  icon,
  label,
  badge,
  end,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-4 rounded-2xl px-3 py-2.5 text-[15px] transition-colors hover:bg-surface-muted',
          isActive ? 'font-semibold text-ink' : 'text-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'relative transition-transform group-hover:scale-105',
              isActive && 'text-accent',
            )}
          >
            {icon}
            <Badge count={badge ?? 0} />
          </span>
          <span className="hidden xl:inline">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const { profile, isStaff } = useAuth();
  const unread = useUnreadCounts();
  const location = useLocation();
  const immersive = location.pathname.startsWith('/reels');

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-line bg-surface px-3 py-6 md:flex xl:w-[244px]">
        <Link to="/home" className="mb-8 px-2" aria-label="VYBORA home">
          <span className="xl:hidden">
            <LogoMark size={34} />
          </span>
          <span className="hidden xl:inline">
            <Logo />
          </span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          <NavItem to="/home" icon={<Home size={24} />} label="Home" />
          <NavItem to="/search" icon={<Search size={24} />} label="Search" />
          <NavItem to="/explore" icon={<Compass size={24} />} label="Explore" />
          <NavItem to="/reels" icon={<Clapperboard size={24} />} label="Reels" />
          <NavItem
            to="/messages"
            icon={<MessageCircle size={24} />}
            label="Messages"
            badge={unread.conversations}
          />
          <NavItem
            to="/notifications"
            icon={<Heart size={24} />}
            label="Notifications"
            badge={unread.notifications}
          />
          <NavItem to="/create" icon={<PlusSquare size={24} />} label="Create" />
          <NavItem to="/saved" icon={<Bookmark size={24} />} label="Saved" />
          {profile && (
            <NavLink
              to={`/u/${profile.username}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 rounded-2xl px-3 py-2.5 hover:bg-surface-muted',
                  isActive ? 'font-semibold' : 'text-muted',
                )
              }
            >
              <Avatar path={profile.avatar_path} name={profile.username} size={26} />
              <span className="hidden xl:inline">Profile</span>
            </NavLink>
          )}
        </nav>
        <div className="flex flex-col gap-1">
          {isStaff && <NavItem to="/admin" icon={<Shield size={22} />} label="Admin" />}
          <NavItem to="/settings" icon={<Settings size={22} />} label="Settings" />
          <button
            type="button"
            onClick={() => void signOut(supabase)}
            className="flex items-center gap-4 rounded-2xl px-3 py-2.5 text-[15px] text-muted hover:bg-surface-muted hover:text-ink"
          >
            <LogOut size={22} />
            <span className="hidden xl:inline">Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      {!immersive && (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
          <Link to="/home" aria-label="VYBORA home">
            <Logo compact />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/notifications"
              className="relative rounded-xl p-2"
              aria-label="Notifications"
            >
              <Heart size={24} />
              <Badge count={unread.notifications} />
            </Link>
            <Link to="/messages" className="relative rounded-xl p-2" aria-label="Messages">
              <MessageCircle size={24} />
              <Badge count={unread.conversations} />
            </Link>
          </div>
        </header>
      )}

      <main
        id="main"
        className={cn('md:pl-[76px] xl:pl-[244px]', immersive ? 'pb-0' : 'pb-20 md:pb-0')}
      >
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        {[
          { to: '/home', icon: <Home size={25} />, label: 'Home' },
          { to: '/explore', icon: <Compass size={25} />, label: 'Explore' },
          { to: '/create', icon: <PlusSquare size={25} />, label: 'Create' },
          { to: '/reels', icon: <Clapperboard size={25} />, label: 'Reels' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                'flex h-12 w-12 items-center justify-center rounded-2xl',
                isActive ? 'text-accent' : 'text-ink',
              )
            }
          >
            {item.icon}
          </NavLink>
        ))}
        {profile && (
          <NavLink
            to={`/u/${profile.username}`}
            aria-label="Profile"
            className="flex h-12 w-12 items-center justify-center"
          >
            <Avatar path={profile.avatar_path} name={profile.username} size={28} />
          </NavLink>
        )}
      </nav>
    </div>
  );
}
