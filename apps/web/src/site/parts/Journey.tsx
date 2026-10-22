import { DeviceMobileIcon, HardDrivesIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

const PLAIN = 'Meet at 7.';
const SEALED = 'k9Vq2LxT0fZr8wYp1HcN…';

export const STEPS = [
  {
    title: 'You write a message',
    body: 'It exists as readable text only on your own device.',
    packet: PLAIN,
    sealed: false,
    at: 0,
  },
  {
    title: 'It’s sealed before it leaves',
    body: 'MLS encrypts it with keys that only the chat members’ devices hold.',
    packet: SEALED,
    sealed: true,
    at: 12,
  },
  {
    title: 'VYBORA relays ciphertext',
    body: 'Our servers store and forward the sealed message. They have no key to open it.',
    packet: SEALED,
    sealed: true,
    at: 50,
  },
  {
    title: 'Their device opens it',
    body: 'The recipient decrypts it and checks it really came from your device.',
    packet: PLAIN,
    sealed: false,
    at: 100,
  },
];

const NODES = [
  { label: 'Your phone', icon: <DeviceMobileIcon size={22} /> },
  { label: 'VYBORA server', icon: <HardDrivesIcon size={22} /> },
  { label: 'Their phone', icon: <DeviceMobileIcon size={22} /> },
];

/**
 * How a message travels, one step at a time. Each step is a button; the packet glides to
 * its place on the route (the privacy page's one authored move: a transform, eased out,
 * and instant under reduced motion through the global rule).
 */
export function Journey() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;
  return (
    <div className="grid items-start gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              aria-pressed={i === active}
              aria-label={`Show step ${i + 1}: ${s.title}`}
              onClick={() => setActive(i)}
              className={cn(
                'site-step grid min-h-11 w-full grid-cols-[2rem_1fr] gap-x-3 rounded-md px-4 py-3 text-left',
                i === active ? 'bg-surface-strong' : 'hover:bg-surface-muted',
              )}
            >
              <span
                className={cn(
                  'type-wide text-lg tabular-nums',
                  i === active ? 'text-accent' : 'text-muted',
                )}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>
                <span className={cn('block font-semibold', i !== active && 'text-muted')}>
                  {s.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <figure className="rounded-lg bg-surface p-6 shadow-2 md:p-8" data-ui="">
        <div role="img" aria-label={`Step ${active + 1}: ${step.title}`}>
          <div className="relative mx-[26px] h-14" aria-hidden="true">
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line-strong" />
            <span
              className="site-trail absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-accent"
              style={{ width: `${step.at}%` }}
            />
            {[0, 50, 100].map((x, i) => (
              <span
                key={x}
                className="absolute top-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-line-strong bg-surface text-muted"
                style={{ left: `${x}%` }}
              >
                {NODES[i]!.icon}
              </span>
            ))}
            <span
              className="site-packet absolute top-1/2 z-10 h-[18px] -translate-x-1/2 -translate-y-1/2 w-[18px] rounded-full border-[3px] border-surface"
              style={{
                left: `${step.at}%`,
                background: step.sealed ? 'var(--vy-accent)' : 'var(--vy-text)',
              }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 text-center text-xs text-muted" aria-hidden="true">
            {NODES.map((n, i) => (
              <span key={n.label} className={cn(i === 0 && 'text-left', i === 2 && 'text-right')}>
                {n.label}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="mt-8 rounded-md bg-surface-muted p-4">
          <span className="flex items-center gap-2 text-sm text-muted">
            {step.sealed && <LockSimpleIcon size={14} className="text-accent" aria-hidden="true" />}
            {step.sealed
              ? 'Sealed. Unreadable without the members’ keys.'
              : 'Readable, on a member’s device.'}
          </span>
          <span
            className={cn('mt-2 block font-mono text-lg', step.sealed ? 'text-accent' : 'text-ink')}
          >
            {step.packet}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
