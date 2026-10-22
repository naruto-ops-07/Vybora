import { ListIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { useSiteHead } from './head';
import { PUBLIC_PAGES } from './meta';

const NAV = PUBLIC_PAGES.filter((p) => p.path !== '/');

/**
 * A link into the signed-in app. A plain anchor on purpose: the public pages run without
 * the app's auth and storage code, so the app loads fresh behind it.
 */
export function AppLink({
  to,
  children,
  variant = 'primary',
  size = 'lg',
  className,
}: {
  to: '/signup' | '/login' | '/messages';
  children: ReactNode;
  variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <a href={to} data-button="" className={buttonClasses({ variant, size, className })}>
      {children}
    </a>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'site-navlink flex min-h-11 items-center rounded-md px-3 text-[15px]',
    isActive
      ? 'text-ink underline decoration-accent decoration-2 underline-offset-[10px]'
      : 'text-muted hover:text-ink',
  );

function Header() {
  // Remounting the menu on navigation closes it.
  const { pathname } = useLocation();
  return (
    <header className="vy-panel sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-16 max-w-[84rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link to="/" aria-label="VYBORA home" className="flex min-h-11 items-center rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((p) => (
            <NavLink key={p.path} to={p.path} className={navClass}>
              {p.nav}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <AppLink to="/login" variant="ghost" size="md" className="touch-target">
            Sign in
          </AppLink>
          <AppLink to="/signup" size="md" className="max-sm:hidden">
            Create account
          </AppLink>
          {/* A disclosure, so the menu works before (and without) any script. */}
          <details key={pathname} className="site-menu relative lg:hidden">
            <summary
              className={buttonClasses({ variant: 'ghost', size: 'icon', className: 'h-11 w-11' })}
              aria-label="Menu"
            >
              <ListIcon size={22} aria-hidden="true" />
            </summary>
            <nav
              aria-label="Menu"
              className="vy-popover absolute right-0 top-[calc(100%+0.5rem)] w-64 rounded-lg p-2"
            >
              {NAV.map((p) => (
                <NavLink key={p.path} to={p.path} className={navClass}>
                  {p.nav}
                </NavLink>
              ))}
              <AppLink to="/signup" size="md" className="mt-2 w-full sm:hidden">
                Create account
              </AppLink>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto max-w-[84rem] px-4 pb-10 pt-16 sm:px-6 lg:px-10">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <p className="max-w-[34ch] text-lg leading-relaxed">
            Private and beautiful messaging for you and your friends, on the web and on your phone.
          </p>
          <nav aria-label="Site" className="flex flex-col items-start">
            {PUBLIC_PAGES.map((p) => (
              <Link
                key={p.path}
                to={p.path}
                className="flex min-h-11 items-center text-muted hover:text-ink"
              >
                {p.path === '/privacy-and-security' ? 'Privacy and security' : p.nav}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col items-start">
            <a href="/signup" className="flex min-h-11 items-center text-muted hover:text-ink">
              Create your account
            </a>
            <a href="/login" className="flex min-h-11 items-center text-muted hover:text-ink">
              Sign in
            </a>
            <a href="/messages" className="flex min-h-11 items-center text-muted hover:text-ink">
              Open web app
            </a>
          </div>
        </div>
        <p
          className="type-display mt-16 select-none text-[clamp(4.5rem,19vw,17rem)] leading-[0.8] tracking-[-0.04em] text-accent"
          aria-hidden="true"
        >
          VYBORA
        </p>
        <div className="mt-8 flex flex-wrap justify-between gap-x-8 gap-y-2 text-sm text-muted">
          <p>Encryption not yet independently audited.</p>
          <p>© {new Date().getFullYear()} VYBORA</p>
        </div>
      </div>
    </footer>
  );
}

/** The public site's frame: skip link, header, the page, and the closing footer. */
export function SiteLayout({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  useSiteHead(pathname);
  return (
    <div className="site min-h-dvh bg-bg text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-4 py-3 text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">{children ?? <Outlet />}</main>
      <Footer />
    </div>
  );
}
