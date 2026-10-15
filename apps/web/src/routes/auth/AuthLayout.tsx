import { FingerprintIcon, KeyIcon, LockSimpleIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/ui/Logo';

const POINTS = [
  { icon: <LockSimpleIcon size={18} />, text: 'End-to-end encrypted with MLS (RFC 9420)' },
  { icon: <KeyIcon size={18} />, text: 'Keys are created and kept on your devices' },
  { icon: <FingerprintIcon size={18} />, text: 'Safety numbers to verify who you talk to' },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <Link to="/" aria-label="VYBORA home" className="w-fit">
          <Logo />
        </Link>
        <div className="max-w-sm">
          <p className="type-display text-4xl">
            Conversations that stay between the people in them.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-sm text-muted">
                <span className="text-accent" aria-hidden="true">
                  {p.icon}
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-subtle">
          The server stores ciphertext only. Notifications never include what you wrote.
        </p>
      </aside>

      <div className="flex flex-col">
        <header className="px-5 py-5 lg:hidden">
          <Link to="/" aria-label="VYBORA home">
            <Logo />
          </Link>
        </header>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-5 pb-16 pt-4 sm:items-center sm:pt-0"
        >
          <div className="w-full max-w-[380px]">
            <h1 className="type-wide text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && (
              <div className="mt-6 border-t border-line pt-5 text-sm text-muted">{footer}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
    >
      {message}
    </div>
  );
}
