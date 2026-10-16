import type { KeyboardEvent } from 'react';

/**
 * Keyboard model for the message list (focus lives on [data-message-id]
 * elements): ↑/↓ move, Enter opens the message menu, R replies, Space toggles
 * selection in select mode. Shift+F10 / the Menu key fire `contextmenu` natively.
 */
export function threadKeyDown(
  e: KeyboardEvent<HTMLElement>,
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
