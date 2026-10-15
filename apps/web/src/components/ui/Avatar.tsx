import { avatarUrl } from '@vybora/api';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

// Muted, flat tones; white initials meet 4.5:1 on each.
const palette = ['#0F766E', '#1D4ED8', '#047857', '#6D28D9', '#B45309', '#3F4A4D', '#BE185D'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export interface AvatarProps {
  path: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ path, name, size = 40, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? avatarUrl(supabase, path) : null;
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={!src ? { background: colorFor(name) } : undefined}
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            width={size}
            height={size}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="font-semibold text-white"
            style={{ fontSize: Math.round(size * 0.4) }}
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
      </span>
    </span>
  );
}
