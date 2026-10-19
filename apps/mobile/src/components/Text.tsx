import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { useA11y } from '@/lib/a11y';
import type { LookFonts } from '@/lib/fonts';
import { useFonts } from '@/lib/theme';

const WEIGHT_ROLE: Record<string, keyof LookFonts> = {
  '100': 'regular',
  '200': 'regular',
  '300': 'regular',
  '400': 'regular',
  normal: 'regular',
  '500': 'medium',
  '600': 'semibold',
  '700': 'bold',
  '800': 'bold',
  '900': 'bold',
  bold: 'bold',
};

/**
 * Map fontWeight → the active look's file for that weight (custom fonts ignore
 * fontWeight). `display` picks the look's display face (Fraunces, Sora or Jakarta).
 */
function withFamily(
  style: TextProps['style'],
  fonts: LookFonts,
  mono?: boolean,
  display?: boolean,
) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const weight = String(flat.fontWeight ?? '400');
  const heavy = Number(weight) >= 700 || weight === 'bold';
  const fontFamily = mono
    ? Number(weight) >= 500
      ? fonts.monoMedium
      : fonts.mono
    : display
      ? heavy
        ? fonts.displayBold
        : fonts.display
      : fonts[WEIGHT_ROLE[weight] ?? 'regular'];
  return { ...flat, fontFamily, fontWeight: undefined };
}

/** Apply the user's message text scale to fontSize/lineHeight (opt-in via `scale`). */
function withScale(
  flat: ReturnType<typeof withFamily>,
  scale: boolean | undefined,
  factor: number,
) {
  if (!scale || factor === 1) return flat;
  return {
    ...flat,
    fontSize: flat.fontSize ? flat.fontSize * factor : undefined,
    lineHeight: flat.lineHeight ? flat.lineHeight * factor : undefined,
  };
}

/** Drop-in Text in the active look's text face (`display`: its display face; `mono`: Plex Mono). */
export const Text = forwardRef<
  RNText,
  TextProps & { mono?: boolean; display?: boolean; scale?: boolean }
>(function Text({ style, mono, display, scale, ...rest }, ref) {
  const { textScale } = useA11y();
  const fonts = useFonts();
  return (
    <RNText
      ref={ref}
      {...rest}
      style={withScale(withFamily(style, fonts, mono, display), scale, textScale)}
    />
  );
});

/** Drop-in TextInput in the active look's text face. */
export const TextInput = forwardRef<RNTextInput, TextInputProps & { scale?: boolean }>(
  function TextInput({ style, scale, ...rest }, ref) {
    const { textScale } = useA11y();
    const fonts = useFonts();
    return (
      <RNTextInput
        ref={ref}
        {...rest}
        style={withScale(withFamily(style, fonts), scale, textScale)}
      />
    );
  },
);
