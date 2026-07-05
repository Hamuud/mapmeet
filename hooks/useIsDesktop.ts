import { useWindowDimensions } from 'react-native';

/** Web-only breakpoint hook. Anything ≥ 900 px is the desktop layout
 *  (left rail + right zoom stack); below that we fall back to the
 *  original mobile stack. Native platforms always return false — the
 *  desktop layout is web-exclusive. */
export function useIsDesktop(threshold = 900): boolean {
  const { width } = useWindowDimensions();
  return width >= threshold;
}
