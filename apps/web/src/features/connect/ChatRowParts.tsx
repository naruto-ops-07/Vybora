import {
  ArchiveIcon,
  BellIcon,
  BellSlashIcon,
  DotsThreeIcon,
  PushPinIcon,
  PushPinSlashIcon,
} from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { isMuted, muteUntil, type PreferencePatch, type SecureConversation } from '@vybora/api';
import type { RowPreview } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { menuContentClass, menuItemClass } from '@/components/ui/Menu';
import { Tip } from '@/components/ui/Tooltip';
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
    <ContextMenu.Item onSelect={onSelect} className={menuItemClass}>
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
          className={menuContentClass}
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
              <ContextMenu.SubTrigger className={menuItemClass}>
                <BellSlashIcon size={16} aria-hidden="true" />
                Mute
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className={menuContentClass}>
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

const ROW_ACTION =
  'touch-target flex items-center justify-center rounded-sm p-1.5 text-muted transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--vy-text)_8%,transparent)] hover:text-ink';

/**
 * Pin, archive and more for a chat row. On hover/focus it floats over the row's
 * top-right corner; with "Always show actions" it sits in the row's flow beside the
 * link, so it never covers the row time.
 */
export function ChatRowActions({
  title,
  pinned,
  archived,
  alwaysShow,
  onPin,
  onArchive,
}: {
  title: string;
  pinned: boolean;
  archived: boolean;
  alwaysShow: boolean;
  onPin: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      data-row-actions
      className={cn(
        'gap-0.5',
        alwaysShow
          ? 'flex shrink-0 items-center pr-2'
          : 'vy-popover absolute top-1.5 right-2 hidden rounded-md p-0.5 group-focus-within:flex group-hover:flex',
      )}
    >
      <Tip label={pinned ? 'Unpin' : 'Pin'} side="top">
        <button
          type="button"
          onClick={onPin}
          className={ROW_ACTION}
          aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
        >
          {pinned ? <PushPinSlashIcon size={14} /> : <PushPinIcon size={14} />}
        </button>
      </Tip>
      <Tip label={archived ? 'Unarchive' : 'Archive'} side="top">
        <button
          type="button"
          onClick={onArchive}
          className={ROW_ACTION}
          aria-label={archived ? `Unarchive ${title}` : `Archive ${title}`}
        >
          <ArchiveIcon size={14} />
        </button>
      </Tip>
      <Tip label="More actions" side="top">
        <button
          type="button"
          onClick={(e) => {
            const link = e.currentTarget
              .closest('li')
              ?.querySelector<HTMLElement>('[data-chat-link]');
            const r = link?.getBoundingClientRect();
            link?.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: (r?.right ?? 0) - 40,
                clientY: (r?.top ?? 0) + 20,
              }),
            );
          }}
          className={ROW_ACTION}
          aria-label={`More actions for ${title}`}
        >
          <DotsThreeIcon size={14} />
        </button>
      </Tip>
    </div>
  );
}
