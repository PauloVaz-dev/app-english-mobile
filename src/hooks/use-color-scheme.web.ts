import { useSyncExternalStore } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

const subscribeToNothing = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * The server snapshot is `false` and the client snapshot is `true`, so the first client render
 * matches the static HTML ("light") and the real scheme follows right after hydration.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return "light";
}
