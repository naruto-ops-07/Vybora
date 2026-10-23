import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { formatCoordinates, mapLinkFor, PERSON_TONES } from '@vybora/core';
import type { LocationPin } from '@vybora/e2ee';
import { useMemo } from 'react';
import { FILL, LINE } from '@/components/illustrations/parts';
import { cn } from '@/lib/cn';

const W = 256;
const H = 112;
const ROAD = 7;

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

/** City blocks between streets; the street pattern is drawn from the coordinates. */
export function streetBlocks(lat: number, lng: number) {
  const rand = seeded(formatCoordinates(lat, lng));
  const cols: number[] = [];
  for (let x = -12 - Math.round(rand() * 20); x < W; x += 34 + Math.round(rand() * 26))
    cols.push(x);
  cols.push(W + 40);
  const rows: number[] = [];
  for (let y = -8 - Math.round(rand() * 14); y < H; y += 22 + Math.round(rand() * 18)) rows.push(y);
  rows.push(H + 30);
  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows.length - 1; r++)
    for (let c = 0; c < cols.length - 1; c++)
      blocks.push({
        x: cols[c]!,
        y: rows[r]!,
        w: cols[c + 1]! - cols[c]! - ROAD,
        h: rows[r + 1]! - rows[r]! - ROAD,
      });
  // One green: a park somewhere away from the pin (which sits in the middle).
  const away = blocks
    .map((b, i) => ({ i, d: Math.hypot(b.x + b.w / 2 - W / 2, b.y + b.h / 2 - H / 2) }))
    .filter((b) => b.d > 46);
  const park = away.length ? away[Math.floor(rand() * away.length)]!.i : -1;
  const tone = PERSON_TONES[Math.floor(rand() * PERSON_TONES.length)]!;
  return { blocks, park, tone };
}

/**
 * The drawn place: streets and a pin, in the illustration grammar. No map tiles,
 * no image and no request of any kind, so nothing outside learns the location.
 * On my own bubble everything is drawn in the bubble's text colour.
 */
function LocationArt({ lat, lng, filled }: { lat: number; lng: number; filled: boolean }) {
  const { blocks, park, tone } = useMemo(() => streetBlocks(lat, lng), [lat, lng]);
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
                : FILL.tone(tone)
              : filled
                ? 'none'
                : FILL.surface
          }
          fillOpacity={i === park && filled ? 0.22 : 1}
          {...LINE}
          strokeOpacity={i === park ? 0.7 : 0.4}
        />
      ))}
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
    <div className="-mx-2 -mt-0.5 w-[min(17rem,64vw)]" data-location-card="">
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
          Open in Maps
          <ArrowSquareOutIcon size={14} aria-hidden="true" />
        </a>
        <p className={cn('text-xs', !filled && 'text-muted')}>
          Opens openstreetmap.org in a new tab.
        </p>
      </div>
    </div>
  );
}
