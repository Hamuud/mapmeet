import { useColorScheme } from 'nativewind';

/** Returns the "ink" color for UI chrome icons in the current theme —
 *  dark on light, light on dark. Everything that used to hardcode
 *  `#0E0E10` should read this instead so it inverts when the user
 *  switches Appearance in Settings. */
export function useIconColor(): string {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? '#F5F5F2' : '#0E0E10';
}

/** Softer, secondary shade — for icons that shouldn't shout. Used
 *  where the old palette went to `#8B8880` (muted). */
export function useMutedIconColor(): string {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? '#8A8A94' : '#8B8880';
}
