import {
  CaretRightIcon,
  EyeIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UserGearIcon,
} from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink } from 'react-router';
import { PaneHeader } from '@/features/connect/ui';
import { cn } from '@/lib/cn';

const SECTIONS: { to: string; label: string; description: string; icon: ReactNode }[] = [
  {
    to: '/settings/profile',
    label: 'Profile',
    description: 'Name, photo and about',
    icon: <UserCircleIcon size={20} />,
  },
  {
    to: '/settings/appearance',
    label: 'Appearance',
    description: 'Look, light and dark',
    icon: <PaletteIcon size={20} />,
  },
  {
    to: '/settings/privacy',
    label: 'Privacy & security',
    description: 'Devices, receipts, notifications, blocked',
    icon: <ShieldCheckIcon size={20} />,
  },
  {
    to: '/settings/accessibility',
    label: 'Accessibility',
    description: 'Motion, text size, contrast, gestures',
    icon: <EyeIcon size={20} />,
  },
  {
    to: '/settings/account',
    label: 'Account',
    description: 'Sign out, delete account',
    icon: <UserGearIcon size={20} />,
  },
];

/** Left-pane settings navigation (also the settings home on phones). */
export function SettingsNav() {
  return (
    <div className="flex h-full flex-col">
      <PaneHeader title="Settings" />
      <nav aria-label="Settings sections" className="scroll-thin flex-1 overflow-y-auto py-2">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cn(
                'vy-row relative mx-2 flex items-center gap-3 px-3 py-3',
                isActive && 'font-semibold',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="vy-row-mark absolute top-1/2 -left-0.5 h-6 w-[3px] -translate-y-1/2"
                    aria-hidden="true"
                  />
                )}
                <span className={isActive ? 'text-accent' : 'text-muted'} aria-hidden="true">
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted">{s.description}</span>
                </span>
                <CaretRightIcon size={16} className="text-subtle md:hidden" aria-hidden="true" />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const desktop = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** /settings: phones see the section list (left pane); larger screens open Profile. */
export function SettingsIndex() {
  const [wide, setWide] = useState(desktop);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide ? <Navigate to="/settings/profile" replace /> : null;
}

/** Shared frame for a settings page in the content pane. */
export function SettingsPage({
  title,
  children,
  back = '/settings',
}: {
  title: string;
  children: ReactNode;
  back?: string;
}) {
  return (
    <div className="scroll-thin h-full w-full overflow-y-auto">
      <header className="vy-panel sticky top-0 z-10 flex h-16 items-center gap-2 border-b px-2 md:px-6">
        <NavLink
          to={back}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-ink md:hidden"
          aria-label="Back to settings"
        >
          <CaretRightIcon size={18} className="rotate-180" aria-hidden="true" />
        </NavLink>
        <h1 className="type-wide text-[19px] font-semibold">{title}</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6 md:px-6 md:py-8">{children}</div>
    </div>
  );
}
