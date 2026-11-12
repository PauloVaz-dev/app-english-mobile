import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";

import { createInstalledHomeEntry } from "@/composition/installed-home";
import {
  HOME_ENTRY_METRICS,
  HOME_ENTRY_PALETTE,
  homeEntryAnnouncement,
  homeEntryLayout,
  type HomeActionEmphasis,
  type HomeEntryAction,
  type HomeEntryLayout,
} from "@/lib/presentation/home/home-entry-layout";
import type { HomeReviewSummaryView } from "@/lib/presentation/review/home-review-copy";

const HOME_LOADING_MESSAGE = "Abrindo o resumo do dia.";
const HOME_OPEN_ERROR_MESSAGE = "Não foi possível abrir o resumo do dia.";
const HOME_RETRY_LABEL = "Tentar de novo";
const FIRST_ATTEMPT = 0;
const CARD_BORDER_WIDTH = 1;
const ACTION_BORDER_WIDTH = 1;

type HomeStatus =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; view: HomeReviewSummaryView };

export function HomeEntryScreen() {
  const { status, retry } = useHomeEntry();
  if (status.kind === "failed") {
    return <HomeFailure onRetry={retry} />;
  }
  if (status.kind === "loading") {
    return <HomeLoading />;
  }
  return <HomeReady view={status.view} />;
}

function useHomeEntry(): { status: HomeStatus; retry: () => void } {
  const { load, listen } = useMemo(() => createInstalledHomeEntry(), []);
  const [status, setStatus] = useState<HomeStatus>({ kind: "loading" });
  const attempt = useRef(FIRST_ATTEMPT);
  const retry = useCallback(() => {
    const currentAttempt = attempt.current + 1;
    attempt.current = currentAttempt;
    setStatus((currentStatus) => keepReadyOrLoad(currentStatus));
    void load().then(
      (view) => {
        publishHomeStatus(attempt, currentAttempt, setStatus, { kind: "ready", view });
      },
      () => {
        publishHomeStatus(attempt, currentAttempt, setStatus, { kind: "failed" });
      },
    );
  }, [load]);
  useHomeForeground(listen, retry, attempt);
  return { status, retry };
}

function useHomeForeground(
  listen: (reload: () => void) => Promise<() => void>,
  retry: () => void,
  attempt: { current: number },
): void {
  useEffect(() => {
    let active = true;
    let stopListening = () => {};
    void listen(() => {
      if (!active) {
        return;
      }
      retry();
    }).then(
      (stop) => {
        if (!active) {
          stop();
          return;
        }
        stopListening = stop;
      },
      () => {
        return undefined;
      },
    );
    return () => {
      active = false;
      attempt.current += 1;
      stopListening();
    };
  }, [attempt, listen, retry]);
}

function keepReadyOrLoad(status: HomeStatus): HomeStatus {
  if (status.kind === "ready") {
    return status;
  }
  return { kind: "loading" };
}

function publishHomeStatus(
  attempt: { current: number },
  currentAttempt: number,
  setStatus: (status: HomeStatus) => void,
  status: HomeStatus,
): void {
  if (attempt.current !== currentAttempt) {
    return;
  }
  setStatus(status);
}

function HomeLoading() {
  return (
    <HomeCanvas>
      <Text accessibilityRole="text" style={styles.inkText}>
        {HOME_LOADING_MESSAGE}
      </Text>
    </HomeCanvas>
  );
}

function HomeFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <HomeCanvas>
      <View accessible accessibilityRole="alert" accessibilityLabel={HOME_OPEN_ERROR_MESSAGE}>
        <Text style={styles.inkText}>{HOME_OPEN_ERROR_MESSAGE}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HOME_RETRY_LABEL}
        onPress={onRetry}
        style={styles.primaryTarget}
      >
        <Text style={styles.primaryLabel}>{HOME_RETRY_LABEL}</Text>
      </Pressable>
    </HomeCanvas>
  );
}

function HomeReady({ view }: { view: HomeReviewSummaryView }) {
  const layout = homeEntryLayout(view);
  return (
    <HomeCanvas>
      <HomeHero layout={layout} />
      <ReviewCard layout={layout} announcement={homeEntryAnnouncement(view)} />
    </HomeCanvas>
  );
}

function HomeCanvas({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function HomeHero({ layout }: { layout: HomeEntryLayout }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.badge}>{layout.badge}</Text>
      <Text accessibilityRole="header" style={styles.titleLead}>
        {layout.titleLead}
      </Text>
      <Text style={styles.titleEmphasis}>{layout.titleEmphasis}</Text>
      <Text style={styles.intro}>{layout.intro}</Text>
    </View>
  );
}

function ReviewCard({ layout, announcement }: { layout: HomeEntryLayout; announcement: string }) {
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={announcement} style={styles.card}>
      <Text style={styles.cardLabel}>{layout.cardLabel}</Text>
      <Text style={styles.cardSummary}>{layout.cardSummary}</Text>
      {layout.cardDetail === null ? null : <Text style={styles.cardDetail}>{layout.cardDetail}</Text>}
      <View style={styles.actions}>
        {layout.actions.map((action) => (
          <EntryAction key={action.href} action={action} />
        ))}
      </View>
    </View>
  );
}

function EntryAction({ action }: { action: HomeEntryAction }) {
  return (
    <Link href={action.href} asChild>
      <Pressable
        accessibilityRole={action.emphasis === "primary" ? "button" : "link"}
        accessibilityLabel={action.label}
        style={actionTargetStyle(action.emphasis)}
      >
        <Text style={actionLabelStyle(action.emphasis)}>{action.label}</Text>
      </Pressable>
    </Link>
  );
}

function actionTargetStyle(emphasis: HomeActionEmphasis): ViewStyle {
  if (emphasis === "primary") {
    return styles.primaryTarget;
  }
  return styles.secondaryTarget;
}

function actionLabelStyle(emphasis: HomeActionEmphasis): TextStyle {
  if (emphasis === "primary") {
    return styles.primaryLabel;
  }
  return styles.secondaryLabel;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: HOME_ENTRY_PALETTE.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: HOME_ENTRY_METRICS.screenPadding,
    gap: HOME_ENTRY_METRICS.sectionGap,
  },
  hero: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  badge: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.badgeSize,
    fontWeight: "600",
    letterSpacing: HOME_ENTRY_METRICS.badgeLetterSpacing,
    textTransform: "uppercase",
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  titleLead: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.titleSize,
    fontWeight: "700",
    lineHeight: HOME_ENTRY_METRICS.titleLineHeight,
  },
  titleEmphasis: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.titleSize,
    fontWeight: "700",
    lineHeight: HOME_ENTRY_METRICS.titleLineHeight,
  },
  intro: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  card: {
    gap: HOME_ENTRY_METRICS.actionGap,
    padding: HOME_ENTRY_METRICS.cardPadding,
    borderRadius: HOME_ENTRY_METRICS.cardRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  cardLabel: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  cardSummary: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "600",
  },
  cardDetail: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  actions: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  inkText: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  primaryTarget: {
    minHeight: HOME_ENTRY_METRICS.minTouchTarget,
    minWidth: HOME_ENTRY_METRICS.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    backgroundColor: HOME_ENTRY_PALETTE.primary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  secondaryTarget: {
    minHeight: HOME_ENTRY_METRICS.minTouchTarget,
    minWidth: HOME_ENTRY_METRICS.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: ACTION_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.secondaryBorder,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  primaryLabel: {
    color: HOME_ENTRY_PALETTE.primaryLabel,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  secondaryLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
});
