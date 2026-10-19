/**
 * Each look's typefaces, as the family names expo-font registers. React Native needs one
 * family per weight (custom fonts ignore `fontWeight`), so every role names its file.
 * Files are imported per weight, so only these weights are bundled.
 *
 * - Velvet: Fraunces (display) + DM Sans (text).
 * - Aurora: Sora (display) + Manrope (text).
 * - Bloom: Plus Jakarta Sans for both.
 * - IBM Plex Mono stays for data only (timestamps, counts, codes) in every look.
 */
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import type { Look } from '@vybora/config';
import * as Font from 'expo-font';

export interface LookFonts {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  /** Titles, names and big numbers. */
  display: string;
  /** The heaviest display cut (large titles). */
  displayBold: string;
  /** Data only: timestamps, counts, codes. Same in every look. */
  mono: string;
  monoMedium: string;
}

const MONO_FILES = { IBMPlexMono_400Regular, IBMPlexMono_500Medium };
const MONO = { mono: 'IBMPlexMono_400Regular', monoMedium: 'IBMPlexMono_500Medium' } as const;

const FILES: Record<Look, Record<string, number>> = {
  velvet: {
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  },
  aurora: {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
  },
  bloom: {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  },
};

export const lookFonts: Record<Look, LookFonts> = {
  velvet: {
    regular: 'DMSans_400Regular',
    medium: 'DMSans_500Medium',
    semibold: 'DMSans_600SemiBold',
    bold: 'DMSans_700Bold',
    display: 'Fraunces_600SemiBold',
    displayBold: 'Fraunces_700Bold',
    ...MONO,
  },
  aurora: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    // displayWeight 650: Sora ships 600 and 700 cuts; 600 keeps titles calm, 700 is the bold.
    display: 'Sora_600SemiBold',
    displayBold: 'Sora_700Bold',
    ...MONO,
  },
  bloom: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    // displayWeight 800: Bloom's titles are the ExtraBold cut.
    display: 'PlusJakartaSans_800ExtraBold',
    displayBold: 'PlusJakartaSans_800ExtraBold',
    ...MONO,
  },
};

/** Every font file a look uses, plus mono, keyed by registered family name. */
export function lookFontFiles(look: Look): Record<string, number> {
  return { ...FILES[look], ...MONO_FILES };
}

/** True once every face of `look` is registered (always true where expo-font can't tell). */
export function lookFontsLoaded(look: Look): boolean {
  return Object.keys(lookFontFiles(look)).every((name) => Font.isLoaded(name));
}

/**
 * Registers a look's faces. Never rejects: on failure the system font is used and text
 * stays readable, so a font problem can never keep the splash screen up.
 */
export async function loadLookFonts(look: Look): Promise<void> {
  try {
    await Font.loadAsync(lookFontFiles(look));
  } catch {
    // System font fallback.
  }
}
