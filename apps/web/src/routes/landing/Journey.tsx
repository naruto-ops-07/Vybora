import { DeviceMobileIcon, HardDrivesIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { useA11y } from '@/features/a11y/A11yProvider';
import { cn } from '@/lib/cn';

const PLAIN = 'Meet at 7.';
const SEALED = 'k9Vq2LxT0fZr8wYp1HcN…';

const STEPS = [
  {
    title: 'You write a message',
    body: 'It exists as readable text only on your own device.',
    packet: PLAIN,
    sealed: false,
  },
  {
    title: 'It’s sealed before it leaves',
    body: 'MLS encrypts it with keys that only the chat members’ devices hold.',
    packet: SEALED,
    sealed: true,
  },
  {
    title: 'VYBORA relays ciphertext',
    body: 'Our servers store and forward the sealed message. They have no key to open it.',
    packet: SEALED,
    sealed: true,
  },
  {
    title: 'Their device opens it',
    body: 'The recipient decrypts it and checks it really came from your device.',
    packet: PLAIN,
    sealed: false,
  },
];

const NODES = [
  { x: 70, label: 'Your phone', icon: <DeviceMobileIcon size={22} /> },
  { x: 300, label: 'VYBORA server', icon: <HardDrivesIcon size={22} /> },
  { x: 530, label: 'Their phone', icon: <DeviceMobileIcon size={22} /> },
];

/** Where the packet sits, and how much of the route is lit, at each step (reduced motion). */
const STILL = [
  { x: 70, trail: 0 },
  { x: 120, trail: 0.1 },
  { x: 300, trail: 0.5 },
  { x: 530, trail: 1 },
];

/**
 * A tall section whose sticky diagram follows the reader's scroll position.
 * Under reduced motion it is an ordinary section instead: no pinning and no
 * scroll-driven movement; each step is a button that shows its state at once.
 */
export function Journey() {
  const { reduceMotion } = useA11y();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [scrolled, setScrolled] = useState(0);
  const [picked, setPicked] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (p) =>
    setScrolled(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length))),
  );
  const scrollX = useTransform(scrollYProgress, [0, 0.3, 0.55, 0.8, 1], [70, 95, 300, 530, 530]);
  const scrollTrail = useTransform(scrollYProgress, [0, 0.8], [0, 1]);
  const active = reduceMotion ? picked : scrolled;
  const packetX = reduceMotion ? STILL[active]!.x : scrollX;
  const trail = reduceMotion ? STILL[active]!.trail : scrollTrail;
  const step = STEPS[active]!;

  return (
    <section
      ref={ref}
      className={cn('border-t border-line', reduceMotion ? 'py-20 md:py-28' : 'relative h-[320vh]')}
      aria-labelledby="journey-title"
    >
      <div className={reduceMotion ? undefined : 'sticky top-0 flex h-dvh items-center'}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2
              id="journey-title"
              className="type-wide text-3xl font-semibold tracking-tight md:text-4xl"
            >
              How a message travels
            </h2>
            <ol className="mt-8 space-y-1">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  aria-current={i === active ? 'step' : undefined}
                  className={cn(
                    'relative grid grid-cols-[2rem_1fr] gap-x-3 border-l py-3 pl-4 transition-colors duration-300',
                    i === active ? 'border-accent' : 'border-line',
                  )}
                >
                  {reduceMotion && (
                    <button
                      type="button"
                      className="absolute inset-0 rounded-sm"
                      aria-label={`Show step ${i + 1}: ${s.title}`}
                      aria-pressed={i === active}
                      onClick={() => setPicked(i)}
                    />
                  )}
                  <span
                    className={cn(
                      'font-mono text-sm tabular-nums',
                      i === active ? 'text-accent' : 'text-subtle',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span
                      className={cn(
                        'block font-semibold transition-colors duration-300',
                        i === active ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {s.title}
                    </span>
                    <span
                      className={cn(
                        'mt-1 text-sm leading-relaxed text-muted transition-opacity duration-300',
                        i === active || reduceMotion ? 'block' : 'hidden md:block',
                        i === active ? 'opacity-100' : 'opacity-60',
                      )}
                    >
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <figure className="rounded-lg border border-line-strong bg-surface p-5 md:p-8">
            <svg
              viewBox="0 0 600 120"
              className="w-full"
              role="img"
              aria-label={`Step ${active + 1}: ${step.title}`}
            >
              <line
                x1="70"
                y1="60"
                x2="530"
                y2="60"
                stroke="var(--vy-border-strong)"
                strokeWidth="2"
                strokeDasharray="4 6"
              />
              <motion.line
                x1="70"
                y1="60"
                x2="530"
                y2="60"
                stroke="var(--vy-accent)"
                strokeWidth="2"
                style={{ pathLength: trail }}
              />
              {NODES.map((n) => (
                <g key={n.label}>
                  <rect
                    x={n.x - 26}
                    y={34}
                    width={52}
                    height={52}
                    rx={8}
                    fill="var(--vy-surface)"
                    stroke="var(--vy-border-strong)"
                    strokeWidth="1.5"
                  />
                  <foreignObject x={n.x - 26} y={34} width={52} height={52}>
                    <div
                      className="flex h-full w-full items-center justify-center text-muted"
                      aria-hidden="true"
                    >
                      {n.icon}
                    </div>
                  </foreignObject>
                </g>
              ))}
              <motion.circle
                cx={packetX}
                cy={60}
                r={9}
                fill={step.sealed ? 'var(--vy-accent)' : 'var(--vy-text)'}
                stroke="var(--vy-surface)"
                strokeWidth="3"
              />
            </svg>
            <div className="mt-2 grid grid-cols-3 text-center text-xs text-muted">
              {NODES.map((n) => (
                <span key={n.label}>{n.label}</span>
              ))}
            </div>
            <figcaption className="mt-8 rounded-md border border-line bg-bg p-4">
              <span className="flex items-center gap-2 text-xs text-muted">
                {step.sealed && (
                  <LockSimpleIcon size={13} className="text-accent" aria-hidden="true" />
                )}
                {step.sealed
                  ? 'Sealed. Unreadable without the members’ keys.'
                  : 'Readable, on a member’s device.'}
              </span>
              <span
                className={cn(
                  'mt-2 block font-mono text-lg',
                  step.sealed ? 'text-accent' : 'text-ink',
                )}
              >
                {step.packet}
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
