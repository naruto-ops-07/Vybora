import {
  CaretLeftIcon,
  LockSimpleIcon,
  PaperPlaneRightIcon,
  PlayIcon,
} from '@phosphor-icons/react';
import { LOOKS, looks, type Look } from '@vybora/config';
import { useEffect, useState } from 'react';
import { loadLookFonts } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { Face, INES, MAYA, THEO, toneOf, type SamplePerson } from './Face';

const CREW = [INES, THEO, MAYA];

const WAVE = [6, 10, 16, 9, 14, 20, 12, 7, 15, 18, 11, 6, 13, 17, 9, 5, 12, 8];

function In({
  from,
  children,
  time,
  i,
}: {
  from: SamplePerson;
  children: React.ReactNode;
  time: string;
  i: number;
}) {
  return (
    <div className="site-arrive flex items-end gap-2" style={{ ['--i' as string]: i }}>
      <Face person={from} size={26} />
      <div className="vy-bubble-in max-w-[78%] rounded-lg rounded-bl-sm px-3 py-2 text-[14px] leading-snug">
        <span className="mb-0.5 block text-xs font-semibold" style={{ color: toneOf(from).text }}>
          {from.name}
        </span>
        {children}
        <span className="mt-0.5 block text-right font-mono text-[10px] text-subtle">{time}</span>
      </div>
    </div>
  );
}

/**
 * The hero's product moment: a group chat as the app draws it, in a look the visitor can
 * switch. The phone carries its own data-look, so the page keeps the visitor's look.
 * Sample people and words; nothing here is anyone's real message.
 */
export function PhonePreview() {
  const [look, setLook] = useState<Look>('velvet');
  const [touched, setTouched] = useState(false);

  // Start on the visitor's own look once we're in the browser (the prerendered page and
  // the first client render both show Velvet, so they match).
  useEffect(() => {
    const saved = document.documentElement.dataset.look;
    if (saved && (LOOKS as readonly string[]).includes(saved)) setLook(saved as Look);
  }, []);

  const pick = (next: Look) => {
    void loadLookFonts(next);
    setTouched(true);
    setLook(next);
  };

  return (
    <figure className="mx-auto w-full max-w-[400px]">
      <div
        data-look={look}
        data-ui=""
        className="site-phone relative overflow-hidden rounded-[2.25rem] bg-bg p-2 shadow-3"
        role="img"
        aria-label={`A VYBORA group chat, Saturday crew, in the ${looks[look].name} look: Ines, Theo and Maya plan a picnic, with a voice note and a sealed reply.`}
      >
        <div
          className="flex h-[500px] flex-col md:h-[540px] overflow-hidden rounded-[1.75rem] bg-bg text-ink"
          style={{ fontFamily: 'var(--vy-font-body)' }}
          aria-hidden="true"
        >
          <div className="vy-panel flex items-center gap-3 border-b px-3 py-3">
            <CaretLeftIcon size={18} className="text-muted" />
            <span className="flex -space-x-2">
              {CREW.map((p) => (
                <Face key={p.id} person={p} size={28} className="ring-2 ring-[var(--vy-panel)]" />
              ))}
            </span>
            <span className="min-w-0">
              <span className="type-wide block text-[15px] leading-tight">Saturday crew</span>
              <span className="flex items-center gap-1 text-[11px] text-subtle">
                <LockSimpleIcon size={10} /> End-to-end encrypted
              </span>
            </span>
          </div>
          <div
            key={touched ? look : 'first'}
            className={cn('flex flex-1 flex-col justify-end gap-2.5 p-3', touched && 'site-replay')}
          >
            <p className="site-arrive mx-auto mb-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] text-muted">
              Today
            </p>
            <In from={INES} time="17:58" i={0}>
              Picnic at the lake, 3 pm?
            </In>
            <In from={THEO} time="18:01" i={1}>
              I’ll bring the big blanket
            </In>
            <In from={MAYA} time="18:02" i={2}>
              <span className="flex items-center gap-2 py-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent">
                  <PlayIcon size={12} weight="fill" />
                </span>
                <span className="flex h-5 items-center gap-[2px]">
                  {WAVE.map((h, k) => (
                    <span
                      key={k}
                      className="w-[3px] rounded-full bg-current opacity-60"
                      style={{ height: h }}
                    />
                  ))}
                </span>
                <span className="font-mono text-[11px] text-muted">0:12</span>
              </span>
            </In>
            <div
              className="site-arrive ml-auto max-w-[78%] rounded-lg rounded-br-sm bg-bubble-out px-3 py-2 text-[14px] leading-snug text-bubble-out-text shadow-1"
              style={{ ['--i' as string]: 3 }}
            >
              Count me in. I’ll make the playlist
              <span className="mt-0.5 block text-right font-mono text-[10px] opacity-80">
                18:04 · read
              </span>
            </div>
          </div>
          <div className="vy-panel flex items-center gap-2 border-t px-3 py-2.5">
            <span className="h-9 flex-1 rounded-full border border-line bg-surface px-4 text-sm leading-9 text-subtle">
              Message
            </span>
            <span className="bg-primary-gradient flex h-9 w-9 items-center justify-center rounded-full text-on-primary shadow-1">
              <PaperPlaneRightIcon size={16} weight="fill" />
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <span id="look-label" className="text-sm text-muted">
          Try a look
        </span>
        <span
          role="radiogroup"
          aria-labelledby="look-label"
          className="vy-seg inline-flex rounded-full p-1"
        >
          {LOOKS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={look === l}
              tabIndex={look === l ? 0 : -1}
              onClick={() => pick(l)}
              onKeyDown={(e) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (!step) return;
                e.preventDefault();
                const next = LOOKS[(LOOKS.indexOf(l) + step + LOOKS.length) % LOOKS.length]!;
                pick(next);
                (
                  e.currentTarget.parentElement?.querySelector(
                    `[data-look-option="${next}"]`,
                  ) as HTMLElement | null
                )?.focus();
              }}
              data-look-option={l}
              className="vy-seg-item min-h-11 min-w-[5.5rem] rounded-full px-4 text-sm font-semibold"
            >
              {looks[l].name}
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
