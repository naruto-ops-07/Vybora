/**
 * Shared chat themes — rendered identically for every participant on every
 * platform. Preset keys and wallpaper keys are validated by the database
 * (`set_conversation_theme`), so they must not be renamed; labels may change.
 *
 * Each theme is a flat colour for outgoing bubbles (white text, ≥ 4.5:1) plus
 * an accent tuned separately for dark and light surfaces. No gradients.
 */

export interface ChatThemeDef {
  label: string;
  /** Outgoing bubble fill. */
  bubble: string;
  bubbleText: string;
  /** Accent for names, typing and links on dark surfaces. */
  accentDark: string;
  /** Accent on light surfaces. */
  accentLight: string;
}

export const DEFAULT_THEME_PRESET = 'aurora';

export const chatThemeDefs: Record<string, ChatThemeDef> = {
  aurora: {
    label: 'Teal',
    bubble: '#0F766E',
    bubbleText: '#FFFFFF',
    accentDark: '#2DD4BF',
    accentLight: '#0F766E',
  },
  forest: {
    label: 'Emerald',
    bubble: '#047857',
    bubbleText: '#FFFFFF',
    accentDark: '#34D399',
    accentLight: '#047857',
  },
  ocean: {
    label: 'Ocean',
    bubble: '#1D4ED8',
    bubbleText: '#FFFFFF',
    accentDark: '#93C5FD',
    accentLight: '#1D4ED8',
  },
  midnight: {
    label: 'Indigo',
    bubble: '#3730A3',
    bubbleText: '#FFFFFF',
    accentDark: '#A5B4FC',
    accentLight: '#3730A3',
  },
  violet: {
    label: 'Violet',
    bubble: '#6D28D9',
    bubbleText: '#FFFFFF',
    accentDark: '#C4B5FD',
    accentLight: '#6D28D9',
  },
  rose: {
    label: 'Rose',
    bubble: '#BE185D',
    bubbleText: '#FFFFFF',
    accentDark: '#F9A8D4',
    accentLight: '#BE185D',
  },
  ember: {
    label: 'Ember',
    bubble: '#B45309',
    bubbleText: '#FFFFFF',
    accentDark: '#FDBA74',
    accentLight: '#B45309',
  },
  mono: {
    label: 'Graphite',
    bubble: '#3F4A4D',
    bubbleText: '#FFFFFF',
    accentDark: '#CBD5D6',
    accentLight: '#3F4A4D',
  },
};

/** Display order in pickers (default first). */
export const THEME_ORDER = [
  'aurora',
  'forest',
  'ocean',
  'midnight',
  'violet',
  'rose',
  'ember',
  'mono',
] as const;

export function resolveChatTheme(
  theme: { preset?: string | null } | null | undefined,
): ChatThemeDef {
  return (
    chatThemeDefs[theme?.preset ?? DEFAULT_THEME_PRESET] ?? chatThemeDefs[DEFAULT_THEME_PRESET]!
  );
}

export function chatAccent(def: ChatThemeDef, dark: boolean) {
  return dark ? def.accentDark : def.accentLight;
}

/**
 * Wallpapers: flat line/dot patterns (viewBox 0 0 400 800) drawn in the accent
 * colour at low opacity over the app's own background. No gradients.
 */
export function wallpaperSvg(name: string | null | undefined, accent: string): string | null {
  const a = accent;
  const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  const rng = (seed: number) => {
    let s = seed;
    return () => (s = (s * 9301 + 49297) % 233280) / 233280;
  };
  switch (name) {
    case 'nebula': {
      // "Constellation": deterministic points joined by thin lines.
      const r = rng(11);
      const pts = Array.from({ length: 28 }, () => [r() * 400, r() * 800] as const);
      const lines = pts
        .slice(1)
        .map((p, i) =>
          i % 3 === 2
            ? ''
            : `<line x1="${pts[i]![0].toFixed(0)}" y1="${pts[i]![1].toFixed(0)}" x2="${p[0].toFixed(0)}" y2="${p[1].toFixed(0)}"/>`,
        )
        .join('');
      const dots = pts
        .map(([x, y]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="2"/>`)
        .join('');
      return svg(
        `<g stroke="${a}" stroke-opacity="0.12" stroke-width="1">${lines}</g><g fill="${a}" fill-opacity="0.22">${dots}</g>`,
      );
    }
    case 'waves':
      return svg(
        `<g fill="none" stroke="${a}" stroke-opacity="0.12" stroke-width="1.5">${Array.from(
          { length: 14 },
          (_, i) =>
            `<path d="M-20 ${60 + i * 56} C 80 ${30 + i * 56}, 160 ${90 + i * 56}, 240 ${60 + i * 56} S 380 ${30 + i * 56}, 440 ${60 + i * 56}"/>`,
        ).join('')}</g>`,
      );
    case 'grid':
      return svg(
        `<g stroke="${a}" stroke-opacity="0.08" stroke-width="1">${Array.from(
          { length: 11 },
          (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="800"/>`,
        ).join('')}${Array.from(
          { length: 21 },
          (_, i) => `<line x1="0" y1="${i * 40}" x2="400" y2="${i * 40}"/>`,
        ).join('')}</g>`,
      );
    case 'bloom':
      // "Rings": concentric outlines.
      return svg(
        `<g fill="none" stroke="${a}" stroke-opacity="0.1" stroke-width="1">${[60, 110, 160, 210]
          .map((rr) => `<circle cx="60" cy="140" r="${rr}"/><circle cx="360" cy="560" r="${rr}"/>`)
          .join('')}</g>`,
      );
    case 'dunes':
      return svg(
        `<path d="M0 560 C 120 500, 220 620, 400 540 L400 800 L0 800Z" fill="${a}" fill-opacity="0.05"/><path d="M0 650 C 140 600, 260 700, 400 640 L400 800 L0 800Z" fill="${a}" fill-opacity="0.07"/><path d="M0 730 C 120 700, 280 770, 400 720 L400 800 L0 800Z" fill="${a}" fill-opacity="0.09"/>`,
      );
    case 'stars': {
      const r = rng(7);
      const dots = Array.from(
        { length: 90 },
        () =>
          `<circle cx="${(r() * 400).toFixed(1)}" cy="${(r() * 800).toFixed(1)}" r="${(0.6 + r() * 1.2).toFixed(2)}"/>`,
      ).join('');
      return svg(`<g fill="${a}" fill-opacity="0.22">${dots}</g>`);
    }
    default:
      return null;
  }
}

export const wallpaperLabels: Record<string, string> = {
  none: 'None',
  nebula: 'Constellation',
  waves: 'Waves',
  grid: 'Grid',
  bloom: 'Rings',
  dunes: 'Dunes',
  stars: 'Stars',
};

export const toneLabels: Record<string, string> = {
  default: 'Default',
  soft_chime: 'Soft chime',
  pop: 'Pop',
  bell: 'Bell',
  electronic: 'Electronic',
  none: 'Silent',
};
