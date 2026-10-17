import type { ChatTheme } from '@vybora/api';
import {
  chatAccent,
  highContrastThemes,
  resolveChatTheme,
  wallpaperSvg,
  type ChatThemeDef,
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
  const read = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export interface ResolvedChatTheme extends ChatThemeDef {
  accent: string;
  /** Accessibility → High contrast: chat colours follow the high-contrast accent. */
  highContrast?: boolean;
}

export function useChatTheme(theme: ChatTheme): ResolvedChatTheme {
  const dark = useIsDark();
  const { highContrast } = useA11y().prefs;
  return useMemo(() => {
    const def = resolveChatTheme(theme);
    if (highContrast) {
      const t = highContrastThemes[dark ? 'dark' : 'light'];
      return { ...def, bubble: t.accent, bubbleText: t.onAccent, accent: t.accent, highContrast };
    }
    return { ...def, accent: chatAccent(def, dark) };
  }, [theme, dark, highContrast]);
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
      {title && <h3 className="px-1 text-[13px] font-semibold text-muted">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {children}
      </div>
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
