/**
 * Class lists for Radix menus (context menus, the chat-row and message menus): the
 * shared popover surface at elevation 2, and items that highlight in an accent tint
 * (solid accent under high contrast). Skins live in styles/primitives.css.
 */
export const menuContentClass = 'menu vy-popover z-50 min-w-48 rounded-md p-1';

export const menuItemClass =
  'vy-menu-item touch-target flex h-9 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm outline-none';

/** Add to `menuItemClass` for a destructive item (Delete, Remove). */
export const menuDangerItemClass = 'vy-menu-item-danger';

export const menuSeparatorClass = 'vy-menu-separator -mx-1 my-1 h-px';
