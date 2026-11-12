import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useTheme } from "@/hooks/use-theme";

const MIN_TOUCH_TARGET = 44;
const CONTENT_GAP = 24;
const SCREEN_PADDING = 24;
const TARGET_RADIUS = 12;
const TARGET_PADDING_HORIZONTAL = 16;
const TARGET_PADDING_VERTICAL = 12;

const UNAVAILABLE_ACTIVITY_MESSAGE = "Esta atividade ainda não está disponível.";
const RETURN_LABEL = "Voltar";
const RETURN_NAME = "Voltar para o resumo do dia";

export function UnavailableActivity({ title }: { title: string }) {
  const theme = useTheme();
  const announcement = `${title}. ${UNAVAILABLE_ACTIVITY_MESSAGE}`;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      <Text
        accessibilityRole="text"
        accessibilityLabel={announcement}
        style={{ color: theme.text }}
      >
        {UNAVAILABLE_ACTIVITY_MESSAGE}
      </Text>
      <Link href="/" dismissTo asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={RETURN_NAME}
          style={StyleSheet.flatten([
            styles.target,
            styles.secondaryTarget,
            { borderColor: theme.text, backgroundColor: theme.background },
          ])}
        >
          <Text style={{ color: theme.text }}>{RETURN_LABEL}</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: SCREEN_PADDING,
    gap: CONTENT_GAP,
  },
  title: {
    fontWeight: "600",
  },
  target: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: TARGET_PADDING_HORIZONTAL,
    paddingVertical: TARGET_PADDING_VERTICAL,
    borderRadius: TARGET_RADIUS,
    borderCurve: "continuous",
  },
  secondaryTarget: {
    borderWidth: 1,
  },
});
