import type { ChatTheme } from '@vybora/api';
import {
  chatAccent,
  highContrastThemes,
  isDefaultChatTheme,
  LOOKS,
  looks,
  outgoingBubbleFill,
  resolveChatTheme,
  wallpaperSvg,
  type ChatThemeDef,
  type Look,
  type OutgoingBubbleFill,
} from '@vybora/config';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';

/** The theme a participant actually sees: shared, unless they chose a personal override. */
export function effectiveTheme(
  shared: ChatTheme,
  local: ChatTheme | null,
  useLocal: boolean,
): ChatTheme {
  return useLocal && local ? local : shared;
}

/** Tracks the app's light/dark mode (set on <html data-theme>). */
export function useIsDark() {
  return useDocumentLook().dark;
}

const readLook = (): { look: Look; dark: boolean } => {
  const html = typeof document !== 'undefined' ? document.documentElement : null;
  const look = html?.dataset.look;
  return {
    look: look && (LOOKS as readonly string[]).includes(look) ? (look as Look) : 'velvet',
    dark: html?.dataset.theme === 'dark',
  };
};

/**
 * The look and mode on <html> (data-look, data-theme), live. Read from the document, not
 * the saved appearance, so the dev gallery's local look switch is followed too.
 */
export function useDocumentLook(): { look: Look; dark: boolean } {
  const [state, setState] = useState(readLook);
  useEffect(() => {
    const sync = () =>
      setState((prev) => {
        const next = readLook();
        return prev.look === next.look && prev.dark === next.dark ? prev : next;
      });
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-look'],
    });
    // It may have changed between render and subscribing (e.g. a parent layout effect).
    sync();
    return () => obs.disconnect();
  }, []);
  return state;
}

export interface ResolvedChatTheme extends ChatThemeDef {
  accent: string;
  /** Accessibility → High contrast: chat colours follow the high-contrast accent. */
  highContrast?: boolean;
  /** The outgoing bubble (outgoingBubbleFill). Without it, bubbles use `bubble`, flat. */
  fill?: OutgoingBubbleFill;
}

/**
 * The chat theme as drawn in the current look and mode. The Default theme is the look's
 * own bubble and accent; a named theme keeps its colour and accent; high contrast is flat.
 */
export function useChatTheme(theme: ChatTheme): ResolvedChatTheme {
  const { look, dark } = useDocumentLook();
  const { highContrast } = useA11y().prefs;
  return useMemo(() => {
    const def = resolveChatTheme(theme);
    const mode = dark ? 'dark' : 'light';
    const fill = outgoingBubbleFill(theme, look, mode, { highContrast });
    const base = { ...def, bubble: fill.to, bubbleText: fill.text, fill };
    if (highContrast) {
      const t = highContrastThemes[mode];
      return { ...base, accent: t.accent, highContrast };
    }
    const accent = isDefaultChatTheme(theme)
      ? looks[look].modes[mode].accent
      : chatAccent(def, dark);
    return { ...base, accent };
  }, [theme, look, dark, highContrast]);
}

/** CSS for an outgoing bubble's fill: the gradient, or one flat colour. */
export function bubbleFillStyle(fill: OutgoingBubbleFill): CSSProperties {
  return {
    backgroundColor: fill.to,
    backgroundImage: fill.gradient
      ? `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`
      : 'none',
    color: fill.text,
  };
}

/** Chat canvas: app background + optional flat wallpaper pattern (none in high contrast). */
export function chatBackground(theme: ChatTheme, def: ResolvedChatTheme): CSSProperties {
  if (def.highContrast) return {};
  const svg = wallpaperSvg(theme.wallpaper, def.accent);
  return svg
    ? {
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};
}

export function TypingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full"
          style={{
            background: color,
            animation: `typing-dot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * A list pane's header: the title in the look's display face (Fraunces in Velvet), and
 * its actions. Shared by Chats, Friends and Settings.
 */
export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
      <h1 className="type-wide text-[23px] leading-8 font-semibold tracking-[-0.01em]">{title}</h1>
      {children}
    </header>
  );
}

/** Monospace metadata label (timestamps, counts, protocol details). */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono text-[11px] leading-4 text-subtle tabular-nums', className)}>
      {children}
    </span>
  );
}

export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      {title && (
        <h3 className="px-1 text-[13px] font-semibold tracking-wide text-muted">{title}</h3>
      )}
      <div className="vy-card divide-y divide-line overflow-hidden rounded-lg">{children}</div>
      {footer && <p className="px-1 text-xs leading-relaxed text-muted">{footer}</p>}
    </section>
  );
}

export function Row({
  icon,
  label,
  description,
  value,
  right,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  label: string;
  description?: string;
  value?: string;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const body = (
    <>
      {icon && (
        <span
          className={cn('flex w-5 shrink-0 justify-center', danger ? 'text-danger' : 'text-muted')}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', danger ? 'text-danger' : 'text-ink')}>
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-muted">{description}</span>
        )}
      </span>
      {value && <span className="max-w-[45%] truncate text-sm text-muted">{value}</span>}
      {right}
    </>
  );
  const cls = 'flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left';
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(cls, 'transition-colors duration-150 hover:bg-surface-muted')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Native select styled to match the system (accessible, keyboard-friendly). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className="h-9 max-w-[55%] rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
