import {
  highContrastThemes,
  iconSizes,
  radii,
  spacing,
  themes,
  type ThemeTokens,
} from '@vybora/config';
import { useColorScheme } from 'react-native';
import { useA11y } from './a11y';

export function useTheme(): ThemeTokens & { dark: boolean } {
  const scheme = useColorScheme();
  const { prefs } = useA11y();
  const dark = scheme === 'dark';
  const set = prefs.highContrast ? highContrastThemes : themes;
  return { ...(dark ? set.dark : set.light), dark };
}

export { iconSizes, radii, spacing };

/** Loaded in app/_layout.tsx via expo-font. React Native needs one family per weight. */
export const font = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const fonts = {
  display: { fontFamily: font.bold, letterSpacing: -0.4 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  mono: { fontFamily: font.mono, fontSize: 11, lineHeight: 16 },
};
