import { CheckIcon, LockSimpleIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { LOOKS, looks, type Look } from '@vybora/config';
import type { ModePref } from '@vybora/core';
import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { Section } from '@/features/connect/ui';
import { cn } from '@/lib/cn';
import { loadLookFonts, useAppearance } from '@/lib/theme';
import { SettingsPage } from './SettingsNav';

const MODES: { value: ModePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
];

const DESCRIPTIONS: Record<Look, string> = {
  velvet: 'Warm and quiet, with emerald and gold.',
  aurora: 'Cool glass and drifting light.',
  bloom: 'Bright, soft and playful.',
};

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The canvas behind every look: its background lit by up to three soft glows. */
const canvas: CSSProperties = {
  backgroundImage: [
    'radial-gradient(120% 70% at 0% 0%, var(--vy-glow-1), transparent 62%)',
    'radial-gradient(90% 60% at 100% 45%, var(--vy-glow-2), transparent 60%)',
    'radial-gradient(90% 55% at 30% 100%, var(--vy-glow-3), transparent 60%)',
  ].join(', '),
};
const glass: CSSProperties = {
  backdropFilter: 'blur(var(--vy-panel-blur))',
  WebkitBackdropFilter: 'blur(var(--vy-panel-blur))',
};

/** Stand-in for a line of message text: these previews never show real messages. */
function Line({ className }: { className: string }) {
  return <span className={cn('block h-[5px] rounded-full bg-current', className)} />;
}

/**
 * A miniature chat, drawn entirely from the enclosing [data-look] scope's tokens: header
 * panel, an incoming and an outgoing bubble, and the composer's primary send button.
 */
function LookPreview() {
  return (
    <div className="relative h-44 overflow-hidden bg-bg" style={canvas} aria-hidden="true">
      <div
        className="absolute inset-x-0 top-0 flex h-10 items-center gap-2 border-b border-line bg-panel px-3"
        style={glass}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--vy-tone-turquoise-fill)] font-display text-[11px] font-semibold text-[var(--vy-tone-turquoise-ink)]">
          M
        </span>
        <span className="font-display text-[13px] font-semibold tracking-tight">Maya</span>
        <LockSimpleIcon size={11} weight="bold" className="ml-auto text-subtle" />
      </div>

      <div className="flex flex-col gap-1.5 px-3 pt-[52px]">
        <div className="w-[68%] self-start rounded-md rounded-bl-sm border border-line bg-bubble-in px-2.5 py-2 text-muted shadow-1">
          <Line className="w-full opacity-60" />
          <Line className="mt-1.5 w-3/5 opacity-60" />
        </div>
        <div className="w-[58%] self-end rounded-md rounded-br-sm bg-bubble-out px-2.5 py-2 text-bubble-out-text shadow-1">
          <Line className="w-full opacity-80" />
          <Line className="mt-1.5 w-2/5 opacity-80" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-3">
        <span
          className="flex h-8 flex-1 items-center rounded-full border border-line bg-panel px-3 text-subtle"
          style={glass}
        >
          <Line className="w-2/5 opacity-50" />
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-gradient text-on-primary shadow-1">
          <PaperPlaneRightIcon size={14} weight="fill" />
        </span>
      </div>
    </div>
  );
}

/**
 * The three looks as an ARIA radio group of live previews. Each card is its own
 * `data-look` scope, so it renders in that look's real tokens, fonts and shape, in the
 * current light or dark mode. Selected: an accent edge plus a check mark, never colour
 * alone. Only the selected card is tabbable; arrow keys move and select.
 */
export function LookPicker({ value, onChange }: { value: Look; onChange: (look: Look) => void }) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);

  // Previews need every look's faces, not just the active one.
  useEffect(() => {
    LOOKS.forEach((l) => void loadLookFonts(l));
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = LOOKS.indexOf(value);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? LOOKS.length - 1
          : STEP[e.key]
            ? (at + STEP[e.key]! + LOOKS.length) % LOOKS.length
            : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(LOOKS[next]!);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <section className="@container space-y-2">
      <h3 id={`${id}-label`} className="px-1 text-[13px] font-semibold text-muted">
        Look
      </h3>
      <div
        ref={group}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        onKeyDown={onKeyDown}
        className="grid grid-cols-1 gap-3 @md:grid-cols-3"
      >
        {LOOKS.map((look) => {
          const selected = value === look;
          return (
            <button
              key={look}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-labelledby={`${id}-${look}`}
              aria-describedby={`${id}-${look}-description`}
              tabIndex={selected ? 0 : -1}
              data-look={look}
              onClick={() => onChange(look)}
              className={cn(
                'flex flex-col overflow-hidden rounded-lg border bg-surface text-left font-sans text-ink transition-[border-color,box-shadow] duration-150',
                selected
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <LookPreview />
              <span className="flex items-start gap-3 border-t border-line px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span
                    id={`${id}-${look}`}
                    className="block font-display text-[17px] leading-tight font-semibold tracking-tight"
                  >
                    {looks[look].name}
                  </span>
                  <span
                    id={`${id}-${look}-description`}
                    className="mt-1 block text-[13px] leading-snug text-pretty text-muted"
                  >
                    {DESCRIPTIONS[look]}
                  </span>
                </span>
                {selected ? (
                  <span
                    data-testid="look-selected"
                    className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                    aria-hidden="true"
                  >
                    <CheckIcon size={13} weight="bold" />
                  </span>
                ) : (
                  <span
                    className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border-2 border-line-strong"
                    aria-hidden="true"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function AppearancePage() {
  const { look, mode, setLook, setMode } = useAppearance();
  return (
    <SettingsPage title="Appearance">
      <LookPicker value={look} onChange={setLook} />
      <Section title="Mode" footer="Saved on this device only.">
        <div className="px-4 py-3">
          <Segmented label="Mode" value={mode} options={MODES} onChange={setMode} />
        </div>
      </Section>
    </SettingsPage>
  );
}
