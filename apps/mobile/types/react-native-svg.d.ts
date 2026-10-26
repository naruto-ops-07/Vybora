// phosphor-react-native, which src/components/Icon.tsx deep-imports as source,
// passes a NativeWind `className` to react-native-svg's Svg. react-native-svg
// does not declare that prop, so the dependency's own source fails typecheck.
import 'react-native-svg';

declare module 'react-native-svg' {
  interface SvgProps {
    className?: string;
  }
}
