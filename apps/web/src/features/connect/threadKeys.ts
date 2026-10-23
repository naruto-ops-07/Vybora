import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Keyboard model for the message list (focus lives on [data-message-id]
 * elements): ↑/↓ move, Enter opens the message menu, R replies, Space toggles
 * selection in select mode. Shift+F10 / the Menu key fire `contextmenu` natively.
 */
export function threadKeyDown(
  e: ReactKeyboardEvent<HTMLElement>,
  handlers: { onReply: (id: string) => void; onToggle?: (id: string) => void },
) {
  const target = e.target as HTMLElement;
  const current = target.closest<HTMLElement>('[data-message-id]');
  if (!current || target !== current) return;
  const id = current.dataset.messageId!;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-message-id]')];
    const next = all[all.indexOf(current) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const r = current.getBoundingClientRect();
    current.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 24,
        clientY: r.top + 12,
      }),
    );
  } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    handlers.onReply(id);
  } else if (e.key === ' ' && handlers.onToggle) {
    e.preventDefault();
    handlers.onToggle(id);
  }
}

/**
 * Alt+↑/↓ in the workspace: the previous or next chat in the list. Never while a
 * modal (a dialog, the view-once viewer) is open: that would swap the chat under it.
 * Returns whether it switched.
 */
export function switchChatByKey(e: KeyboardEvent): boolean {
  if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-chat-link]')];
  if (!links.length) return false;
  e.preventDefault();
  const i = links.findIndex((a) => a.getAttribute('aria-current') === 'page');
  links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.click();
  return true;
}
