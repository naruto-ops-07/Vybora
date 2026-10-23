import {
  ArrowBendUpLeftIcon,
  ChatCircleDotsIcon,
  CheckSquareIcon,
  CopyIcon,
  InfoIcon,
  PencilSimpleIcon,
  PushPinIcon,
  PushPinSlashIcon,
  ShareFatIcon,
  StarIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { MessageAction } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import {
  menuContentClass,
  menuDangerItemClass,
  menuItemClass,
  menuSeparatorClass,
} from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { QUICK_REACTIONS } from './reactions';

const LABEL: Record<MessageAction, string> = {
  reply: 'Reply',
  replyPrivately: 'Reply privately',
  copy: 'Copy text',
  edit: 'Edit',
  forward: 'Forward',
  star: 'Star',
  unstar: 'Unstar',
  pin: 'Pin',
  unpin: 'Unpin',
  info: 'Message info',
  select: 'Select',
  delete: 'Delete for everyone',
};
const icon = (I: typeof CopyIcon, weight?: 'fill') => (
  <I size={16} weight={weight} aria-hidden="true" />
);
const ICON: Record<MessageAction, ReactNode> = {
  reply: icon(ArrowBendUpLeftIcon),
  replyPrivately: icon(ChatCircleDotsIcon),
  copy: icon(CopyIcon),
  edit: icon(PencilSimpleIcon),
  forward: icon(ShareFatIcon),
  star: icon(StarIcon),
  unstar: icon(StarIcon, 'fill'),
  pin: icon(PushPinIcon),
  unpin: icon(PushPinSlashIcon),
  info: icon(InfoIcon),
  select: icon(CheckSquareIcon),
  delete: icon(TrashIcon),
};

/** Right-click, long-press (touch), Shift+F10 or Enter: reactions on top, then actions. */
export function MessageMenu({
  children,
  actions,
  myReactions,
  onReact,
  onAction,
}: {
  children: ReactElement;
  actions: MessageAction[];
  myReactions: string[];
  onReact: (emoji: string) => void;
  onAction: (a: MessageAction) => void;
}) {
  // Always the same tree: swapping Root for bare children (select mode, sending → sent)
  // would remount the message and drop keyboard focus. With no actions the trigger is
  // disabled and there is no content.
  const enabled = actions.length > 0;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild disabled={!enabled}>
        {children}
      </ContextMenu.Trigger>
      {enabled && (
        <ContextMenu.Portal>
          <ContextMenu.Content collisionPadding={8} className={cn(menuContentClass, 'min-w-52')}>
            <ContextMenu.Group
              aria-label="Reactions"
              className="flex gap-0.5 border-b border-line p-1"
            >
              {QUICK_REACTIONS.map((emoji) => {
                const on = myReactions.includes(emoji);
                return (
                  <ContextMenu.Item
                    key={emoji}
                    onSelect={() => onReact(emoji)}
                    aria-label={`${on ? 'Remove' : 'React with'} ${emoji}`}
                    className={cn(
                      'vy-menu-item touch-target flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-lg outline-none',
                      on && 'bg-accent-soft',
                    )}
                  >
                    {emoji}
                  </ContextMenu.Item>
                );
              })}
            </ContextMenu.Group>
            {actions.map((a) => (
              <ActionItem key={a} action={a} onAction={onAction} />
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  );
}

function ActionItem({
  action: a,
  onAction,
}: {
  action: MessageAction;
  onAction: (a: MessageAction) => void;
}) {
  return (
    <>
      {/* "Delete for everyone" stands apart from the everyday actions. */}
      {a === 'delete' && (
        <ContextMenu.Separator className={menuSeparatorClass} aria-hidden="true" />
      )}
      <ContextMenu.Item
        onSelect={() => onAction(a)}
        className={cn(menuItemClass, a === 'delete' && menuDangerItemClass)}
      >
        {ICON[a]}
        {LABEL[a]}
      </ContextMenu.Item>
    </>
  );
}
