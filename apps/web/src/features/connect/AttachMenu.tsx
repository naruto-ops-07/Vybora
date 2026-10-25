import {
  ChartBarIcon,
  MapPinIcon,
  PaperclipIcon,
  UserIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { menuItemClass } from '@/components/ui/Menu';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

export interface AttachChoice {
  label: string;
  Icon: Icon;
  onSelect: () => void;
}

/**
 * The paperclip: a small menu above the composer (files, poll, contact, location).
 * Menu-button pattern: opens on click or Enter with focus on the first item, arrow
 * keys move, Enter picks, Esc or Tab closes and Esc returns focus to the button.
 */
export function AttachMenu({
  onFiles,
  onPoll,
  onContact,
  onLocation,
}: {
  onFiles: () => void;
  onPoll?: () => void;
  onContact?: () => void;
  onLocation?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const choices: AttachChoice[] = [
    { label: 'Photo, video or file', Icon: PaperclipIcon, onSelect: onFiles },
    ...(onPoll ? [{ label: 'Poll', Icon: ChartBarIcon, onSelect: onPoll }] : []),
    ...(onContact ? [{ label: 'Contact', Icon: UserIcon, onSelect: onContact }] : []),
    ...(onLocation ? [{ label: 'Location', Icon: MapPinIcon, onSelect: onLocation }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="relative">
      <Tip label="Attach, encrypted" side="top">
        <Button
          ref={button}
          variant="ghost"
          size="icon"
          onClick={() => setOpen((o) => !o)}
          aria-label="Attach"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="text-muted"
        >
          <PaperclipIcon size={20} />
        </Button>
      </Tip>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Attach"
          onKeyDown={onKeyDown}
          className="menu vy-popover absolute bottom-full left-0 z-30 mb-2 min-w-52 rounded-md p-1"
        >
          {choices.map(({ label, Icon, onSelect }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              // The shared menu skin highlights [data-highlighted] (solid accent in high contrast).
              onFocus={(e) => e.currentTarget.setAttribute('data-highlighted', '')}
              onBlur={(e) => e.currentTarget.removeAttribute('data-highlighted')}
              onPointerEnter={(e) => e.currentTarget.focus()}
              className={cn(menuItemClass, 'w-full text-left')}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
