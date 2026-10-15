import {
  ArchiveIcon,
  BellIcon,
  BellSlashIcon,
  PushPinIcon,
  PushPinSlashIcon,
} from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { isMuted, muteUntil, type PreferencePatch, type SecureConversation } from '@vybora/api';
import type { RowPreview } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Ticks } from './Bubble';

export function RowPreviewText({ preview, unread }: { preview: RowPreview; unread: boolean }) {
  if (preview.typing)
    return <span className="text-msg-sm truncate text-accent">{preview.text}</span>;
  return (
    <span
      className={cn(
        'text-msg-sm flex min-w-0 items-center gap-1',
        unread ? 'text-ink' : 'text-muted',
      )}
    >
      {preview.receipt && (
        <span className="shrink-0 text-subtle">
          <Ticks receipt={preview.receipt} />
        </span>
      )}
      {preview.prefix && <span className="shrink-0">{preview.prefix}:</span>}
      <span className="truncate">{preview.text}</span>
    </span>
  );
}

function Item({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted"
    >
      {children}
    </ContextMenu.Item>
  );
}

const MUTE: { value: '8h' | '1w' | 'always'; label: string }[] = [
  { value: '8h', label: 'For 8 hours' },
  { value: '1w', label: 'For a week' },
  { value: 'always', label: 'Until I turn it back on' },
];

/** Right-click / Shift+F10 on a chat row: pin, mute, archive. */
export function ChatRowMenu({
  children,
  conv,
  title,
  onPrefs,
  onArchive,
}: {
  children: ReactElement;
  conv: SecureConversation;
  title: string;
  onPrefs: (patch: PreferencePatch) => void;
  onArchive: () => void;
}) {
  const muted = isMuted(conv);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`Actions for ${title}`}
          collisionPadding={8}
          className="menu z-50 min-w-48 rounded-md border border-line-strong bg-surface p-1"
        >
          <Item onSelect={() => onPrefs({ pinned: !conv.pinned })}>
            {conv.pinned ? (
              <PushPinSlashIcon size={16} aria-hidden="true" />
            ) : (
              <PushPinIcon size={16} aria-hidden="true" />
            )}
            {conv.pinned ? 'Unpin' : 'Pin'}
          </Item>
          {muted ? (
            <Item onSelect={() => onPrefs({ muted_until: null })}>
              <BellIcon size={16} aria-hidden="true" />
              Unmute
            </Item>
          ) : (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted">
                <BellSlashIcon size={16} aria-hidden="true" />
                Mute
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="menu z-50 min-w-48 rounded-md border border-line-strong bg-surface p-1">
                  {MUTE.map((m) => (
                    <Item
                      key={m.value}
                      onSelect={() => onPrefs({ muted_until: muteUntil(m.value) })}
                    >
                      {m.label}
                    </Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
          <Item onSelect={onArchive}>
            <ArchiveIcon size={16} aria-hidden="true" />
            {conv.archived ? 'Unarchive' : 'Archive'}
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
