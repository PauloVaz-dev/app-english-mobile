import "@/global.css";

import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  NunitoSans_400Regular,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from "@expo-google-fonts/nunito-sans";
import { PortalHost } from "@rn-primitives/portal";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { colorScheme as nativewindColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";

import { NAV_THEME } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  // A font that fails to load falls back to the system font; the app still opens.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    NunitoSans_400Regular,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
  });
  const fontsSettled = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontsSettled) {
      SplashScreen.hideAsync();
    }
  }, [fontsSettled]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.documentElement.classList.toggle("dark", scheme === "dark");
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  if (!fontsSettled) {
    return null;
  }

  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <PortalHost />
    </ThemeProvider>
  );
}
