import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/cn';

const items = [
  { to: 'profile', label: 'Edit profile' },
  { to: 'privacy', label: 'Privacy' },
  { to: 'blocked', label: 'Blocked accounts' },
  { to: 'account', label: 'Account' },
];

export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-[935px] px-4 py-6 md:py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold">Settings</h1>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav
          aria-label="Settings"
          className="scrollbar-none flex gap-1 overflow-x-auto md:w-56 md:flex-col"
        >
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium',
                  isActive
                    ? 'bg-surface font-semibold text-ink shadow-sm'
                    : 'text-muted hover:bg-surface-muted',
                )
              }
            >
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 rounded-[22px] border border-line bg-surface p-5 sm:p-7">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
