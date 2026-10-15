import { ArrowBendUpLeftIcon, CheckSquareIcon, CopyIcon, TrashIcon } from '@phosphor-icons/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { MessageAction } from '@vybora/core';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { QUICK_REACTIONS } from './Bubble';

const LABEL: Record<MessageAction, string> = {
  reply: 'Reply',
  copy: 'Copy text',
  select: 'Select',
  delete: 'Delete for everyone',
};
const ICON: Record<MessageAction, ReactNode> = {
  reply: <ArrowBendUpLeftIcon size={16} aria-hidden="true" />,
  copy: <CopyIcon size={16} aria-hidden="true" />,
  select: <CheckSquareIcon size={16} aria-hidden="true" />,
  delete: <TrashIcon size={16} aria-hidden="true" />,
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
  if (!actions.length) return children;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          collisionPadding={8}
          className="menu z-50 min-w-52 rounded-md border border-line-strong bg-surface p-1"
        >
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
                    'touch-target flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-lg outline-none data-[highlighted]:bg-surface-muted',
                    on && 'bg-accent-soft',
                  )}
                >
                  {emoji}
                </ContextMenu.Item>
              );
            })}
          </ContextMenu.Group>
          {actions.map((a) => (
            <ContextMenu.Item
              key={a}
              onSelect={() => onAction(a)}
              className={cn(
                'touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-muted',
                a === 'delete' && 'text-danger data-[highlighted]:bg-danger-soft',
              )}
            >
              {ICON[a]}
              {LABEL[a]}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
