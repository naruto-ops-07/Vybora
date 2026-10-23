import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { formatCoordinates, mapLinkFor } from '@vybora/core';
import type { LocationPin } from '@vybora/e2ee';
import { useId, useMemo } from 'react';
import { FILL, LINE } from '@/components/illustrations/parts';
import { cn } from '@/lib/cn';

const W = 256;
const H = 112;
const ROAD = 7;
/** The one wide street each way. */
const AVENUE = 14;

/** A small deterministic PRNG, so a place always draws the same streets. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Grid lines from the edge, each step `min`–`min + spread` apart. */
function lines(rand: () => number, start: number, end: number, min: number, spread: number) {
  const out: number[] = [];
  for (let v = start - Math.round(rand() * 16); v < end; v += min + Math.round(rand() * spread))
    out.push(v);
  out.push(end + 40);
  return out;
}

/** One gap index whose street lies well inside the view: the avenue. */
function avenueAt(rand: () => number, at: number[], size: number) {
  const inside = at
    .slice(0, -2)
    .map((_, i) => i)
    .filter((i) => at[i + 1]! > 24 && at[i + 1]! < size - 24);
  return inside.length ? inside[Math.floor(rand() * inside.length)]! : 0;
}

/**
 * City blocks between streets, drawn from the coordinates (the same place always
 * draws the same streets): one wide avenue each way, one curved street and a park.
 */
export function streetBlocks(lat: number, lng: number) {
  const rand = seeded(formatCoordinates(lat, lng));
  const cols = lines(rand, -12, W, 34, 26);
  const rows = lines(rand, -8, H, 24, 16);
  const avCol = avenueAt(rand, cols, W);
  const avRow = avenueAt(rand, rows, H);
  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows.length - 1; r++)
    for (let c = 0; c < cols.length - 1; c++)
      blocks.push({
        x: cols[c]!,
        y: rows[r]!,
        w: cols[c + 1]! - cols[c]! - (c === avCol ? AVENUE : ROAD),
        h: rows[r + 1]! - rows[r]! - (r === avRow ? AVENUE : ROAD),
      });
  // One green: wholly in view and away from the pin (which sits in the middle).
  const away = blocks
    .map((b, i) => ({ i, b }))
    .filter(
      ({ b }) =>
        Math.hypot(b.x + b.w / 2 - W / 2, b.y + b.h / 2 - H / 2) > 46 &&
        b.x >= 4 &&
        b.y >= 4 &&
        b.x + b.w <= W - 4 &&
        b.y + b.h <= H - 4,
    );
  const park = away.length ? away[Math.floor(rand() * away.length)]!.i : -1;
  // A street that ignores the grid: a gentle curve from edge to edge.
  const y0 = 18 + rand() * (H - 36);
  const y1 = 18 + rand() * (H - 36);
  const bend = (rand() - 0.5) * 70;
  const curve = `M-12 ${y0.toFixed(1)} C${W * 0.35} ${(y0 + bend).toFixed(1)} ${W * 0.65} ${(y1 - bend).toFixed(1)} ${W + 12} ${y1.toFixed(1)}`;
  return { blocks, park, curve };
}

/**
 * The drawn place: streets and a pin, in the illustration grammar. No map tiles,
 * no image and no request of any kind, so nothing outside learns the location.
 * The park is the look's accent wash (never a person's tone). On my own bubble
 * everything is drawn in the bubble's text colour.
 */
function LocationArt({ lat, lng, filled }: { lat: number; lng: number; filled: boolean }) {
  const { blocks, park, curve } = useMemo(() => streetBlocks(lat, lng), [lat, lng]);
  const mask = `street-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cx = W / 2;
  const tip = H / 2 + 12;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('block h-28 w-full', !filled && 'text-muted')}
      aria-hidden="true"
      focusable="false"
      fill="none"
      data-location-art=""
    >
      <defs>
        {/* The curved street cuts through the blocks it crosses. */}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="white" />
          <path d={curve} stroke="black" strokeWidth={11} strokeLinecap="round" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        {blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={Math.max(4, b.w)}
            height={Math.max(4, b.h)}
            rx={5}
            fill={
              i === park
                ? filled
                  ? 'currentColor'
                  : 'var(--vy-accent-soft)'
                : filled
                  ? 'none'
                  : FILL.surface
            }
            fillOpacity={i === park && filled ? 0.22 : 1}
            data-park={i === park ? '' : undefined}
            {...LINE}
            strokeOpacity={i === park ? 0.7 : 0.4}
          />
        ))}
      </g>
      {/* Its two kerbs. */}
      <g data-street-curve="" {...LINE} strokeOpacity={0.4}>
        <path d={curve} transform="translate(0 -5.5)" />
        <path d={curve} transform="translate(0 5.5)" />
      </g>
      {/* Where it is: a ring on the ground and the pin standing in it. */}
      <ellipse cx={cx} cy={tip} rx={9} ry={3} {...LINE} />
      <path
        d={`M${cx} ${tip} C${cx - 6} ${tip - 9} ${cx - 11} ${tip - 15} ${cx - 11} ${tip - 22} A11 11 0 1 1 ${cx + 11} ${tip - 22} C${cx + 11} ${tip - 15} ${cx + 6} ${tip - 9} ${cx} ${tip} Z M${cx + 4} ${tip - 22} A4 4 0 1 0 ${cx - 4} ${tip - 22} A4 4 0 1 0 ${cx + 4} ${tip - 22} Z`}
        fillRule="evenodd"
        fill={filled ? 'currentColor' : FILL.accent}
        {...LINE}
        stroke={filled ? 'currentColor' : LINE.stroke}
      />
    </svg>
  );
}

export function LocationCard({ location, filled }: { location: LocationPin; filled: boolean }) {
  const { lat, lng, label } = location;
  const coords = formatCoordinates(lat, lng);
  return (
    <div className="-mx-2 -mt-0.5 w-[17rem] max-w-[calc(100%+1rem)]" data-location-card="">
      <div
        className={cn(
          'overflow-hidden rounded-md border',
          filled ? 'border-current/30' : 'border-line bg-surface-muted',
        )}
      >
        <LocationArt lat={lat} lng={lng} filled={filled} />
      </div>
      <div className="px-2 pt-2">
        {label ? (
          <p className="break-anywhere text-msg font-semibold leading-snug">{label}</p>
        ) : (
          <p className="font-mono text-[13px]">{coords}</p>
        )}
        <a
          href={mapLinkFor(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'touch-target -mx-1 mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1 text-sm font-semibold underline-offset-2 hover:underline',
            !filled && 'text-accent',
          )}
        >
          Open in OpenStreetMap
          <ArrowSquareOutIcon size={14} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
