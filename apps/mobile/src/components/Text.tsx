import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { font } from '@/lib/theme';

const WEIGHT_FAMILY: Record<string, string> = {
  '100': font.regular,
  '200': font.regular,
  '300': font.regular,
  '400': font.regular,
  normal: font.regular,
  '500': font.medium,
  '600': font.semibold,
  '700': font.bold,
  '800': font.bold,
  '900': font.bold,
  bold: font.bold,
};

/** Map fontWeight → the matching bundled font file (custom fonts ignore fontWeight). */
function withFamily(style: TextProps['style'], mono?: boolean) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const weight = String(flat.fontWeight ?? '400');
  const fontFamily = mono
    ? Number(weight) >= 500
      ? font.monoMedium
      : font.mono
    : (WEIGHT_FAMILY[weight] ?? font.regular);
  return { ...flat, fontFamily, fontWeight: undefined };
}

/** Drop-in replacement for React Native's Text that uses Archivo (or IBM Plex Mono). */
export const Text = forwardRef<RNText, TextProps & { mono?: boolean }>(function Text(
  { style, mono, ...rest },
  ref,
) {
  return <RNText ref={ref} {...rest} style={withFamily(style, mono)} />;
});

/** Drop-in TextInput that uses Archivo. */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, ...rest },
  ref,
) {
  return <RNTextInput ref={ref} {...rest} style={withFamily(style)} />;
});
