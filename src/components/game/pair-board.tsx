import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";

import type { GameCard } from "@/lib/domain/game/game-engine";
import type { RandomSource, Word } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";
import {
  PAIR_BOARD_CARD_HINT,
  PAIR_BOARD_COLUMN_TITLES,
  PAIR_BOARD_ENTER_ANIMATION_MS,
  PAIR_BOARD_FEEDBACK_MS,
  PAIR_BOARD_MIN_TOUCH_TARGET,
  PairBoardController,
  pairBoardCardView,
  pairBoardFeedbackView,
  type PairBoardAttempt,
  type PairBoardLanguage,
  type PairBoardState,
} from "@/lib/presentation/game/pair-board-state";

export type { PairBoardAttempt } from "@/lib/presentation/game/pair-board-state";

/**
 * The PairBoard port: two columns of cards, hit and miss decided on the spot.
 * It never records anything; whoever uses it records the attempts. The board
 * is built once from `words` on mount: give it a new `key` for a new match.
 */
export interface PairBoardProps {
  /** Match queue; the board shows at most 5 pairs. */
  readonly words: readonly Word[];
  readonly random: RandomSource;
  /** Time over, result or match closed: blocks new selections. */
  readonly disabled: boolean;
  /** Called once, when the first cards can be tapped. */
  readonly onReady: (enteredWordIds: readonly string[]) => void;
  /** Called on every replacement pair. */
  readonly onPairsEntered: (wordIds: readonly string[]) => void;
  /** Called on every attempt and never awaited. */
  readonly onAttempt: (attempt: PairBoardAttempt) => void;
  /** Generates the attempt id on the tap that forms the pair (the device passes its UUID generator). */
  readonly createAttemptId: () => string;
  /** Monotonic clock in milliseconds used for the response time. */
  readonly now?: () => number;
}

const LANGUAGES: readonly PairBoardLanguage[] = ["portuguese", "english"];
const CARD_BORDER_WIDTH = 1;
const SELECTED_BORDER_WIDTH = 3;
const CARD_TEXT_LINES = 2;
const CARD_MIN_FONT_SCALE = 0.7;

function monotonicNow(): number {
  return performance.now();
}

export function PairBoard({
  words,
  random,
  disabled,
  onReady,
  onPairsEntered,
  onAttempt,
  createAttemptId,
  now = monotonicNow,
}: PairBoardProps) {
  const [state, setState] = useState<PairBoardState | null>(null);
  const [controller] = useState(
    () =>
      new PairBoardController({
        words,
        random,
        now,
        createAttemptId,
        announce: (message) => AccessibilityInfo.announceForAccessibility(message),
        onChange: setState,
      }),
  );
  const reduceMotion = useReduceMotion();
  const current = state ?? controller.state;
  const feedbackId = current.feedback?.id ?? null;

  useEffect(() => {
    controller.setCallbacks({ onReady, onPairsEntered, onAttempt });
  }, [controller, onReady, onPairsEntered, onAttempt]);

  useEffect(() => {
    controller.setDisabled(disabled);
    controller.ready();
  }, [controller, disabled]);

  useEffect(() => {
    if (feedbackId === null) {
      return;
    }
    const timer = setTimeout(() => controller.clearFeedback(feedbackId), PAIR_BOARD_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [controller, feedbackId]);

  return (
    <View style={styles.board}>
      <PairBoardFeedbackBar state={current} />
      <View style={styles.columns}>
        {LANGUAGES.map((language) => (
          <PairColumn
            key={language}
            language={language}
            state={current}
            reduceMotion={reduceMotion}
            onSelect={(wordId) => controller.select(wordId, language)}
          />
        ))}
      </View>
    </View>
  );
}

function useReduceMotion(): boolean {
  // Until the system answers, cards appear without animation.
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active) {
          setReduceMotion(enabled);
        }
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

function PairBoardFeedbackBar({ state }: { state: PairBoardState }) {
  const feedback = pairBoardFeedbackView(state.feedback);
  const correct = feedback?.tone === "correct";
  const toneStyle =
    feedback === null ? null : correct ? styles.feedbackCorrect : styles.feedbackIncorrect;
  // Announced by AccessibilityInfo on each attempt; no live region to avoid a double reading.
  return (
    <View style={[styles.feedback, toneStyle]}>
      {feedback === null ? null : (
        <>
          <Text style={[styles.feedbackIcon, correct ? styles.toneCorrect : styles.toneIncorrect]}>
            {feedback.icon}
          </Text>
          <Text numberOfLines={1} style={styles.feedbackText}>
            <Text style={styles.feedbackTitle}>{feedback.title}</Text>
            {` · ${feedback.detail}`}
          </Text>
        </>
      )}
    </View>
  );
}

function PairColumn({
  language,
  state,
  reduceMotion,
  onSelect,
}: {
  language: PairBoardLanguage;
  state: PairBoardState;
  reduceMotion: boolean;
  onSelect: (wordId: string) => void;
}) {
  const cards = language === "portuguese" ? state.board.portugueseCards : state.board.englishCards;
  return (
    <View style={styles.column}>
      <Text accessibilityRole="header" style={styles.columnTitle}>
        {PAIR_BOARD_COLUMN_TITLES[language]}
      </Text>
      {cards.map((card) => (
        <PairCard
          key={`${language}-${card.wordId}`}
          card={card}
          state={state}
          reduceMotion={reduceMotion}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function PairCard({
  card,
  state,
  reduceMotion,
  onSelect,
}: {
  card: GameCard;
  state: PairBoardState;
  reduceMotion: boolean;
  onSelect: (wordId: string) => void;
}) {
  const view = pairBoardCardView(state, card);
  const opacity = useEnterOpacity(reduceMotion);
  return (
    <Animated.View style={[styles.cardSlot, { opacity }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={view.accessibilityLabel}
        accessibilityHint={view.disabled ? undefined : PAIR_BOARD_CARD_HINT}
        accessibilityState={{ selected: view.selected, disabled: view.disabled }}
        disabled={view.disabled}
        onPress={() => onSelect(card.wordId)}
        style={[styles.card, CARD_STATUS_STYLES[view.status]]}
      >
        {view.status === "incorrect" ? <Text style={styles.cardMissIcon}>✕</Text> : null}
        <Text
          adjustsFontSizeToFit
          minimumFontScale={CARD_MIN_FONT_SCALE}
          numberOfLines={CARD_TEXT_LINES}
          style={[styles.cardText, view.selected ? styles.cardTextSelected : null]}
        >
          {view.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function useEnterOpacity(reduceMotion: boolean): Animated.Value {
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: PAIR_BOARD_ENTER_ANIMATION_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);
  return opacity;
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  feedback: {
    minHeight: PAIR_BOARD_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: HOME_ENTRY_METRICS.actionGap,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: "transparent",
  },
  toneCorrect: {
    color: HOME_ENTRY_PALETTE.primary,
  },
  toneIncorrect: {
    color: HOME_ENTRY_PALETTE.emphasis,
  },
  feedbackCorrect: {
    borderColor: HOME_ENTRY_PALETTE.primary,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  feedbackIncorrect: {
    borderColor: HOME_ENTRY_PALETTE.emphasis,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  feedbackIcon: {
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "700",
  },
  feedbackText: {
    flexShrink: 1,
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  feedbackTitle: {
    fontWeight: "700",
  },
  columns: {
    flex: 1,
    flexDirection: "row",
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  columnTitle: {
    color: HOME_ENTRY_PALETTE.muted,
    fontSize: HOME_ENTRY_METRICS.badgeSize,
    fontWeight: "700",
    letterSpacing: HOME_ENTRY_METRICS.badgeLetterSpacing,
    textTransform: "uppercase",
  },
  cardSlot: {
    flex: 1,
    minHeight: PAIR_BOARD_MIN_TOUCH_TARGET,
  },
  card: {
    flex: 1,
    minHeight: PAIR_BOARD_MIN_TOUCH_TARGET,
    minWidth: PAIR_BOARD_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: HOME_ENTRY_METRICS.actionGap,
    paddingHorizontal: HOME_ENTRY_METRICS.actionGap,
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.cardBorder,
    backgroundColor: HOME_ENTRY_PALETTE.card,
  },
  cardSelected: {
    borderWidth: SELECTED_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.primary,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
  },
  cardIncorrect: {
    borderWidth: SELECTED_BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.emphasis,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardText: {
    flexShrink: 1,
    color: HOME_ENTRY_PALETTE.ink,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "600",
    textAlign: "center",
  },
  cardTextSelected: {
    fontWeight: "800",
  },
  cardMissIcon: {
    color: HOME_ENTRY_PALETTE.emphasis,
    fontSize: HOME_ENTRY_METRICS.summarySize,
    fontWeight: "700",
  },
});

const CARD_STATUS_STYLES = {
  idle: null,
  selected: styles.cardSelected,
  incorrect: styles.cardIncorrect,
  disabled: styles.cardDisabled,
} as const;
