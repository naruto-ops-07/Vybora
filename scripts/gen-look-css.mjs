#!/usr/bin/env node
// Generates apps/web/src/styles/looks.generated.css from the look tokens in
// packages/config (looks, personTonesByLook, highContrastThemes).
//
//   pnpm theme:css            # write the file
//   node scripts/gen-look-css.mjs --stdout   # print it (the web test compares the two)
//
// Selectors work on <html> and on any scoped wrapper (`<div data-look="bloom">`, as in
// Settings → Appearance), and the high-contrast blocks outrank every look block.

import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import prettier from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'apps', 'web', 'src', 'styles', 'looks.generated.css');

// packages/config is TypeScript with extensionless relative imports (bundler style).
// Node strips the types; this resolves `./looks` to `./looks.ts`.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier))
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const config = await import(
  pathToFileURL(join(root, 'packages', 'config', 'src', 'index.ts')).href
);
const { LOOKS, looks, personTonesByLook, highContrastThemes, personToneHighContrastInk } = config;

const MODES = ['light', 'dark'];

/** CSS variable name for each LookTokens key (today's names are kept). */
const VAR = {
  bg: 'bg',
  surface: 'surface',
  surfaceMuted: 'surface-muted',
  surfaceStrong: 'surface-strong',
  border: 'border',
  borderStrong: 'border-strong',
  text: 'text',
  textMuted: 'text-muted',
  textSubtle: 'text-subtle',
  accent: 'accent',
  accentHover: 'accent-hover',
  accentSoft: 'accent-soft',
  onAccent: 'on-accent',
  bubbleIn: 'bubble-in',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
  bubbleOutFrom: 'bubble-out-from',
  bubbleOutTo: 'bubble-out-to',
  bubbleOutText: 'bubble-out-text',
  primaryFrom: 'primary-from',
  primaryTo: 'primary-to',
  onPrimary: 'on-primary',
  glow1: 'glow-1',
  glow2: 'glow-2',
  glow3: 'glow-3',
  panel: 'panel',
};

/** Font stacks: the self-hosted variable face first, then a close system fallback. */
const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const fontStack = (family) =>
  family === 'Fraunces'
    ? `'Fraunces Variable', 'Fraunces', Georgia, 'Times New Roman', serif`
    : `'${family} Variable', '${family}', ${SANS_FALLBACK}`;

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, alpha) => `rgba(${hexRgb(hex).join(', ')}, ${alpha})`;
/** `amount` of `fg` over `bg`, as hex. */
const mix = (fg, bg, amount) =>
  '#' +
  hexRgb(fg)
    .map((c, i) => Math.round(c * amount + hexRgb(bg)[i] * (1 - amount)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');

/**
 * Tokens the web uses beyond LookTokens. Aurora keeps today's exact values; the other
 * looks tint their own surface with danger/warning (light 10 %, dark 16 %), which keeps
 * danger/warning text on them ≥ 4.5:1 (checked in the web test). Scrims: the look's
 * ink at 55 % in light (Aurora's today), black at 60 % in dark.
 */
const TODAY_AURORA = {
  light: { dangerSoft: '#FDECEA', warningSoft: '#FDF3E2', scrim: 'rgb(11 20 22 / 0.55)' },
  dark: { dangerSoft: '#2A1414', warningSoft: '#2A2110', scrim: 'rgb(0 0 0 / 0.6)' },
};
function extras(look, mode, t) {
  if (look === 'aurora') return TODAY_AURORA[mode];
  const amount = mode === 'light' ? 0.1 : 0.16;
  return {
    dangerSoft: mix(t.danger, t.surface, amount),
    warningSoft: mix(t.warning, t.surface, amount),
    scrim: mode === 'light' ? `rgb(${hexRgb(t.text).join(' ')} / 0.55)` : 'rgb(0 0 0 / 0.6)',
  };
}

const lower = (v) => (v.startsWith('#') ? v.toLowerCase() : v);
const line = (name, value) => `  --vy-${name}: ${lower(String(value))};`;
const rule = (selectors, lines) => `${selectors.join(',\n')} {\n${lines.join('\n')}\n}`;

function colourLines(t) {
  return Object.entries(VAR).map(([key, name]) => line(name, t[key]));
}

function toneLines(look, mode) {
  const tones = personTonesByLook[look];
  return Object.keys(tones).flatMap((tone) => {
    const c = tones[tone][mode];
    return [
      line(`tone-${tone}-fill`, c.fill),
      line(`tone-${tone}-ink`, c.ink),
      line(`tone-${tone}-name`, c.name),
    ];
  });
}

/** Visually none, yet still a valid item in a box-shadow list (rings compose with it). */
const NO_SHADOW = '0 0 #0000';

/**
 * Popovers (menus, dialogs, toasts, tooltips). With glass, the surface at 84 % behind a
 * blur (the look's `panel` is a header tint, too thin to read a menu over), and a light
 * rim on top in dark. Without glass, the solid raised surface and a hairline edge of
 * 35 % accent over the border (Velvet's gold).
 */
function popoverLines(look, mode, t) {
  const glass = looks[look].glass;
  return [
    line('popover', glass ? rgba(t.surface, 0.84) : t.surface),
    line(
      'edge',
      glass
        ? mode === 'dark'
          ? 'rgba(255, 255, 255, 0.12)'
          : t.border
        : mix(t.accent, t.border, 0.35),
    ),
  ];
}

function lookBlock(look, mode) {
  const def = looks[look];
  const t = def.modes[mode];
  const x = extras(look, mode, t);
  const lines = [
    ...colourLines(t),
    line('danger-soft', x.dangerSoft),
    line('warning-soft', x.warningSoft),
    line('scrim', x.scrim),
    ...[1, 2, 3].map((level) => {
      const e = def.elevation[level];
      return line(`shadow-${level}`, `0 ${e.y}px ${e.blur}px ${rgba(t.shadowColor, e.alpha)}`);
    }),
    ...popoverLines(look, mode, t),
    ...toneLines(look, mode),
  ];
  if (mode === 'light') {
    // Shape, type and depth hold in both modes, so they are declared once.
    lines.push(
      line('radius-sm', `${def.radii.sm}px`),
      line('radius-md', `${def.radii.md}px`),
      line('radius-lg', `${def.radii.lg}px`),
      line('font-display', fontStack(def.fonts.display)),
      line('font-text', fontStack(def.fonts.text)),
      // Velvet's bubble runs top → bottom; the others corner to corner.
      line('bubble-out-angle', look === 'velvet' ? '180deg' : '135deg'),
      line('primary-angle', look === 'velvet' ? '180deg' : '135deg'),
      // Velvet's primary button: a 1 px inner top highlight. Elsewhere a no-op shadow.
      line(
        'primary-highlight',
        look === 'velvet' ? 'inset 0 1px 0 rgba(255, 255, 255, 0.45)' : NO_SHADOW,
      ),
      line('panel-blur', def.glass ? '20px' : '0px'),
    );
  }
  lines.push(`  color-scheme: ${mode};`);

  const isDefault = look === 'velvet';
  const selectors =
    mode === 'light'
      ? [...(isDefault ? [':where(:root)'] : []), `[data-look='${look}']`]
      : [
          ...(isDefault ? [":where(:root[data-theme='dark'])"] : []),
          `[data-look='${look}'][data-theme='dark']`,
          `[data-theme='dark'] [data-look='${look}']`,
        ];
  return `/* ${def.name}, ${mode} */\n${rule(selectors, lines)}`;
}

function highContrastBlock(mode) {
  const t = highContrastThemes[mode];
  const x = TODAY_AURORA[mode];
  const ink = personToneHighContrastInk[mode];
  // Flat everywhere: gradient stops collapse to one colour, no glow, no blur, and every
  // shadow is the no-op `0 0 #0000` (not `none`, which would void a ring composed with it).
  const flat = {
    ...t,
    bubbleOutFrom: t.accent,
    bubbleOutTo: t.accent,
    bubbleOutText: t.onAccent,
    primaryFrom: t.accent,
    primaryTo: t.accent,
    onPrimary: t.onAccent,
    glow1: 'transparent',
    glow2: 'transparent',
    glow3: 'transparent',
    panel: t.surface,
  };
  const lines = [
    ...colourLines(flat),
    line('danger-soft', x.dangerSoft),
    line('warning-soft', x.warningSoft),
    line('scrim', x.scrim),
    line('shadow-1', NO_SHADOW),
    line('shadow-2', NO_SHADOW),
    line('shadow-3', NO_SHADOW),
    line('primary-highlight', NO_SHADOW),
    line('popover', t.surface),
    line('edge', t.border),
    line('panel-blur', '0px'),
    // Fills stay the look's; initials take the theme ink (≥ 7:1), names the text colour.
    ...Object.keys(personTonesByLook.aurora).flatMap((tone) => [
      line(`tone-${tone}-ink`, ink),
      line(`tone-${tone}-name`, 'var(--vy-text)'),
    ]),
  ];
  const base =
    mode === 'light'
      ? ":root[data-contrast='high']"
      : ":root[data-contrast='high'][data-theme='dark']";
  return `/* High contrast, ${mode}: every look */\n${rule([base, `${base} [data-look]`], lines)}`;
}

/** The stylesheet, formatted with the repo's Prettier config (so `format:check` agrees). */
export async function buildLookCss() {
  const header = [
    '/*',
    ' * GENERATED by scripts/gen-look-css.mjs from packages/config (looks.ts, index.ts).',
    ' * Do not edit: change the tokens and run `pnpm theme:css`.',
    ' *',
    ' * Each look sets its tokens on <html data-look> or on any scoped [data-look] wrapper;',
    " * dark comes from data-theme='dark' on the same element or an ancestor. Velvet is",
    ' * the zero-specificity default. High contrast outranks every look block.',
    ' */',
  ].join('\n');
  const blocks = LOOKS.flatMap((look) => MODES.map((mode) => lookBlock(look, mode)));
  const css = [header, ...blocks, highContrastBlock('light'), highContrastBlock('dark')];
  const options = (await prettier.resolveConfig(outFile)) ?? {};
  return prettier.format(`${css.join('\n\n')}\n`, { ...options, filepath: outFile });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const css = await buildLookCss();
  if (process.argv.includes('--stdout')) process.stdout.write(css);
  else {
    writeFileSync(outFile, css);
    console.log(`wrote ${outFile.slice(root.length + 1)}`);
  }
}
