import { DesktopIcon, MoonIcon, SignOutIcon, SunIcon } from '@phosphor-icons/react';
import { deleteAccount, signOut } from '@vybora/api';
import { friendlyError } from '@vybora/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth, useMe } from '@/features/auth/AuthProvider';
import { Row, Section } from '@/features/connect/ui';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { SettingsPage } from './SettingsNav';

const THEMES: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'System', icon: <DesktopIcon size={16} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={16} /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={16} /> },
];

export default function AccountSettingsPage() {
  const { profile } = useMe();
  const { session } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <SettingsPage title="Account">
      <Section title="Appearance">
        <div className="p-4">
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 overflow-hidden rounded-md border border-line-strong"
          >
            {THEMES.map((t, i) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex h-10 items-center justify-center gap-2 text-sm font-medium transition-colors duration-150',
                  i > 0 && 'border-l border-line-strong',
                  theme === t.value ? 'bg-accent text-on-accent' : 'hover:bg-surface-muted',
                )}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Session"
        footer="Signing out keeps this browser’s encrypted message history so it’s there when you sign back in. To erase it, use Privacy & security → Sign out and erase."
      >
        <Row label="Signed in as" value={session?.user.email ?? ''} />
        <Row
          icon={<SignOutIcon size={18} />}
          label={signingOut ? 'Signing out…' : 'Sign out'}
          onClick={async () => {
            setSigningOut(true);
            try {
              await signOut(supabase);
              navigate('/', { replace: true });
            } catch (e) {
              toast.show(friendlyError(e), 'error');
              setSigningOut(false);
            }
          }}
        />
      </Section>

      <section className="space-y-2">
        <h3 className="px-1 text-[13px] font-semibold text-danger">Delete account</h3>
        <div className="rounded-lg border border-danger/40 p-4">
          <p className="text-sm text-muted">
            Permanently deletes your account, profile, devices and everything you uploaded,
            including messages you sent. Other people keep their own decrypted copies. This can’t be
            undone.
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setConfirmOpen(true)}>
            Delete my account
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setTyped('');
        }}
        title="Delete your account permanently?"
        description={`Type your username (${profile?.username}) to confirm.`}
        confirmLabel="Delete forever"
        danger
        loading={deleting}
        onConfirm={async () => {
          if (typed.trim().toLowerCase() !== profile?.username) {
            toast.show('Username doesn’t match', 'error');
            return;
          }
          setDeleting(true);
          try {
            await deleteAccount(supabase, typed.trim().toLowerCase());
            navigate('/', { replace: true });
          } catch (e) {
            toast.show(
              friendlyError(
                e,
                'Account deletion is unavailable right now. Please try again later.',
              ),
              'error',
            );
          } finally {
            setDeleting(false);
          }
        }}
      >
        <Input
          aria-label="Your username"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
        />
      </ConfirmDialog>
    </SettingsPage>
  );
}
