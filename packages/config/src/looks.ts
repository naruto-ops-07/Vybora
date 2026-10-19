/**
 * Looks: VYBORA's three visual identities, each in light and dark.
 *
 * - Velvet (default): warm black / ivory, deep emerald bubbles, champagne gold.
 *   Fraunces + DM Sans. Soft real shadows, no glass, no ambient motion.
 * - Aurora: today's graphite and teal, with teal → indigo bubbles and teal,
 *   violet and sky light behind frosted panels. Sora + Manrope. Slow drift.
 * - Bloom: pearl / plum night, sunset pink → orange bubbles, violet accents.
 *   Plus Jakarta Sans. Frosted panels, soft glow pulse.
 *
 * Aurora's ThemeTokens are today's `themes` except the three contrast fixes listed
 * below, and its person tones are today's exactly (core tests pin both). Contrast
 * is checked for every look × mode in packages/core/src/looks.test.ts.
 *
 * Hex adjusted away from an anchor because a contrast test needed it:
 * - Velvet light accent: gold #9A7A45 → #846530 (same hue and chroma, darker).
 *   #9A7A45 is 3.78:1 on ivory #FBF8F2 and 4.00:1 on white (now 5.10:1 / 5.41:1), as link
 *   text and under white badge text.
 * - Aurora bubble: #14B8A6 → #6366F1 became #0A8276 → #5F62EE. White text was
 *   2.49:1 on #14B8A6 and 4.47:1 on #6366F1; now 4.70:1 on both.
 * - Bloom bubble: #FF5E8A → #FF8E5E became #D6336C → #C84A1A (same hues, deeper).
 *   White text was 2.91:1 / 2.26:1; now 4.62:1 / 4.72:1.
 * - Bloom primary (mockup send button): #6D4AFF → #B04AFF became #6D4AFF → #A23EF0.
 *   White text was 3.99:1 on #B04AFF; now 4.68:1.
 *
 * - Aurora (today's tokens) dark textSubtle #75898B → #798E90: 4.25:1 on bubbleIn
 *   #1B2528, now 4.54:1 (smallest lift that passes).
 * - Aurora borderStrong (control edges, ≥ 3:1): light #C2CFCF → #818D8D (was 1.42–1.60:1,
 *   now 3.03–3.43:1 on surface, bg and surfaceMuted); dark #2E3D41 → #596A6E (was
 *   1.52–1.72:1, now 3.02–3.43:1).
 * Every other Aurora value is today's. All three looks meet every floor.
 *
 * Aurora's spec anchors night #060A13, pale sky #F4F7FB and text #EAF2FF are not
 * used (today's graphite set wins); its mockup glows and frosted panel are kept.
 */

/** Graphite + teal: the original VYBORA palette, now Aurora's base and high contrast's. */
export const palette = {
  graphite950: '#0A0E0F',
  graphite900: '#0F1517',
  graphite850: '#151D1F',
  graphite800: '#1B2528',
  graphite750: '#1F2A2D',
  graphite700: '#2E3D41',
  graphite500: '#75898B',
  graphite400: '#9AACAD',
  graphite100: '#E6EEEE',
  mist50: '#F3F6F6',
  mist100: '#EDF2F2',
  mist200: '#E2EAEA',
  mist300: '#DCE4E4',
  mist400: '#C2CFCF',
  slate600: '#5F7173',
  slate700: '#4B5C5E',
  ink: '#0B1416',
  white: '#FFFFFF',
  turquoise: '#2DD4BF',
  turquoiseLight: '#5EEAD4',
  teal700: '#0F766E',
  teal800: '#115E59',
  tealDeep: '#0F4C47',
  emerald: '#34D399',
  emeraldDeep: '#047857',
} as const;

/** The flat light/dark tokens (Aurora's base). Prefer `looks[look].modes[mode]`. */
export const themes = {
  light: {
    bg: palette.mist50,
    surface: palette.white,
    surfaceMuted: palette.mist100,
    surfaceStrong: palette.mist200,
    border: palette.mist300,
    borderStrong: '#818D8D',
    text: palette.ink,
    textMuted: palette.slate700,
    textSubtle: palette.slate600,
    accent: palette.teal700,
    accentHover: palette.teal800,
    accentSoft: '#DDF3F0',
    onAccent: palette.white,
    bubbleIn: palette.mist100,
    danger: '#B42318',
    success: palette.emeraldDeep,
    warning: '#B45309',
  },
  dark: {
    bg: palette.graphite950,
    surface: palette.graphite900,
    surfaceMuted: palette.graphite850,
    surfaceStrong: palette.graphite800,
    border: palette.graphite750,
    borderStrong: '#596A6E',
    text: palette.graphite100,
    textMuted: palette.graphite400,
    textSubtle: '#798E90',
    accent: palette.turquoise,
    accentHover: palette.turquoiseLight,
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: palette.graphite800,
    danger: '#F87171',
    success: palette.emerald,
    warning: '#FBBF24',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeTokens = { [K in keyof (typeof themes)['light']]: string };

/**
 * Accessibility → High contrast. Same keys as `themes`; text ≥ 7:1, secondary
 * text ≥ 4.5:1 and borders ≥ 3:1 against surfaces (checked in core tests).
 */
export const highContrastThemes: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    bg: palette.white,
    surface: palette.white,
    surfaceMuted: '#F1F5F5',
    surfaceStrong: palette.mist200,
    border: palette.slate600,
    borderStrong: palette.graphite700,
    text: palette.ink,
    textMuted: palette.graphite700,
    textSubtle: '#3E4F52',
    accent: palette.teal800,
    accentHover: palette.tealDeep,
    accentSoft: '#CDEDEA',
    onAccent: palette.white,
    bubbleIn: palette.mist200,
    danger: '#8F1B12',
    success: '#065F46',
    warning: '#7C3A06',
  },
  dark: {
    bg: '#000000',
    surface: palette.graphite950,
    surfaceMuted: palette.graphite850,
    surfaceStrong: palette.graphite750,
    border: palette.graphite500,
    borderStrong: palette.graphite400,
    text: palette.white,
    textMuted: '#C9D6D6',
    textSubtle: '#AFC0C1',
    accent: palette.turquoiseLight,
    accentHover: '#99F6E4',
    accentSoft: '#0E2B2A',
    onAccent: '#04201D',
    bubbleIn: palette.graphite750,
    danger: '#FCA5A5',
    success: '#6EE7B7',
    warning: '#FCD34D',
  },
};

export type Look = 'velvet' | 'aurora' | 'bloom';
export const LOOKS: readonly Look[] = ['velvet', 'aurora', 'bloom'];
export const DEFAULT_LOOK: Look = 'velvet';

export type Mode = 'light' | 'dark';

/**
 * One look in one mode. Text pairs: `text`/`textMuted`/`textSubtle` on `bg`, `surface`,
 * `surfaceMuted` and `bubbleIn`; `bubbleOutText` on both bubble stops; `onPrimary` on
 * both primary stops; `onAccent` on `accent`. `border` is a decorative hairline;
 * `borderStrong` bounds controls (inputs, switches) and is ≥ 3:1.
 */
export interface LookTokens extends ThemeTokens {
  /** Outgoing bubble gradient (top-left → bottom-right; Velvet runs top → bottom). */
  bubbleOutFrom: string;
  bubbleOutTo: string;
  bubbleOutText: string;
  /** Main button gradient. */
  primaryFrom: string;
  primaryTo: string;
  onPrimary: string;
  /** Ambient light behind the canvas: `rgba(…)` or `'transparent'`. */
  glow1: string;
  glow2: string;
  glow3: string;
  /** Header/composer surface: translucent where the look has glass, else a solid hex. */
  panel: string;
  /**
   * Shadow tint, an opaque hex composed with the elevation alpha:
   * `0 ${y}px ${blur}px rgba(shadowColor, alpha)` (iOS: shadowColor + shadowOpacity).
   * Dark modes use near-black; light modes a pale tint, so the same alpha reads as a
   * soft shadow on light surfaces.
   */
  shadowColor: string;
}

export interface Elevation {
  y: number;
  blur: number;
  alpha: number;
}

export interface LookDef {
  name: string;
  /** Family names; each app maps them to its loaded font files. */
  fonts: { display: string; text: string };
  /**
   * Weight of the display face for titles (web `--vy-display-weight`; mobile picks the
   * nearest static cut it bundles). Fraunces is already heavy at 600; Bloom shouts.
   */
  displayWeight: number;
  radii: { sm: number; md: number; lg: number };
  /** 1: bubbles, buttons, cards. 2: menus, popovers, toasts. 3: dialogs, sheets. */
  elevation: Record<1 | 2 | 3, Elevation>;
  /** Frosted panels (backdrop blur behind `panel`). */
  glass: boolean;
  /** The one ambient effect, off under reduced motion. */
  ambient: 'none' | 'drift' | 'pulse';
  modes: Record<Mode, LookTokens>;
}

const velvet: LookDef = {
  name: 'Velvet',
  fonts: { display: 'Fraunces', text: 'DM Sans' },
  displayWeight: 600,
  radii: { sm: 6, md: 12, lg: 18 },
  elevation: {
    1: { y: 4, blur: 14, alpha: 0.4 },
    2: { y: 12, blur: 32, alpha: 0.46 },
    3: { y: 24, blur: 64, alpha: 0.54 },
  },
  glass: false,
  ambient: 'none',
  modes: {
    dark: {
      bg: '#0F0D0B',
      surface: '#1C1916',
      surfaceMuted: '#231F1B',
      surfaceStrong: '#2B2621',
      border: '#302A23',
      borderStrong: '#746A5B',
      text: '#F3EDE4',
      textMuted: '#BEB3A3',
      textSubtle: '#9C9081',
      accent: '#D4B483',
      accentHover: '#E5CB9C',
      accentSoft: '#2F271B',
      onAccent: '#1A140C',
      bubbleIn: '#221E1A',
      danger: '#F0887B',
      success: '#74C9A0',
      warning: '#E9A55B',
      bubbleOutFrom: '#145244',
      bubbleOutTo: '#0D3B31',
      bubbleOutText: '#F3EDE4',
      primaryFrom: '#E5CB9C',
      primaryTo: '#C4A16C',
      onPrimary: '#1A140C',
      glow1: 'rgba(212,180,131,0.14)',
      glow2: 'transparent',
      glow3: 'transparent',
      panel: '#171411',
      shadowColor: '#000000',
    },
    light: {
      bg: '#FBF8F2',
      surface: '#FFFDF9',
      surfaceMuted: '#F6F1E8',
      surfaceStrong: '#EEE7DA',
      border: '#E7DFD1',
      borderStrong: '#958A78',
      text: '#1F1A14',
      textMuted: '#5A5043',
      textSubtle: '#716655',
      accent: '#846530',
      accentHover: '#735829',
      accentSoft: '#F4ECDC',
      onAccent: '#FFFFFF',
      bubbleIn: '#FFFFFF',
      danger: '#B42A1F',
      success: '#1A6E52',
      warning: '#995A0B',
      bubbleOutFrom: '#156B59',
      bubbleOutTo: '#0F5C4C',
      bubbleOutText: '#FBF8F2',
      primaryFrom: '#DEC291',
      primaryTo: '#BC9A62',
      onPrimary: '#1A140C',
      glow1: 'rgba(196,161,108,0.16)',
      glow2: 'transparent',
      glow3: 'transparent',
      panel: '#FFFCF7',
      shadowColor: '#D6CFC7',
    },
  },
};

const aurora: LookDef = {
  name: 'Aurora',
  fonts: { display: 'Sora', text: 'Manrope' },
  displayWeight: 650,
  radii: { sm: 8, md: 14, lg: 20 },
  elevation: {
    1: { y: 4, blur: 16, alpha: 0.32 },
    2: { y: 12, blur: 36, alpha: 0.4 },
    3: { y: 28, blur: 72, alpha: 0.48 },
  },
  glass: true,
  ambient: 'drift',
  modes: {
    dark: {
      ...themes.dark,
      bubbleOutFrom: '#0A8276',
      bubbleOutTo: '#5F62EE',
      bubbleOutText: '#FFFFFF',
      primaryFrom: '#2DD4BF',
      primaryTo: '#818CF8',
      onPrimary: '#06121A',
      glow1: 'rgba(20,184,166,0.55)',
      glow2: 'rgba(124,58,237,0.5)',
      glow3: 'rgba(56,189,248,0.3)',
      panel: 'rgba(255,255,255,0.06)',
      shadowColor: '#000208',
    },
    light: {
      ...themes.light,
      bubbleOutFrom: '#0A8276',
      bubbleOutTo: '#5F62EE',
      bubbleOutText: '#FFFFFF',
      primaryFrom: '#0A8276',
      primaryTo: '#5F62EE',
      onPrimary: '#FFFFFF',
      glow1: 'rgba(20,184,166,0.16)',
      glow2: 'rgba(124,58,237,0.12)',
      glow3: 'rgba(56,189,248,0.14)',
      panel: 'rgba(255,255,255,0.72)',
      shadowColor: '#C3C7CE',
    },
  },
};

const bloom: LookDef = {
  name: 'Bloom',
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  displayWeight: 800,
  radii: { sm: 10, md: 16, lg: 24 },
  elevation: {
    1: { y: 6, blur: 18, alpha: 0.3 },
    2: { y: 14, blur: 40, alpha: 0.36 },
    3: { y: 28, blur: 72, alpha: 0.44 },
  },
  glass: true,
  ambient: 'pulse',
  modes: {
    dark: {
      bg: '#17121F',
      surface: '#201A2B',
      surfaceMuted: '#282034',
      surfaceStrong: '#31283F',
      border: '#362C46',
      borderStrong: '#7A6E92',
      text: '#F5F1FC',
      textMuted: '#C6BCD9',
      textSubtle: '#A399BB',
      accent: '#A58BFF',
      accentHover: '#BFAEFF',
      accentSoft: '#2E2452',
      onAccent: '#160E2E',
      bubbleIn: '#2A2237',
      danger: '#FF7D8C',
      success: '#5AD6A0',
      warning: '#FFC069',
      bubbleOutFrom: '#D6336C',
      bubbleOutTo: '#C84A1A',
      bubbleOutText: '#FFFFFF',
      primaryFrom: '#6D4AFF',
      primaryTo: '#A23EF0',
      onPrimary: '#FFFFFF',
      glow1: 'rgba(255,94,138,0.22)',
      glow2: 'rgba(109,74,255,0.3)',
      glow3: 'transparent',
      panel: 'rgba(32,26,43,0.72)',
      shadowColor: '#05020A',
    },
    light: {
      bg: '#F7F5FC',
      surface: '#FFFFFF',
      surfaceMuted: '#F2EFFA',
      surfaceStrong: '#E9E4F6',
      border: '#E6E0F2',
      borderStrong: '#8D85A6',
      text: '#1D1530',
      textMuted: '#4F4566',
      textSubtle: '#6B6185',
      accent: '#6D4AFF',
      accentHover: '#5934F0',
      accentSoft: '#F4EFFF',
      onAccent: '#FFFFFF',
      bubbleIn: '#FFFFFF',
      danger: '#C5283D',
      success: '#12795A',
      warning: '#A14F00',
      bubbleOutFrom: '#D6336C',
      bubbleOutTo: '#C84A1A',
      bubbleOutText: '#FFFFFF',
      primaryFrom: '#6D4AFF',
      primaryTo: '#A23EF0',
      onPrimary: '#FFFFFF',
      glow1: 'rgba(255,94,138,0.18)',
      glow2: 'rgba(109,74,255,0.14)',
      glow3: 'transparent',
      panel: 'rgba(255,255,255,0.75)',
      shadowColor: '#D0CBEB',
    },
  },
};

export const looks: Record<Look, LookDef> = { velvet, aurora, bloom };

export type PersonToneName =
  'turquoise' | 'emerald' | 'lime' | 'aqua' | 'sky' | 'mint' | 'ocean' | 'glacier';

/** One tone in one theme: avatar fill, initials on that fill, and name text on surfaces. */
export interface PersonToneColors {
  fill: string;
  ink: string;
  name: string;
  /** Initials on the same fill under high contrast (≥ 7:1). */
  hcInk: string;
}

type ToneSet = Record<PersonToneName, { dark: PersonToneColors; light: PersonToneColors }>;

/** Dark: the tone is both fill and name, initials in `darkInk`. Light: pale fill, deep name. */
const toneIn =
  (darkInk: string) =>
  (dark: string, lightFill: string, lightName: string, lightInk = lightName) => ({
    dark: { fill: dark, ink: darkInk, name: dark, hcInk: palette.graphite950 },
    light: { fill: lightFill, ink: lightInk, name: lightName, hcInk: palette.ink },
  });

/**
 * Velvet dark is the other way round: a deep jewel fill with ivory initials, and a
 * softer, warmer name tint (gold, sage, rose) for text on the dark surfaces.
 */
const velvetJewel = (
  fill: string,
  name: string,
  lightFill: string,
  lightName: string,
  lightInk = lightName,
) => ({
  dark: { fill, ink: '#F3EDE4', name, hcInk: '#FFFBF3' },
  light: { fill: lightFill, ink: lightInk, name: lightName, hcInk: palette.ink },
});

const auroraTone = toneIn(palette.graphite950);
const bloomTone = toneIn('#17121F');

/**
 * Personal tones per look (people are the colour). Keys and order match `PERSON_TONES`
 * in `@vybora/core`, which picks one per user id; the key is a slot, so a look may
 * re-tune its hue. Used only for avatar fallbacks, group sender names and mentions,
 * never chrome, buttons or backgrounds.
 *
 * - Aurora: today's set. Departures from the 2026-10-17 spec table, made because a
 *   contrast test failed: lime light name #4D7C0F → #3F6212 (4.42:1 on #EDF2F2); light
 *   ink for turquoise, emerald, aqua and sky is one step darker than the name (the
 *   name colour was 4.28–4.47:1 on its fill).
 * - Velvet: true jewel tones round the wheel (teal, emerald, topaz, aquamarine,
 *   copper, garnet, sapphire, amethyst). Dark: deep fills with ivory initials (and
 *   ivory under high contrast); names in a warm gold/sage/rose tint of each hue.
 * - Bloom: vivid tones (teal, green, pink, sky, tangerine, sunflower, blue, orchid).
 */
export const personTonesByLook: Record<Look, ToneSet> = {
  velvet: {
    turquoise: velvetJewel('#0F5C57', '#8FCFC2', '#CDEDE6', '#0E6B5E', '#0B5A4F'),
    emerald: velvetJewel('#105A41', '#A9D2A2', '#CFEBDB', '#12704A', '#0D5E3E'),
    lime: velvetJewel('#6B440C', '#E0C07C', '#F1E6BE', '#6E5A12', '#5E4C0E'),
    aqua: velvetJewel('#12557A', '#96C5D6', '#D2EAF3', '#146A85', '#105A71'),
    sky: velvetJewel('#7E3518', '#E3AD84', '#F6DEC6', '#94501A', '#7D4415'),
    mint: velvetJewel('#7E1C33', '#E3A2A8', '#F5D9DC', '#A13347', '#8A2B3C'),
    ocean: velvetJewel('#223F96', '#AAB8E8', '#DAE2F8', '#2F50B0', '#284497'),
    glacier: velvetJewel('#562B88', '#C8AEE3', '#E8DCF6', '#6C3FA6', '#5C358F'),
  },
  aurora: {
    turquoise: auroraTone('#2DD4BF', '#99F6E4', '#0F766E', '#115E59'),
    emerald: auroraTone('#34D399', '#A7F3D0', '#047857', '#065F46'),
    lime: auroraTone('#A3E635', '#D9F99D', '#3F6212'),
    aqua: auroraTone('#22D3EE', '#A5F3FC', '#0E7490', '#155E75'),
    sky: auroraTone('#38BDF8', '#BAE6FD', '#0369A1', '#075985'),
    mint: auroraTone('#6EE7B7', '#D1FAE5', '#065F46'),
    ocean: auroraTone('#60A5FA', '#BFDBFE', '#1D4ED8'),
    glacier: auroraTone('#A5B4FC', '#E0E7FF', '#4338CA'),
  },
  bloom: {
    turquoise: bloomTone('#3DDBC4', '#C6F3EA', '#0B7A6C', '#08675B'),
    emerald: bloomTone('#4ADE80', '#CDF5DA', '#15803D', '#116B33'),
    lime: bloomTone('#FF7AA6', '#FFD6E4', '#C8285F', '#A91F4F'),
    aqua: bloomTone('#52C8FF', '#CDEEFF', '#0369A1', '#075985'),
    sky: bloomTone('#FF9F5A', '#FFE0C7', '#B4470B', '#973B08'),
    mint: bloomTone('#FFD25A', '#FFF0BF', '#8A5A00', '#734B00'),
    ocean: bloomTone('#6FA2FF', '#D6E4FF', '#1F55E0', '#1946BD'),
    glacier: bloomTone('#C88BFF', '#EEDCFF', '#8A2BD6', '#7423B5'),
  },
};
