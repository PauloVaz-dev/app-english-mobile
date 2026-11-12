import "@/global.css";

import { PortalHost } from "@rn-primitives/portal";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colorScheme as nativewindColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";

import { NAV_THEME } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.documentElement.classList.toggle("dark", scheme === "dark");
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  return (
    <ThemeProvider value={NAV_THEME[scheme]}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <PortalHost />
    </ThemeProvider>
  );
}
