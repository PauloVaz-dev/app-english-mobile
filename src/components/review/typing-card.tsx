import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";

import { HOME_ENTRY_METRICS, HOME_ENTRY_PALETTE } from "@/lib/presentation/home/home-entry-layout";
import {
  TYPING_CARD_EXAMPLE_LABEL,
  TYPING_CARD_MIN_TOUCH_TARGET,
  TypingCardController,
  buildTypingCardView,
  type TypingCardActionView,
  type TypingCardFeedbackView,
  type TypingCardPrompt,
  type TypingCardResult,
  type TypingCardState,
  type TypingCardSubmission,
} from "@/lib/presentation/review/typing-card";
import {
  PAR_A_PAR_COLORS,
  PAR_A_PAR_FONTS,
  PAR_A_PAR_METRICS,
} from "@/lib/presentation/theme/par-a-par-theme";

const BORDER_WIDTH = 1;
const DISABLED_OPACITY = 0.6;

export interface TypingCardProps {
  readonly prompt: TypingCardPrompt;
  readonly result: TypingCardResult | null;
  readonly onSubmit: (submission: TypingCardSubmission) => void;
  readonly onContinue: () => void;
  readonly now?: () => number;
}

interface TypingCardModel {
  readonly state: TypingCardState;
  readonly controller: TypingCardController;
}

type AnswerField = Map<"answer", TextInputInstance>;
type ClockBox = Map<"read", () => number>;

function readClock(): number {
  return performance.now();
}

function useTypingCard(props: TypingCardProps, field: AnswerField): TypingCardModel {
  const { prompt, result, onSubmit, onContinue, now = readClock } = props;
  const [clock] = useState<ClockBox>(() => new Map([["read", now]]));
  const [state, setState] = useState<TypingCardState | null>(null);
  const [controller] = useState(
    () =>
      new TypingCardController({
        prompt,
        now: () => clock.get("read")?.() ?? readClock(),
        onChange: setState,
        focus: () => {
          field.get("answer")?.focus();
        },
        announce: (message) => AccessibilityInfo.announceForAccessibility(message),
      }),
  );
  useEffect(() => {
    clock.set("read", now);
  }, [clock, now]);
  useEffect(() => {
    controller.setCallbacks({ onSubmit, onContinue });
  }, [controller, onSubmit, onContinue]);
  useEffect(() => {
    controller.open(prompt);
  }, [controller, prompt]);
  useEffect(() => {
    if (result !== null) {
      controller.showResult(result);
    }
  }, [controller, result]);
  return { state: state ?? controller.state, controller };
}

function keepAnswerField(field: AnswerField, node: TextInputInstance | null): void {
  if (node === null) {
    field.delete("answer");
    return;
  }
  field.set("answer", node);
}

function submitFromKeyboard(model: TypingCardModel): void {
  if (model.state.phase === "feedback") {
    model.controller.next();
    return;
  }
  model.controller.send();
}

export function TypingCard(props: TypingCardProps) {
  const [field] = useState<AnswerField>(() => new Map());
  const model = useTypingCard(props, field);
  const view = buildTypingCardView(model.state);
  const send = () => submitFromKeyboard(model);
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.content}>
        <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.promptLabel}>
          {view.promptLabel}
        </Text>
        <Text accessibilityRole="header" accessibilityLabel={`${view.promptLabel}: ${view.portuguese}`} style={styles.word}>
          {view.portuguese}
        </Text>
        <Reinforcement reinforcement={view.reinforcement} />
        <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.fieldLabel}>
          {view.fieldLabel}
        </Text>
        <TextInput
          ref={(node) => keepAnswerField(field, node)}
          autoFocus
          value={view.draft}
          onChangeText={(text) => model.controller.changeDraft(text)}
          onSubmitEditing={send}
          accessibilityLabel={view.fieldLabel}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          returnKeyType="send"
          submitBehavior="submit"
          style={[styles.target, styles.input]}
        />
        {view.hint === null ? null : <Text style={styles.hint}>{view.hint}</Text>}
        <View style={styles.actions}>
          <CardButton action={view.hintAction} onPress={() => model.controller.revealHint()} />
          <CardButton action={view.skipAction} onPress={() => model.controller.skip()} />
          <CardButton action={view.sendAction} onPress={send} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultScroll}>
          <ResultBanner feedback={view.feedback} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Reinforcement({
  reinforcement,
}: {
  reinforcement: TypingCardViewReinforcement;
}) {
  if (reinforcement === null) {
    return null;
  }
  return (
    <View style={styles.reinforcement}>
      <Text style={styles.reinforcementLabel}>{reinforcement.label}</Text>
      <Text style={styles.reinforcementDetail}>{reinforcement.detail}</Text>
    </View>
  );
}

type TypingCardViewReinforcement = ReturnType<typeof buildTypingCardView>["reinforcement"];

function CardButton({ action, onPress }: { action: TypingCardActionView; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      accessibilityState={{ disabled: action.disabled }}
      disabled={action.disabled}
      onPress={onPress}
      style={[styles.target, styles.action, action.disabled ? styles.disabled : null]}
    >
      <Text style={styles.actionLabel}>{action.label}</Text>
    </Pressable>
  );
}

function ResultBanner({ feedback }: { feedback: TypingCardFeedbackView | null }) {
  if (feedback === null) {
    return null;
  }
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={feedback.announcement}
      style={[styles.feedback, FEEDBACK_TONES[feedback.outcome]]}
    >
      <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.feedbackIcon}>
        {feedback.icon}
      </Text>
      <Text style={styles.feedbackTitle}>{feedback.title}</Text>
      <Text style={styles.feedbackDetail}>{feedback.detail}</Text>
      {feedback.exampleSentence === null ? null : (
        <Text style={styles.example}>
          {TYPING_CARD_EXAMPLE_LABEL}: {feedback.exampleSentence}
        </Text>
      )}
    </View>
  );
}

const FEEDBACK_TONES = {
  CORRECT: {
    borderColor: PAR_A_PAR_COLORS.ink,
    backgroundColor: PAR_A_PAR_COLORS.englishTile,
  },
  ALMOST: {
    borderColor: PAR_A_PAR_COLORS.ink,
    backgroundColor: PAR_A_PAR_COLORS.sun,
  },
  WRONG: {
    borderColor: PAR_A_PAR_COLORS.error,
    backgroundColor: PAR_A_PAR_COLORS.errorTile,
  },
  DONT_KNOW: {
    borderColor: PAR_A_PAR_COLORS.ink,
    backgroundColor: PAR_A_PAR_COLORS.portugueseTile,
  },
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: HOME_ENTRY_PALETTE.canvas,
  },
  content: {
    flex: 1,
    padding: HOME_ENTRY_METRICS.screenPadding,
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  promptLabel: {
    color: HOME_ENTRY_PALETTE.muted,
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
    fontSize: PAR_A_PAR_METRICS.eyebrowSize,
    letterSpacing: PAR_A_PAR_METRICS.eyebrowSpacing,
    textTransform: "uppercase",
  },
  word: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: HOME_ENTRY_METRICS.titleSize,
    lineHeight: HOME_ENTRY_METRICS.titleLineHeight,
  },
  reinforcement: {
    gap: BORDER_WIDTH,
  },
  reinforcementLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
    fontSize: HOME_ENTRY_METRICS.cardLabelSize,
  },
  reinforcementDetail: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  fieldLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyBold,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  target: {
    minHeight: TYPING_CARD_MIN_TOUCH_TARGET,
    minWidth: TYPING_CARD_MIN_TOUCH_TARGET,
  },
  input: {
    paddingHorizontal: HOME_ENTRY_METRICS.actionGap,
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.secondaryBorder,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  hint: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyBold,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: HOME_ENTRY_METRICS.actionGap,
  },
  action: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HOME_ENTRY_METRICS.actionRadius,
    borderCurve: "continuous",
    borderWidth: BORDER_WIDTH,
    borderColor: HOME_ENTRY_PALETTE.secondaryBorder,
    backgroundColor: HOME_ENTRY_PALETTE.secondary,
    paddingHorizontal: HOME_ENTRY_METRICS.cardPadding,
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  actionLabel: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyBold,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  resultScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  feedback: {
    gap: HOME_ENTRY_METRICS.actionGap,
    padding: HOME_ENTRY_METRICS.cardPadding,
    borderRadius: PAR_A_PAR_METRICS.tileRadius,
    borderCurve: "continuous",
    borderWidth: PAR_A_PAR_METRICS.tileBorder,
  },
  feedbackIcon: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.display,
    fontSize: HOME_ENTRY_METRICS.summarySize,
  },
  feedbackTitle: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.bodyHeavy,
    fontSize: HOME_ENTRY_METRICS.introSize,
  },
  feedbackDetail: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
  example: {
    color: HOME_ENTRY_PALETTE.ink,
    fontFamily: PAR_A_PAR_FONTS.body,
    fontSize: HOME_ENTRY_METRICS.introSize,
    lineHeight: HOME_ENTRY_METRICS.introLineHeight,
  },
});
