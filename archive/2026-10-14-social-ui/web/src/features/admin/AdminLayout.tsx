import { ArrowLeft, Flag, LayoutDashboard, ScrollText, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Logo } from '@/components/ui/Logo';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';

const nav = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/admin/reports', label: 'Reports', icon: <Flag size={18} /> },
  { to: '/admin/users', label: 'Users', icon: <Users size={18} /> },
  { to: '/admin/log', label: 'Activity log', icon: <ScrollText size={18} /> },
];

export default function AdminLayout() {
  const { isAdmin, profile } = useAuth();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link to="/home" className="flex items-center gap-2 text-sm text-muted hover:text-ink">
            <ArrowLeft size={16} /> App
          </Link>
          <Logo compact />
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent">
            {isAdmin ? 'Admin' : 'Moderator'}
          </span>
          <span className="ml-auto hidden text-sm text-muted sm:inline">@{profile?.username}</span>
        </div>
        <nav aria-label="Admin" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-muted',
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
