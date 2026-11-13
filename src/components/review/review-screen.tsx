import { StatusBar } from "expo-status-bar";
import { Link } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LogOut } from "lucide-react-native";

import { PairBoard } from "@/components/game/pair-board";
import { TypingCard } from "@/components/review/typing-card";
import { createInstalledReviewPort, createReviewAttemptId, reviewBoardRandom } from "@/composition/installed-review";
import {
  REVIEW_HOME_ACTION,
  REVIEW_LEAVE_ACTION,
  REVIEW_MIN_TOUCH_TARGET,
  REVIEW_OPENING_MESSAGE,
  REVIEW_PERSIST_FAILED_MESSAGE,
  REVIEW_RETRY_ACTION,
  ReviewScreenController,
  type ReviewAction,
  type ReviewLink,
  type ReviewMatchingView,
  type ReviewProgressView,
  type ReviewResultView,
  type ReviewScreenState,
  type ReviewTypingView,
} from "@/lib/presentation/review/review-screen";
import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";
import { PAR_A_PAR_COLORS, PAR_A_PAR_FONTS, PAR_A_PAR_METRICS } from "@/lib/presentation/theme/par-a-par-theme";

const CARD_BORDER_WIDTH = 1;
const STAGE_GAP = 8;
const ICON_SIZE = 20;

export function ReviewScreen() {
  const { state, controller } = useReviewScreen();
  switch (state.kind) {
    case "opening":
      return <ReviewMessage message={REVIEW_OPENING_MESSAGE} />;
    case "typing":
      return <ReviewTyping typing={state.typing} controller={controller} />;
    case "matching":
      return <ReviewMatching session={state.matching} controller={controller} />;
    case "result":
      return <ReviewResult result={state.result} onContinue={() => void controller.start()} />;
    case "nothing":
      return (
        <ReviewNothing
          message={state.message}
          practice={state.practice}
          home={state.home}
        />
      );
    case "failed":
      return <ReviewFailed message={state.message} onRetry={() => void controller.retry()} />;
  }
}

function useReviewScreen(): { state: ReviewScreenState; controller: ReviewScreenController } {
  const [state, setState] = useState<ReviewScreenState>({ kind: "opening" });
  const [controller] = useState(
    () =>
      new ReviewScreenController({
        port: createInstalledReviewPort(),
        now: () => new Date(),
        createAttemptId: createReviewAttemptId,
        onChange: setState,
      }),
  );
  useEffect(() => {
    void controller.start();
    return () => {
      void controller.leave();
    };
  }, [controller]);
  return { state, controller };
}

function ReviewCanvas({ children }: { children: ReactNode }) {
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

function ReviewMessage({ message }: { message: string }) {
  return (
    <ReviewCanvas>
      <Text accessibilityRole="text" style={styles.intro}>
        {message}
      </Text>
      <HomeLink action={REVIEW_HOME_ACTION} />
    </ReviewCanvas>
  );
}

function ReviewTyping({
  typing,
  controller,
}: {
  typing: ReviewTypingView;
  controller: ReviewScreenController;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (typing.failureMessage !== null) {
      AccessibilityInfo.announceForAccessibility(typing.failureMessage);
    }
  }, [typing.failureMessage]);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + STAGE_GAP }]}>
      <StatusBar style="dark" />
      <View style={styles.stageHeader}>
        <ProgressHeader progress={typing.progress} />
        <LeaveLink />
      </View>
      {typing.halted ? (
        <PersistFailure
          message={typing.failureMessage ?? REVIEW_PERSIST_FAILED_MESSAGE}
          onRetry={() => void controller.retry()}
        />
      ) : null}
      <TypingCard
        key={`${typing.prompt.wordId}:${typing.prompt.reinforcement ? "again" : "first"}`}
        prompt={typing.prompt}
        result={typing.result}
        onSubmit={(submission) => void controller.submitTyping(submission)}
        onContinue={() => void controller.advance()}
      />
    </View>
  );
}

function ReviewMatching({
  session,
  controller,
}: {
  session: ReviewMatchingView;
  controller: ReviewScreenController;
}) {
  const insets = useSafeAreaInsets();
  const board = useMemo(
    () => ({
      onReady: (wordIds: readonly string[]) => void controller.cardsReady(wordIds),
      onPairsEntered: (wordIds: readonly string[]) => void controller.pairsEntered(wordIds),
      onAttempt: (attempt: Parameters<ReviewScreenController["attempt"]>[0]) =>
        void controller.attempt(attempt),
    }),
    [controller],
  );
  useEffect(() => {
    if (session.failureMessage !== null) {
      AccessibilityInfo.announceForAccessibility(session.failureMessage);
    }
  }, [session.failureMessage]);
  return (
    <View
      style={[
        styles.screen,
        styles.matching,
        { paddingTop: insets.top + STAGE_GAP, paddingBottom: insets.bottom + STAGE_GAP },
      ]}
    >
      <StatusBar style="dark" />
      <View style={styles.stageHeader}>
        <ProgressHeader progress={session.progress} />
        <LeaveLink />
      </View>
      {session.halted ? (
        <PersistFailure
          message={session.failureMessage ?? REVIEW_PERSIST_FAILED_MESSAGE}
          onRetry={() => void controller.retry()}
        />
      ) : null}
      <View style={styles.boardArea}>
        <PairBoard
          key={session.gameSessionId}
          words={session.words}
          random={reviewBoardRandom}
          disabled={session.boardDisabled}
          onReady={board.onReady}
          onPairsEntered={board.onPairsEntered}
          onAttempt={board.onAttempt}
          createAttemptId={createReviewAttemptId}
        />
      </View>
    </View>
  );
}

function ProgressHeader({ progress }: { progress: ReviewProgressView }) {
  return (
    <View style={styles.progressBlock}>
      <Text accessibilityRole="header" style={styles.stageLabel}>
        {progress.stageLabel}
      </Text>
      <Text accessibilityLabel={progress.accessibilityLabel} style={styles.progressLabel}>
        {progress.progressLabel}
        {progress.remainingLabel === null ? "" : ` · ${progress.remainingLabel}`}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width: `${progress.ratio * 100}%` }]} />
      </View>
    </View>
  );
}

function PersistFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.alertCard}>
      <Text style={styles.alertText}>{message}</Text>
      <PrimaryAction action={REVIEW_RETRY_ACTION} onPress={onRetry} />
    </View>
  );
}

function ReviewResult({ result, onContinue }: { result: ReviewResultView; onContinue: () => void }) {
  return (
    <ReviewCanvas>
      <View accessible accessibilityRole="summary" accessibilityLabel={result.announcement} style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          {result.title}
        </Text>
        {result.rows.map((row) => (
          <View key={row.label} style={styles.resultRow}>
            <Text style={styles.statLabel}>{row.label}</Text>
            <Text style={styles.statValue}>{row.value}</Text>
          </View>
        ))}
        <Text style={styles.intro}>{result.remainingLabel}</Text>
        <Text style={styles.intro}>{result.nextReviewLabel}</Text>
      </View>
      <View style={styles.actions}>
        {result.continueReview && result.continueAction !== null ? (
          <PrimaryAction action={result.continueAction} onPress={onContinue} />
        ) : null}
        <HomeLink action={result.homeAction} />
      </View>
    </ReviewCanvas>
  );
}

function ReviewNothing({
  message,
  practice,
  home,
}: {
  message: string;
  practice: ReviewLink;
  home: ReviewLink;
}) {
  return (
    <ReviewCanvas>
      <Text accessibilityRole="header" style={styles.title}>
        {message}
      </Text>
      <View style={styles.actions}>
        <Link href={practice.href} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={practice.accessibilityLabel}
            style={styles.primaryTarget}
          >
            <Text style={styles.primaryLabel}>{practice.label}</Text>
          </Pressable>
        </Link>
        <HomeLink action={home} />
      </View>
    </ReviewCanvas>
  );
}

function ReviewFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ReviewCanvas>
      <Text accessibilityRole="alert" style={styles.intro}>
        {message}
      </Text>
      <PrimaryAction action={REVIEW_RETRY_ACTION} onPress={onRetry} />
      <HomeLink action={REVIEW_HOME_ACTION} />
    </ReviewCanvas>
  );
}

function PrimaryAction({ action, onPress }: { action: ReviewAction; onPress: () => void }) {
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

function HomeLink({ action }: { action: ReviewLink }) {
  return (
    <Link href={action.href} dismissTo asChild>
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

function LeaveLink() {
  return (
    <Link href={REVIEW_HOME_ACTION.href} dismissTo asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REVIEW_LEAVE_ACTION.accessibilityLabel}
        hitSlop={4}
        style={styles.iconTarget}
      >
        <LogOut color={PAR_A_PAR_COLORS.ink} size={ICON_SIZE} strokeWidth={2.2} />
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
  matching: {
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    gap: STAGE_GAP,
  },
  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: STAGE_GAP,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
  },
  progressBlock: {
    flex: 1,
    gap: STAGE_GAP,
  },
  stageLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  progressLabel: {
    color: PAR_A_PAR_COLORS.inkMuted,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  progressTrack: {
    height: PAR_A_PAR_METRICS.progressHeight,
    overflow: "hidden",
    borderRadius: PAR_A_PAR_METRICS.progressHeight,
    backgroundColor: PAR_A_PAR_COLORS.track,
  },
  progressFill: {
    height: "100%",
    borderRadius: PAR_A_PAR_METRICS.progressHeight,
    backgroundColor: PAR_A_PAR_COLORS.primary,
  },
  boardArea: {
    flex: 1,
  },
  title: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  intro: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
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
  alertCard: {
    gap: HOME_ENTRY_METRICS.actionGap,
    marginHorizontal: HOME_ENTRY_METRICS.cardPadding,
    padding: HOME_ENTRY_METRICS.cardPadding,
    borderRadius: HOME_ENTRY_METRICS.cardRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.emphasis,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  alertText: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontFamily: PAR_A_PAR_FONTS.bodyBold,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  resultRow: {
    minHeight: REVIEW_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statLabel: {
    color: HOME_ENTRY_PALETTE.muted,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  statValue: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  iconTarget: {
    width: REVIEW_MIN_TOUCH_TARGET,
    height: REVIEW_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: PAR_A_PAR_METRICS.tileBorder,
    borderColor: PAR_A_PAR_COLORS.ink,
    backgroundColor: PAR_A_PAR_COLORS.card,
  },
  primaryTarget: {
    minHeight: REVIEW_MIN_TOUCH_TARGET,
    minWidth: REVIEW_MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    backgroundColor: HOME_ENTRY_PALETTE.primary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    paddingVertical: HOME_ENTRY_METRICS.actionGap,
  },
  secondaryTarget: {
    minHeight: REVIEW_MIN_TOUCH_TARGET,
    minWidth: REVIEW_MIN_TOUCH_TARGET,
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
    fontFamily: PAR_A_PAR_FONTS.bodyBold,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  secondaryLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
});
