import {
  ChatCircleIcon,
  DesktopIcon,
  EyeIcon,
  GearSixIcon,
  KeyboardIcon,
  MoonIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  SunIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { Command } from 'cmdk';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '@/features/auth/AuthProvider';
import { useTheme } from '@/lib/theme';
import { conversationTitle, useNicknames, useSecureInbox } from './hooks';

function Item({
  value,
  icon,
  children,
  hint,
  onSelect,
}: {
  value: string;
  icon: ReactNode;
  children: ReactNode;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-ink data-[selected=true]:bg-surface-strong"
    >
      <span className="text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <kbd className="font-mono text-[11px] text-subtle">{hint}</kbd>}
    </Command.Item>
  );
}

/** Listed for discoverability only: shown as disabled items, so they can't be "run". */
const SHORTCUTS: [keys: string, label: string][] = [
  ['↑ ↓', 'Move between messages'],
  ['Enter', 'Open the message menu (also Shift F10)'],
  ['R', 'Reply to the focused message'],
  ['Space', 'Select or deselect a message in select mode'],
  ['Esc', 'Close or go back'],
  ['Alt N', 'New message'],
  ['Alt I', 'Chat details'],
  ['Alt ↑ ↓', 'Previous or next chat'],
  ['Ctrl/⌘ K', 'Command menu'],
];

const GROUP =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted';

/** Ctrl/⌘ K: jump to a chat or run an action from anywhere in the workspace. */
export function CommandPalette({
  open,
  onOpenChange,
  onNewChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
}) {
  const navigate = useNavigate();
  const { userId } = useMe();
  const inbox = useSecureInbox();
  const nicknames = useNicknames();
  const { setTheme } = useTheme();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      overlayClassName="fixed inset-0 z-50 bg-scrim"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-surface"
    >
      <Command.Input
        autoFocus
        placeholder="Search chats and actions"
        className="h-14 w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-subtle"
      />
      <Command.List className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
          No chats or actions match.
        </Command.Empty>

        {!!inbox.data?.length && (
          <Command.Group heading="Chats" className={GROUP}>
            {inbox.data.map((c) => {
              const title = conversationTitle(c, userId, nicknames.data);
              return (
                <Item
                  key={c.id}
                  value={`chat ${title} ${c.members.map((m) => m.username).join(' ')} ${c.id}`}
                  icon={
                    c.kind === 'group' ? <UsersThreeIcon size={18} /> : <ChatCircleIcon size={18} />
                  }
                  onSelect={() => run(() => navigate(`/messages/${c.id}`))}
                >
                  {title}
                </Item>
              );
            })}
          </Command.Group>
        )}

        <Command.Group heading="Actions" className={GROUP}>
          <Item
            value="new message chat"
            icon={<NotePencilIcon size={18} />}
            hint="Alt N"
            onSelect={() => run(onNewChat)}
          >
            New message
          </Item>
          <Item
            value="privacy security devices"
            icon={<ShieldCheckIcon size={18} />}
            onSelect={() => run(() => navigate('/settings/privacy'))}
          >
            Privacy & security
          </Item>
          <Item
            value="settings profile account"
            icon={<GearSixIcon size={18} />}
            onSelect={() => run(() => navigate('/settings'))}
          >
            Settings
          </Item>
          <Item
            value="accessibility text size contrast motion"
            icon={<EyeIcon size={18} />}
            onSelect={() => run(() => navigate('/settings/accessibility'))}
          >
            Accessibility
          </Item>
          <Item
            value="theme dark"
            icon={<MoonIcon size={18} />}
            onSelect={() => run(() => setTheme('dark'))}
          >
            Dark theme
          </Item>
          <Item
            value="theme light"
            icon={<SunIcon size={18} />}
            onSelect={() => run(() => setTheme('light'))}
          >
            Light theme
          </Item>
          <Item
            value="theme system"
            icon={<DesktopIcon size={18} />}
            onSelect={() => run(() => setTheme('system'))}
          >
            Match system theme
          </Item>
        </Command.Group>

        <Command.Group heading="Keyboard shortcuts" className={GROUP}>
          {SHORTCUTS.map(([keys, label]) => (
            <Command.Item
              key={keys}
              value={`shortcut keyboard ${label} ${keys}`}
              disabled
              className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted"
            >
              <span className="text-subtle" aria-hidden="true">
                <KeyboardIcon size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <kbd className="font-mono text-[11px] text-subtle">{keys}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
