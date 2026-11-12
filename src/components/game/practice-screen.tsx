import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PairBoard } from "@/components/game/pair-board";
import {
  createInstalledPracticePort,
  createPracticeAttemptId,
  practiceBoardRandom,
} from "@/composition/installed-practice";
import {
  PRACTICE_INSUFFICIENT_MESSAGE,
  PRACTICE_INTRO,
  PRACTICE_MIN_TOUCH_TARGET,
  PRACTICE_OPENING_MESSAGE,
  PRACTICE_PERSIST_FAILED_MESSAGE,
  PRACTICE_RESULT_ACTIONS,
  PRACTICE_RESULT_FAILED_MESSAGE,
  PRACTICE_START_FAILED_MESSAGE,
  PracticeScreenController,
  practiceHeaderView,
  type PracticeAction,
  type PracticeBoardAttempt,
  type PracticeMatchView,
  type PracticeResultSection,
  type PracticeResultView,
  type PracticeRetry,
  type PracticeScreenState,
} from "@/lib/presentation/game/practice-screen";
import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";

const CLOCK_REDRAW_MS = 250;
const CARD_BORDER_WIDTH = 1;
const MATCH_GAP = 8;
const CLOCK_SIZE = 28;

export function PracticeScreen() {
  const { state, controller } = usePracticeScreen();
  switch (state.kind) {
    case "intro":
      return <PracticeIntro onStart={() => void controller.start()} />;
    case "opening":
      return <PracticeMessage message={PRACTICE_OPENING_MESSAGE} />;
    case "match":
      return <PracticeMatch match={state.match} controller={controller} />;
    case "result":
      return <PracticeResult result={state.result} onPlayAgain={() => void controller.start()} />;
    case "insufficientCatalog":
      return <PracticeMessage message={PRACTICE_INSUFFICIENT_MESSAGE} alert />;
    case "failed":
      return <PracticeFailure retry={state.retry} onRetry={() => void controller.retry()} />;
  }
}

function usePracticeScreen(): { state: PracticeScreenState; controller: PracticeScreenController } {
  const [state, setState] = useState<PracticeScreenState>({ kind: "intro" });
  const [controller] = useState(
    () =>
      new PracticeScreenController({
        port: createInstalledPracticePort(),
        now: () => new Date(),
        onChange: setState,
      }),
  );
  useEffect(() => {
    return () => {
      void controller.leave();
    };
  }, [controller]);
  return { state, controller };
}

function useMatchClock(match: PracticeMatchView): Date {
  const [now, setNow] = useState(() => new Date());
  const running = match.stoppedAt === null;
  useEffect(() => {
    if (!running) {
      return;
    }
    const interval = setInterval(() => setNow(new Date()), CLOCK_REDRAW_MS);
    return () => clearInterval(interval);
  }, [running]);
  return now;
}

function PracticeCanvas({ children }: { children: ReactNode }) {
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

function PracticeIntro({ onStart }: { onStart: () => void }) {
  return (
    <PracticeCanvas>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>
          {PRACTICE_INTRO.title}
        </Text>
        {PRACTICE_INTRO.lines.map((line) => (
          <Text key={line} style={styles.intro}>
            {line}
          </Text>
        ))}
      </View>
      <View style={styles.card}>
        <PrimaryAction action={PRACTICE_INTRO.start} onPress={onStart} />
        <HomeAction action={PRACTICE_INTRO.leave} />
      </View>
    </PracticeCanvas>
  );
}

function PracticeMatch({
  match,
  controller,
}: {
  match: PracticeMatchView;
  controller: PracticeScreenController;
}) {
  const insets = useSafeAreaInsets();
  const now = useMatchClock(match);
  const header = practiceHeaderView(match, now);
  const board = useMemo(
    () => ({
      onReady: (wordIds: readonly string[]) => void controller.cardsReady(wordIds),
      onPairsEntered: (wordIds: readonly string[]) => void controller.pairsEntered(wordIds),
      onAttempt: (attempt: PracticeBoardAttempt) => void controller.attempt(attempt),
    }),
    [controller],
  );
  useEffect(() => {
    if (match.halted) {
      AccessibilityInfo.announceForAccessibility(PRACTICE_PERSIST_FAILED_MESSAGE);
    }
  }, [match.halted]);
  return (
    <View
      style={[
        styles.screen,
        styles.match,
        { paddingTop: insets.top + MATCH_GAP, paddingBottom: insets.bottom + MATCH_GAP },
      ]}
    >
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <HomeAction action={PRACTICE_INTRO.leave} />
          <Text accessibilityLabel={header.clock.accessibilityLabel} style={styles.clock}>
            {header.clock.label}
          </Text>
        </View>
        <View style={styles.headerRow}>
          {header.stats.map((stat) => (
            <View
              key={stat.label}
              accessible
              accessibilityLabel={stat.accessibilityLabel}
              style={styles.stat}
            >
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {match.halted ? <PersistFailure onRetry={() => void controller.retry()} /> : null}
      <View style={styles.boardArea}>
        <PairBoard
          key={match.sessionId}
          words={match.words}
          random={practiceBoardRandom}
          disabled={header.boardDisabled}
          onReady={board.onReady}
          onPairsEntered={board.onPairsEntered}
          onAttempt={board.onAttempt}
          createAttemptId={createPracticeAttemptId}
        />
      </View>
    </View>
  );
}

function PersistFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.card, styles.alertCard]}
    >
      <Text style={styles.alertText}>{PRACTICE_PERSIST_FAILED_MESSAGE}</Text>
      <PrimaryAction action={PRACTICE_INTRO.retry} onPress={onRetry} />
    </View>
  );
}

function PracticeResult({
  result,
  onPlayAgain,
}: {
  result: PracticeResultView;
  onPlayAgain: () => void;
}) {
  const [playAgain, home] = PRACTICE_RESULT_ACTIONS;
  return (
    <PracticeCanvas>
      <Text accessibilityRole="header" style={styles.title}>
        {result.title}
      </Text>
      <View style={styles.card}>
        {result.rows.map((row) => (
          <View
            key={row.label}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}`}
            style={styles.resultRow}
          >
            <Text style={styles.statLabel}>{row.label}</Text>
            <Text style={styles.statValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      {result.sections.map((section) => (
        <ResultSection key={section.title} section={section} />
      ))}
      <View style={styles.actions}>
        {playAgain === undefined ? null : (
          <PrimaryAction action={playAgain} onPress={onPlayAgain} />
        )}
        {home === undefined ? null : <HomeAction action={home} />}
      </View>
    </PracticeCanvas>
  );
}

function ResultSection({ section }: { section: PracticeResultSection }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {section.title}
      </Text>
      {section.items.length === 0 ? (
        <Text style={[styles.card, styles.muted]}>{section.emptyText}</Text>
      ) : (
        section.items.map((item) => (
          <View
            key={item.key}
            accessible
            accessibilityLabel={item.accessibilityLabel}
            style={styles.card}
          >
            <Text style={styles.wordTitle}>
              {item.english}
              <Text style={styles.muted}>{" — "}</Text>
              {item.portuguese}
            </Text>
            <Text style={styles.muted}>{item.details.join(" · ")}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function PracticeMessage({ message, alert = false }: { message: string; alert?: boolean }) {
  return (
    <PracticeCanvas>
      <Text accessibilityRole={alert ? "alert" : "text"} style={styles.intro}>
        {message}
      </Text>
      {alert ? <HomeAction action={PRACTICE_INTRO.leave} /> : null}
    </PracticeCanvas>
  );
}

function PracticeFailure({ retry, onRetry }: { retry: PracticeRetry; onRetry: () => void }) {
  const message =
    retry === "start" ? PRACTICE_START_FAILED_MESSAGE : PRACTICE_RESULT_FAILED_MESSAGE;
  return (
    <PracticeCanvas>
      <Text accessibilityRole="alert" style={styles.intro}>
        {message}
      </Text>
      <PrimaryAction action={PRACTICE_INTRO.retry} onPress={onRetry} />
      <HomeAction action={PRACTICE_INTRO.leave} />
    </PracticeCanvas>
  );
}

function PrimaryAction({ action, onPress }: { action: PracticeAction; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      onPress={onPress}
      style={styles.primaryTarget}
    >
      <Text style={styles.primaryLabel}>{action.label}</Text>
    </Pressable>
  );
}

function HomeAction({ action }: { action: PracticeAction }) {
  return (
    <Link href="/" dismissTo asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.accessibilityLabel}
        style={styles.secondaryTarget}
      >
        <Text style={styles.secondaryLabel}>{action.label}</Text>
      </Pressable>
    </Link>
  );
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
  match: {
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    gap: MATCH_GAP,
  },
  hero: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  title: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.titleSize,
    fontWeight: "700",
    lineHeight: HOME_ENTRY_METRICS.titleLineHeight,
  },
  intro: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  muted: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
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
  alertCard: {
    borderColor: HOME_ENTRY_PALETTE.emphasis,
  },
  alertText: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "600",
  },
  header: {
    gap: MATCH_GAP,
    padding: MATCH_GAP,
    borderRadius: HOME_ENTRY_METRICS.cardRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: MATCH_GAP,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  clock: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: CLOCK_SIZE,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  boardArea: {
    flex: 1,
  },
  resultRow: {
    minHeight: PRACTICE_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  section: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  sectionTitle: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "700",
  },
  wordTitle: {
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "700",
  },
  actions: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  primaryTarget: {
    minHeight: PRACTICE_MIN_TOUCH_TARGET,
    minWidth: PRACTICE_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    backgroundColor: HOME_ENTRY_PALETTE.primary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  secondaryTarget: {
    minHeight: PRACTICE_MIN_TOUCH_TARGET,
    minWidth: PRACTICE_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
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
