/**
 * Gallery: the UI primitives in the current look and mode (buttons, fields, segmented,
 * popovers, the dialog panel, empty-state tile, avatars, the logo), then the same core
 * set side by side in all three looks. Static previews use the components' own class
 * lists, so what shows here is what the app draws.
 */
import {
  ArchiveIcon,
  AtIcon,
  BellSlashIcon,
  MagnifyingGlassIcon,
  PaperPlaneRightIcon,
  PlusIcon,
  PushPinIcon,
  TrashIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { LOOKS, looks, type Look } from '@vybora/config';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DialogSurface } from '@/components/ui/Dialog';
import { Input, Textarea, Toggle } from '@/components/ui/Field';
import { LogoMark } from '@/components/ui/Logo';
import {
  menuContentClass,
  menuDangerItemClass,
  menuItemClass,
  menuSeparatorClass,
} from '@/components/ui/Menu';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/States';
import { ToastCard } from '@/components/ui/Toast';
import { tooltipContentClass } from '@/components/ui/Tooltip';
import { Meta } from '@/features/connect/ui';
import { cn } from '@/lib/cn';
import { loadLookFonts } from '@/lib/theme';
import { PEOPLE } from '../sample';

const noop = () => undefined;
const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className="min-w-0">
      <figcaption>
        <Meta>{label}</Meta>
      </figcaption>
      <div className={cn('mt-2', className)}>{children}</div>
    </figure>
  );
}

/** The look's ambient light, so glass popovers have something to frost. */
function Stage({
  children,
  className,
  scrim,
}: {
  children: ReactNode;
  className?: string;
  /** Dim the stage as the modal layer does. */
  scrim?: boolean;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg border border-line bg-bg p-5', className)}
      style={{
        backgroundImage:
          'radial-gradient(60% 80% at 15% 20%, var(--vy-glow-1), transparent 70%),' +
          'radial-gradient(50% 70% at 85% 30%, var(--vy-glow-2), transparent 70%),' +
          'radial-gradient(60% 60% at 60% 100%, var(--vy-glow-3), transparent 70%)',
      }}
    >
      {/* Something behind the glass: an outgoing bubble and a tone swatch. */}
      <div
        aria-hidden="true"
        className="bg-bubble-out absolute right-6 top-10 h-16 w-44 rounded-md"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-8 left-1/3 h-12 w-28 rounded-md"
        style={{ background: 'var(--vy-tone-glacier-fill)' }}
      />
      {scrim && <div aria-hidden="true" className="absolute inset-0 bg-scrim" />}
      <div className="relative">{children}</div>
    </div>
  );
}

function StaticMenu() {
  return (
    <div role="menu" aria-label="Sample chat actions" className={cn(menuContentClass, 'w-56')}>
      <div role="menuitem" className={menuItemClass}>
        <PushPinIcon size={16} aria-hidden="true" />
        Pin
      </div>
      {/* Highlighted, as under the pointer or arrow keys. */}
      <div role="menuitem" className={menuItemClass} data-highlighted="">
        <BellSlashIcon size={16} aria-hidden="true" />
        Mute
      </div>
      <div role="menuitem" className={menuItemClass}>
        <ArchiveIcon size={16} aria-hidden="true" />
        Archive
      </div>
      <div role="separator" className={menuSeparatorClass} />
      <div role="menuitem" className={cn(menuItemClass, menuDangerItemClass)}>
        <TrashIcon size={16} aria-hidden="true" />
        Delete chat
      </div>
    </div>
  );
}

/** The core set in one look: a scoped data-look wrapper (in the page's mode). */
function LookColumn({ look }: { look: Look }) {
  const [on, setOn] = useState(true);
  return (
    <div
      data-look={look}
      className="min-w-0 space-y-4 rounded-lg border border-line bg-bg p-4 font-sans text-ink"
    >
      <p className="type-wide text-[17px] font-semibold">{looks[look].name}</p>
      <div className="flex flex-wrap gap-2">
        <Button leftIcon={<UserPlusIcon size={16} weight="bold" />}>Add friend</Button>
        <Button variant="secondary">Later</Button>
      </div>
      <Input label="Username" placeholder="their_handle" leading={<AtIcon size={16} />} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Read receipts</span>
        <Toggle checked={on} onChange={setOn} label={`Read receipts, ${looks[look].name}`} />
      </div>
      <div className={cn(menuContentClass, 'w-full')}>
        <div className={menuItemClass} data-highlighted="">
          <PushPinIcon size={16} aria-hidden="true" />
          Pin
        </div>
        <div className={menuItemClass}>
          <ArchiveIcon size={16} aria-hidden="true" />
          Archive
        </div>
      </div>
    </div>
  );
}

export function PrimitivesSection() {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('system');
  const [receipts, setReceipts] = useState(true);
  const [bio, setBio] = useState('Coffee, film cameras and long walks.');
  const maya = PEOPLE.turquoise;
  const group = [PEOPLE.ocean, PEOPLE.sky, PEOPLE.lime];
  // The side-by-side columns draw each look in its own type.
  useEffect(() => LOOKS.forEach((l) => void loadLookFonts(l)), []);
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Group label="Buttons: primary, secondary, outline, ghost, danger">
          <div className="flex flex-wrap items-center gap-2">
            {VARIANTS.map((v) => (
              <Button key={v} variant={v}>
                {v === 'danger' ? 'Delete' : v[0]!.toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        </Group>
        <Group label="Sizes, icon, loading, disabled">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="lg" leftIcon={<PaperPlaneRightIcon size={18} weight="fill" />}>
              Send
            </Button>
            <Button size="icon" aria-label="New chat">
              <PlusIcon size={18} weight="bold" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Search">
              <MagnifyingGlassIcon size={18} />
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Group>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Group label="Input: hint, leading icon" className="space-y-4">
          <Input
            label="Username"
            placeholder="their_handle"
            leading={<AtIcon size={16} />}
            hint="Letters, numbers, dots and underscores."
          />
          <Input label="Display name" defaultValue="Maya Chen" />
        </Group>
        <Group label="Error, disabled, counter" className="space-y-4">
          <Input label="Code" defaultValue="12 34" error="That code has expired. Send a new one." />
          <Input label="Email" defaultValue="maya@example.com" disabled />
        </Group>
        <Group label="Textarea, toggle, segmented" className="space-y-4">
          <Textarea
            label="About you"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            max={80}
            rows={2}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Read receipts</span>
            <Toggle checked={receipts} onChange={setReceipts} label="Read receipts" />
          </div>
          <Segmented
            label="Mode (sample)"
            value={mode}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Match system' },
            ]}
            onChange={setMode}
          />
        </Group>
      </div>

      <Group label="Popovers over the look's light: menu, toasts, tooltip (glass where the look has it)">
        <Stage>
          <div className="flex flex-wrap items-start gap-6">
            <StaticMenu />
            <div className="flex min-w-0 flex-col gap-3">
              <ToastCard tone="success" message="Link copied" />
              <ToastCard
                tone="info"
                message="Chat archived"
                action={{ label: 'Undo', onClick: noop }}
              />
              <ToastCard tone="error" message="Couldn’t send. Check your connection." />
              <span role="tooltip" className={cn(tooltipContentClass, 'self-start')}>
                Search chats
                <kbd className="font-mono text-[11px] text-subtle">Ctrl K</kbd>
              </span>
            </div>
          </div>
        </Stage>
      </Group>

      <Group label="Dialog panel (elevation 3), over the scrim">
        <Stage scrim className="flex justify-center py-10">
          <DialogSurface
            title="Remove Maya?"
            description="You’ll stop being friends. Your chat stays, and she isn’t told."
            size="sm"
            onClose={noop}
            aria-label="Sample dialog"
            role="group"
            footer={
              <>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger">Remove</Button>
              </>
            }
          >
            <p className="text-sm text-muted">You can add each other again at any time.</p>
          </DialogSurface>
        </Stage>
      </Group>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Group
          label="Empty state with the icon tile"
          className="rounded-lg border border-line bg-surface"
        >
          <EmptyState
            icon={<UsersThreeIcon size={22} />}
            title="No requests right now"
            body="When someone adds you, it shows up here."
            action={<Button size="sm">Share your link</Button>}
            className="py-8"
          />
        </Group>
        <Group label="Avatars: tones, hairline edge, group ring" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {[PEOPLE.turquoise, PEOPLE.emerald, PEOPLE.lime, PEOPLE.sky, PEOPLE.glacier].map(
              (p) => (
                <Avatar
                  key={p.id}
                  path={null}
                  name={p.username}
                  userId={p.id}
                  displayName={p.display_name}
                  username={p.username}
                  size={44}
                />
              ),
            )}
          </div>
          <div className="flex items-center gap-3">
            <GroupAvatar members={group} size={52} label="Weekend plans" />
            <Avatar
              path={null}
              name={maya.username}
              userId={maya.id}
              displayName={maya.display_name}
              size={64}
            />
          </div>
        </Group>
        <Group label="Logo mark in the look's primary colours">
          <div className="flex items-end gap-4">
            <LogoMark size={56} />
            <LogoMark size={36} />
            <LogoMark size={24} />
          </div>
        </Group>
      </div>

      <Group label="In every look (this mode)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {LOOKS.map((look) => (
            <LookColumn key={look} look={look} />
          ))}
        </div>
      </Group>
    </div>
  );
}
