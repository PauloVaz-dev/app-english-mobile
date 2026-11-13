import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";

import type { GameCard } from "@/lib/domain/game/game-engine";
import type { RandomSource, Word } from "@/lib/domain/game/types";
import {
  PAR_A_PAR_COLORS,
  PAR_A_PAR_FONTS,
  PAR_A_PAR_METRICS,
  hardShadow,
} from "@/lib/presentation/theme/par-a-par-theme";
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
  // A function `style` is dropped on Android, where NativeWind wraps Pressable: keep it static.
  const [pressed, setPressed] = useState(false);
  return (
    <Animated.View style={[styles.cardSlot, { opacity }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={view.accessibilityLabel}
        accessibilityHint={view.disabled ? undefined : PAIR_BOARD_CARD_HINT}
        accessibilityState={{ selected: view.selected, disabled: view.disabled }}
        disabled={view.disabled}
        onPress={() => onSelect(card.wordId)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          styles.card,
          card.language === "english" ? styles.cardEnglish : styles.cardPortuguese,
          CARD_STATUS_STYLES[view.status],
          pressed && !view.disabled ? styles.cardPressed : null,
        ]}
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

const TILE_GAP = 10;
const DISABLED_OPACITY = 0.6;

const styles = StyleSheet.create({
  board: {
    flex: 1,
    // Cards sit at the bottom, within reach of the thumb; the feedback stays right above them.
    justifyContent: "flex-end",
    gap: 16,
  },
  feedback: {
    minHeight: PAIR_BOARD_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: TILE_GAP,
    paddingHorizontal: 14,
    borderRadius: PAR_A_PAR_METRICS.tileRadius,
    borderCurve: "continuous",
    borderWidth: PAR_A_PAR_METRICS.tileBorder,
    borderColor: "transparent",
  },
  toneCorrect: {
    color: PAR_A_PAR_COLORS.primary,
  },
  toneIncorrect: {
    color: PAR_A_PAR_COLORS.error,
  },
  feedbackCorrect: {
    borderColor: PAR_A_PAR_COLORS.ink,
    backgroundColor: PAR_A_PAR_COLORS.englishTile,
    boxShadow: hardShadow(),
  },
  feedbackIncorrect: {
    borderColor: PAR_A_PAR_COLORS.error,
    borderStyle: "dashed",
    backgroundColor: PAR_A_PAR_COLORS.errorTile,
  },
  feedbackIcon: {
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: 20,
  },
  feedbackText: {
    flexShrink: 1,
    color: PAR_A_PAR_COLORS.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: 16,
  },
  feedbackTitle: {
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
  },
  columns: {
    flexShrink: 1,
    flexDirection: "row",
    gap: 14,
  },
  column: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: TILE_GAP,
  },
  columnTitle: {
    color: PAR_A_PAR_COLORS.inkMuted,
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
    fontSize: PAR_A_PAR_METRICS.eyebrowSize,
    letterSpacing: PAR_A_PAR_METRICS.eyebrowSpacing,
    textTransform: "uppercase",
  },
  cardSlot: {
    height: PAR_A_PAR_METRICS.tileHeight,
    minHeight: PAR_A_PAR_METRICS.tileMinHeight,
    flexShrink: 1,
  },
  card: {
    flex: 1,
    minHeight: PAR_A_PAR_METRICS.tileMinHeight,
    minWidth: PAIR_BOARD_MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: PAR_A_PAR_METRICS.tileRadius,
    borderCurve: "continuous",
    borderWidth: PAR_A_PAR_METRICS.tileBorder,
    borderColor: PAR_A_PAR_COLORS.ink,
    boxShadow: hardShadow(),
  },
  cardPortuguese: {
    backgroundColor: PAR_A_PAR_COLORS.portugueseTile,
  },
  cardEnglish: {
    backgroundColor: PAR_A_PAR_COLORS.englishTile,
  },
  cardPressed: {
    boxShadow: hardShadow(1),
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  cardSelected: {
    outlineWidth: PAR_A_PAR_METRICS.focusRing,
    outlineStyle: "solid",
    outlineColor: PAR_A_PAR_COLORS.ring,
    outlineOffset: 2,
    boxShadow: hardShadow(PAR_A_PAR_METRICS.selectedShadow),
    transform: [{ translateX: -1 }, { translateY: -1 }],
  },
  cardIncorrect: {
    backgroundColor: PAR_A_PAR_COLORS.errorTile,
    outlineWidth: PAR_A_PAR_METRICS.focusRing,
    outlineStyle: "dashed",
    outlineColor: PAR_A_PAR_COLORS.error,
    outlineOffset: 2,
  },
  cardDisabled: {
    opacity: DISABLED_OPACITY,
  },
  cardText: {
    flexShrink: 1,
    color: PAR_A_PAR_COLORS.ink,
    fontFamily: PAR_A_PAR_FONTS.displayBold,
    fontSize: 20,
    textAlign: "center",
  },
  cardTextSelected: {
    fontFamily: PAR_A_PAR_FONTS.display,
  },
  cardMissIcon: {
    color: PAR_A_PAR_COLORS.error,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: 18,
  },
});

const CARD_STATUS_STYLES = {
  idle: null,
  selected: styles.cardSelected,
  incorrect: styles.cardIncorrect,
  disabled: styles.cardDisabled,
} as const;
