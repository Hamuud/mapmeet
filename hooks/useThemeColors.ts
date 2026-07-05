import { useColorScheme } from 'react-native';

/** Resolves the semantic palette used by non-className styles (map tiles,
 *  imperative overlays, MapLibre CSS, etc). Prefer NativeWind classes
 *  everywhere else. */
export function useThemeColors() {
  const scheme = useColorScheme() ?? 'light';
  const isDark = scheme === 'dark';
  return {
    scheme,
    isDark,
    surface:  isDark ? '#0E0E10' : '#F6F4EE',
    panel:    isDark ? '#16161C' : '#FDFCF8',
    elevated: isDark ? '#1C1C24' : '#EDEAE1',
    border:   isDark ? '#2A2A32' : '#E4E1D8',
    text:     isDark ? '#F5F5F2' : '#0E0E10',
    muted:    isDark ? '#8A8A94' : '#8B8880',
    brand:    '#4B5FE0', // indigo primary
    accent:   '#E68A5E', // coral — reserved for create CTA
  };
}
