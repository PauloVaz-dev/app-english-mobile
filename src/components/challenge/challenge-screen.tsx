import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PairBoard, type PairBoardAttempt } from "@/components/game/pair-board";
import {
  challengeBoardRandom,
  createChallengeAttemptId,
  createInstalledChallengePort,
} from "@/composition/installed-challenge";
import {
  CHALLENGE_EXHAUSTED_MESSAGE,
  CHALLENGE_FAILED_MESSAGE,
  CHALLENGE_INSUFFICIENT_MESSAGE,
  CHALLENGE_INTRO,
  CHALLENGE_MIN_TOUCH_TARGET,
  CHALLENGE_OPENING_MESSAGE,
  CHALLENGE_PERSIST_FAILED_MESSAGE,
  CHALLENGE_RESULT_ACTIONS,
  CHALLENGE_RESULT_TITLE,
  CHALLENGE_SCORE_LABEL,
  CHALLENGE_STREAK_LABEL,
  CHALLENGE_TIME_UP_MESSAGE,
  CHALLENGE_WAITING_CARDS,
  ChallengeScreenController,
  challengeBoardDisabled,
  challengeClockView,
  challengeTimeAnnouncement,
  type ChallengeAction,
  type ChallengeResultView,
  type ChallengeRoundState,
  type ChallengeScreenState,
} from "@/lib/presentation/challenge/challenge-screen";
import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";
import { watchInstalledForeground } from "@/time/installed-device-time-zone";

const REDRAW_INTERVAL_MS = 250;
const CARD_BORDER_WIDTH = 1;
const ROUND_GAP = 8;

type RoundState = ChallengeRoundState;

export function ChallengeScreen() {
  const { state, controller } = useChallengeScreen();
  switch (state.kind) {
    case "intro":
      return <ChallengeIntro onStart={() => void controller.start()} />;
    case "opening":
      return <ChallengeMessage message={CHALLENGE_OPENING_MESSAGE} />;
    case "round":
      return <ChallengeRound round={state} controller={controller} />;
    case "timeUp":
      return <ChallengeTimeUp />;
    case "result":
      return <ChallengeResult result={state.result} onPlayAgain={() => void controller.start()} />;
    case "insufficientCatalog":
      return <ChallengeMessage message={CHALLENGE_INSUFFICIENT_MESSAGE} alert />;
    case "failed":
      return <ChallengeFailure onRetry={() => void controller.retry()} />;
  }
}

function useChallengeScreen(): { state: ChallengeScreenState; controller: ChallengeScreenController } {
  const [state, setState] = useState<ChallengeScreenState>({ kind: "intro" });
  const [controller] = useState(
    () =>
      new ChallengeScreenController({
        port: createInstalledChallengePort(),
        now: () => new Date(),
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onChange: setState,
      }),
  );
  useEffect(() => {
    return () => {
      void controller.leave();
    };
  }, [controller]);
  useEffect(() => {
    if (state.kind === "timeUp") {
      AccessibilityInfo.announceForAccessibility(CHALLENGE_TIME_UP_MESSAGE);
    }
  }, [state.kind]);
  return { state, controller };
}

function useRoundClock(round: RoundState, controller: ChallengeScreenController): Date {
  const [now, setNow] = useState(() => new Date());
  const lastSeconds = useRef(challengeClockView(round.deadline, now).seconds);
  const { deadline } = round;
  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const redraw = () => {
      const current = new Date();
      setNow(current);
      const seconds = challengeClockView(deadline, current).seconds;
      const announcement = challengeTimeAnnouncement(lastSeconds.current, seconds);
      lastSeconds.current = seconds;
      if (announcement !== null && seconds > 0) {
        AccessibilityInfo.announceForAccessibility(announcement);
      }
      void controller.refresh();
    };
    const interval = setInterval(redraw, REDRAW_INTERVAL_MS);
    let active = true;
    let stopWatching = () => {};
    void watchInstalledForeground(redraw).then(
      (stop) => {
        if (!active) {
          stop();
          return;
        }
        stopWatching = stop;
      },
      () => undefined,
    );
    return () => {
      active = false;
      clearInterval(interval);
      stopWatching();
    };
  }, [controller, deadline]);
  return now;
}

function ChallengeCanvas({ children }: { children: ReactNode }) {
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

function ChallengeIntro({ onStart }: { onStart: () => void }) {
  return (
    <ChallengeCanvas>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>
          {CHALLENGE_INTRO.title}
        </Text>
        {CHALLENGE_INTRO.lines.map((line) => (
          <Text key={line} style={styles.intro}>
            {line}
          </Text>
        ))}
      </View>
      <View style={styles.card}>
        <PrimaryAction action={CHALLENGE_INTRO.start} onPress={onStart} />
        <HomeAction action={CHALLENGE_INTRO.leave} />
        <Text style={styles.muted}>{CHALLENGE_INTRO.calmerPath}</Text>
      </View>
    </ChallengeCanvas>
  );
}

function ChallengeRound({
  round,
  controller,
}: {
  round: RoundState;
  controller: ChallengeScreenController;
}) {
  const insets = useSafeAreaInsets();
  const now = useRoundClock(round, controller);
  const clock = challengeClockView(round.deadline, now);
  const board = useMemo(
    () => ({
      onReady: () => void controller.cardsReady(),
      // The challenge records no exposure: entering pairs writes nothing.
      onPairsEntered: () => undefined,
      onAttempt: (attempt: PairBoardAttempt) => void controller.attempt(attempt),
    }),
    [controller],
  );
  useEffect(() => {
    if (round.halted) {
      AccessibilityInfo.announceForAccessibility(CHALLENGE_PERSIST_FAILED_MESSAGE);
    }
  }, [round.halted]);
  useEffect(() => {
    if (round.exhausted) {
      AccessibilityInfo.announceForAccessibility(CHALLENGE_EXHAUSTED_MESSAGE);
    }
  }, [round.exhausted]);
  return (
    <View
      style={[
        styles.screen,
        styles.round,
        { paddingTop: insets.top + ROUND_GAP, paddingBottom: insets.bottom + ROUND_GAP },
      ]}
    >
      <StatusBar style="dark" />
      <View style={styles.header}>
        <HomeAction action={CHALLENGE_INTRO.leave} />
        <View accessible accessibilityLabel={clock.accessibilityLabel} style={styles.stat}>
          <Text style={[styles.clock, clock.urgent ? styles.clockUrgent : null]}>{clock.label}</Text>
          {clock.urgentText === null ? null : (
            <Text style={styles.urgentText}>{clock.urgentText}</Text>
          )}
        </View>
        <Stat label={CHALLENGE_SCORE_LABEL} value={round.score} />
        <Stat label={CHALLENGE_STREAK_LABEL} value={round.streak} />
      </View>
      {clock.waiting ? <Text style={styles.muted}>{CHALLENGE_WAITING_CARDS}</Text> : null}
      {round.halted ? <PersistFailure onRetry={() => void controller.retry()} /> : null}
      <View style={styles.boardArea}>
        {round.exhausted ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={CHALLENGE_EXHAUSTED_MESSAGE}
            style={styles.card}
          >
            <Text style={styles.intro}>{CHALLENGE_EXHAUSTED_MESSAGE}</Text>
          </View>
        ) : (
          <PairBoard
            key={round.challengeId}
            words={round.words}
            random={challengeBoardRandom}
            disabled={challengeBoardDisabled(round, now)}
            onReady={board.onReady}
            onPairsEntered={board.onPairsEntered}
            onAttempt={board.onAttempt}
            createAttemptId={createChallengeAttemptId}
          />
        )}
      </View>
    </View>
  );
}

function PersistFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.card}>
      <Text style={styles.intro}>{CHALLENGE_PERSIST_FAILED_MESSAGE}</Text>
      <PrimaryAction action={CHALLENGE_INTRO.retry} onPress={onRetry} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ChallengeTimeUp() {
  return (
    <ChallengeCanvas>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={CHALLENGE_TIME_UP_MESSAGE}
        style={styles.card}
      >
        <Text style={styles.timeUp}>{CHALLENGE_TIME_UP_MESSAGE}</Text>
        <Text style={styles.clock}>0:00</Text>
      </View>
    </ChallengeCanvas>
  );
}

function ChallengeResult({
  result,
  onPlayAgain,
}: {
  result: ChallengeResultView;
  onPlayAgain: () => void;
}) {
  const [playAgain, home] = CHALLENGE_RESULT_ACTIONS;
  return (
    <ChallengeCanvas>
      <Text accessibilityRole="header" style={styles.title}>
        {CHALLENGE_RESULT_TITLE}
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
        {result.recordText === "" ? null : (
          <Text style={result.isNewRecord ? styles.recordNew : styles.muted}>{result.recordText}</Text>
        )}
      </View>
      <View style={styles.actions}>
        {playAgain === undefined ? null : <PrimaryAction action={playAgain} onPress={onPlayAgain} />}
        {home === undefined ? null : <HomeAction action={home} />}
      </View>
    </ChallengeCanvas>
  );
}

function ChallengeMessage({ message, alert = false }: { message: string; alert?: boolean }) {
  return (
    <ChallengeCanvas>
      <Text accessibilityRole={alert ? "alert" : "text"} style={styles.intro}>
        {message}
      </Text>
      {alert ? <HomeAction action={CHALLENGE_INTRO.leave} /> : null}
    </ChallengeCanvas>
  );
}

function ChallengeFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <ChallengeCanvas>
      <Text accessibilityRole="alert" style={styles.intro}>
        {CHALLENGE_FAILED_MESSAGE}
      </Text>
      <PrimaryAction action={CHALLENGE_INTRO.retry} onPress={onRetry} />
      <HomeAction action={CHALLENGE_INTRO.leave} />
    </ChallengeCanvas>
  );
}

function PrimaryAction({ action, onPress }: { action: ChallengeAction; onPress: () => void }) {
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

function HomeAction({ action }: { action: ChallengeAction }) {
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: HOME_ENTRY_METRICS.actionGap,
    padding: HOME_ENTRY_METRICS.actionGap,
    borderRadius: HOME_ENTRY_METRICS.cardRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  stat: {
    minWidth: CHALLENGE_MIN_TOUCH_TARGET,
    minHeight: CHALLENGE_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: HOME_ENTRY_METRICS.titleSize,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  clockUrgent: {
    color: HOME_ENTRY_PALETTE.emphasis,
  },
  urgentText: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
    fontWeight: "600",
  },
  round: {
    gap: ROUND_GAP,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
  },
  boardArea: {
    flex: 1,
  },
  timeUp: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "700",
  },
  resultRow: {
    minHeight: CHALLENGE_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recordNew: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.introSize,
    fontWeight: "700",
  },
  actions: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  primaryTarget: {
    minHeight: CHALLENGE_MIN_TOUCH_TARGET,
    minWidth: CHALLENGE_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    backgroundColor: HOME_ENTRY_PALETTE.primary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  secondaryTarget: {
    minHeight: CHALLENGE_MIN_TOUCH_TARGET,
    minWidth: CHALLENGE_MIN_TOUCH_TARGET,
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
