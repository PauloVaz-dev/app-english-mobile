/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";
import {
  TYPING_CARD_MIN_TOUCH_TARGET,
  TypingCardController,
  buildTypingCardView,
  changeTypingDraft,
  continueTypingCard,
  openTypingCard,
  revealTypingHint,
  showTypingResult,
  submitTypingAnswer,
  submitTypingDontKnow,
  type TypingCardFeedbackView,
  type TypingCardOutcome,
  type TypingCardPrompt,
  type TypingCardSubmission,
  type TypingCardTransition,
} from "@/lib/presentation/review/typing-card";

const APPLE: TypingCardPrompt = {
  wordId: "apple",
  portuguese: "maçã",
  firstLetter: "a",
  reinforcement: false,
};

function prompt(
  wordId: string,
  portuguese: string,
  firstLetter: string,
  reinforcement: boolean,
): TypingCardPrompt {
  return { wordId, portuguese, firstLetter, reinforcement };
}

function submissionsOf(transition: TypingCardTransition): TypingCardSubmission[] {
  return transition.effects.flatMap((effect) =>
    effect.type === "submit" ? [effect.submission] : [],
  );
}

function shownFeedback(
  outcome: TypingCardOutcome,
  exampleSentence: string | null,
): TypingCardFeedbackView {
  const pending = submitTypingAnswer(changeTypingDraft(openTypingCard(APPLE, 0).state, "x"), 10);
  const shown = showTypingResult(pending.state, {
    outcome,
    expected: "apple",
    exampleSentence,
  });
  const feedback = buildTypingCardView(shown.state).feedback;
  if (feedback === null) {
    throw new Error("missing feedback");
  }
  return feedback;
}

describe("typing card state", () => {
  it("shows the Portuguese and starts the clock when the card appears", () => {
    const opened = openTypingCard(APPLE, 1_000);

    expect(opened.effects).toEqual([{ type: "focus" }]);
    expect(opened.state.shownAtMs).toBe(1_000);
    expect(opened.state.phase).toBe("answering");
    expect(opened.state.draft).toBe("");
    expect(opened.state.hintRevealed).toBe(false);
    const view = buildTypingCardView(opened.state);
    expect(view.portuguese).toBe("maçã");
    expect(view.promptLabel).toBe("Em português");
    expect(view.fieldLabel).toBe("Digite em inglês");
    expect(view.hint).toBeNull();
    expect(view.reinforcement).toBeNull();
    expect(view.answering).toBe(true);
    expect(view.sendAction.label).toBe("Enviar");
    expect(view.sendAction.disabled).toBe(true);
    expect(view.hintAction.label).toBe("Dica");
    expect(view.hintAction.disabled).toBe(false);
    expect(view.skipAction.label).toBe("Não sei");
    expect(view.skipAction.disabled).toBe(false);
  });

  it("reveals the first letter and marks the hint without restarting the clock", () => {
    const opened = openTypingCard(APPLE, 1_000).state;

    const hinted = revealTypingHint(opened);
    const again = revealTypingHint(hinted);

    expect(hinted.hintRevealed).toBe(true);
    expect(hinted.shownAtMs).toBe(1_000);
    expect(buildTypingCardView(hinted).hint).toBe("A palavra começa com a.");
    expect(again).toBe(hinted);
  });

  it("does not send an empty or whitespace answer", () => {
    const opened = openTypingCard(APPLE, 1_000).state;
    const blank = submitTypingAnswer(opened, 1_500);
    const spaces = submitTypingAnswer(changeTypingDraft(opened, "   "), 1_500);

    expect(blank.state).toBe(opened);
    expect(blank.effects).toEqual([]);
    expect(spaces.effects).toEqual([]);
    expect(spaces.state.phase).toBe("answering");
    expect(buildTypingCardView(spaces.state).sendAction.disabled).toBe(true);
  });

  it("sends the trimmed answer with the hint flag and the time since the card appeared", () => {
    const hinted = revealTypingHint(openTypingCard(APPLE, 1_000).state);
    const drafted = changeTypingDraft(hinted, "  apple  ");

    const sent = submitTypingAnswer(drafted, 3_200);

    expect(submissionsOf(sent)).toEqual([
      {
        wordId: "apple",
        reinforcement: false,
        kind: "answer",
        typed: "apple",
        usedHint: true,
        responseTimeMs: 2_200,
      },
    ]);
    expect(sent.state.phase).toBe("pending");
    expect(submitTypingAnswer(sent.state, 4_000).effects).toEqual([]);
    expect(revealTypingHint(sent.state)).toBe(sent.state);
    expect(changeTypingDraft(sent.state, "pear")).toBe(sent.state);
  });

  it("sends don't-know without the draft, and keeps the hint flag", () => {
    const hinted = changeTypingDraft(revealTypingHint(openTypingCard(APPLE, 1_000).state), "nope");

    const skipped = submitTypingDontKnow(hinted, 1_800);

    expect(submissionsOf(skipped)).toEqual([
      {
        wordId: "apple",
        reinforcement: false,
        kind: "dont_know",
        typed: null,
        usedHint: true,
        responseTimeMs: 800,
      },
    ]);
    expect(buildTypingCardView(skipped.state).skipAction.disabled).toBe(true);
  });

  it("never reports a negative response time", () => {
    const drafted = changeTypingDraft(openTypingCard(APPLE, 5_000).state, "apple");

    const sent = submitTypingAnswer(drafted, 4_000);

    expect(submissionsOf(sent)[0]?.responseTimeMs).toBe(0);
  });

  it("names a reinforcement card without treating it as a new grade", () => {
    const view = buildTypingCardView(
      openTypingCard(prompt("apple", "maçã", "a", true), 0).state,
    );

    expect(view.reinforcement).toEqual({
      label: "Reforço",
      detail: "Esta palavra volta só para praticar. A nota já foi registrada.",
    });
  });
});

describe("typing card feedback", () => {
  it("distinguishes correct, almost and wrong by text and icon, with the spelling", () => {
    const correct = shownFeedback("CORRECT", null);
    const almost = shownFeedback("ALMOST", null);
    const wrong = shownFeedback("WRONG", null);

    expect(new Set([correct.icon, almost.icon, wrong.icon]).size).toBe(3);
    expect(new Set([correct.title, almost.title, wrong.title]).size).toBe(3);
    expect(correct).toMatchObject({ icon: "✓", title: "Certo" });
    expect(almost).toMatchObject({ icon: "≈", title: "Quase" });
    expect(wrong).toMatchObject({ icon: "✕", title: "Errado" });
    for (const feedback of [correct, almost, wrong]) {
      expect(feedback.detail).toContain("apple");
      expect(feedback.announcement).toContain(feedback.title);
      expect(feedback.announcement).toContain("apple");
      expect(feedback.exampleSentence).toBeNull();
      expect(feedback.announcement).not.toContain("Frase de exemplo");
    }
    expect(almost.detail).toContain("grafia correta");
    expect(wrong.detail).toContain("resposta correta");
    expect(correct.detail).toContain("palavra em inglês");
  });

  it("announces don't-know with the spelling and a different icon from a wrong answer", () => {
    const skipped = shownFeedback("DONT_KNOW", null);
    const wrong = shownFeedback("WRONG", null);

    expect(skipped.icon).not.toBe(wrong.icon);
    expect(skipped.title).not.toBe(wrong.title);
    expect(skipped.title).toBe("Não sei");
    expect(skipped.announcement).toContain("apple");
    expect(skipped.announcement).toContain(skipped.title);
  });

  it("shows the example sentence and includes it in the announcement", () => {
    const feedback = shownFeedback("CORRECT", "  I eat an apple.  ");

    expect(feedback.exampleSentence).toBe("I eat an apple.");
    expect(feedback.announcement).toContain("Certo");
    expect(feedback.announcement).toContain("apple");
    expect(feedback.announcement).toContain("Frase de exemplo: I eat an apple.");
  });

  it("drops a blank example sentence", () => {
    const feedback = shownFeedback("ALMOST", "   ");

    expect(feedback.exampleSentence).toBeNull();
    expect(feedback.announcement).not.toContain("Frase de exemplo");
  });

  it("announces the result once, then lets the keyboard move on", () => {
    const pending = submitTypingAnswer(changeTypingDraft(openTypingCard(APPLE, 0).state, "aple"), 20);
    const shown = showTypingResult(pending.state, {
      outcome: "ALMOST",
      expected: "apple",
      exampleSentence: null,
    });
    const repeated = showTypingResult(shown.state, {
      outcome: "WRONG",
      expected: "apple",
      exampleSentence: null,
    });
    const blocked = continueTypingCard(pending.state);
    const continued = continueTypingCard(shown.state);
    const again = continueTypingCard(continued.state);

    expect(shown.effects).toEqual([
      { type: "announce", message: buildTypingCardView(shown.state).feedback?.announcement },
    ]);
    expect(repeated.state).toBe(shown.state);
    expect(repeated.effects).toEqual([]);
    expect(blocked.effects).toEqual([]);
    expect(continued.effects).toEqual([{ type: "continue" }]);
    expect(again.effects).toEqual([]);
    expect(buildTypingCardView(shown.state).sendAction.label).toBe("Continuar");
    expect(buildTypingCardView(shown.state).sendAction.disabled).toBe(false);
    expect(buildTypingCardView(continued.state).sendAction.disabled).toBe(true);
  });
});

describe("typing card sequence", () => {
  it("returns hint, don't-know and reinforcement submissions in order with each card's time", () => {
    const house = prompt("house", "casa", "h", false);
    const again = prompt("apple", "maçã", "a", true);
    const firstCard = changeTypingDraft(revealTypingHint(openTypingCard(APPLE, 1_000).state), "apple");
    const empty = submitTypingAnswer(changeTypingDraft(firstCard, "   "), 2_000);
    const first = submitTypingAnswer(firstCard, 3_200);
    const secondCard = changeTypingDraft(openTypingCard(house, 4_000).state, "nope");
    const second = submitTypingDontKnow(secondCard, 4_600);
    const thirdCard = openTypingCard(again, 5_000).state;
    const third = submitTypingAnswer(changeTypingDraft(thirdCard, "apple"), 6_100);

    expect(empty.effects).toEqual([]);
    expect(thirdCard.hintRevealed).toBe(false);
    expect(thirdCard.draft).toBe("");
    expect(thirdCard.shownAtMs).toBe(5_000);
    expect([...submissionsOf(first), ...submissionsOf(second), ...submissionsOf(third)]).toEqual([
      {
        wordId: "apple",
        reinforcement: false,
        kind: "answer",
        typed: "apple",
        usedHint: true,
        responseTimeMs: 2_200,
      },
      {
        wordId: "house",
        reinforcement: false,
        kind: "dont_know",
        typed: null,
        usedHint: false,
        responseTimeMs: 600,
      },
      {
        wordId: "apple",
        reinforcement: true,
        kind: "answer",
        typed: "apple",
        usedHint: false,
        responseTimeMs: 1_100,
      },
    ]);
  });
});

describe("typing card controller", () => {
  it("focuses each card once and does not restart the clock for the same card", () => {
    let now = 1_000;
    const focused: number[] = [];
    const submitted: TypingCardSubmission[] = [];
    const announced: string[] = [];
    const continued: number[] = [];
    const controller = new TypingCardController({
      prompt: APPLE,
      now: () => now,
      onChange: () => undefined,
      focus: () => {
        focused.push(now);
      },
      announce: (message) => {
        announced.push(message);
      },
    });
    controller.setCallbacks({
      onSubmit: (submission) => {
        submitted.push(submission);
      },
      onContinue: () => {
        continued.push(1);
      },
    });

    controller.open(APPLE);
    controller.open(APPLE);
    now = 4_000;
    controller.open(prompt("house", "casa", "h", false));
    controller.changeDraft("   ");
    controller.send();
    controller.changeDraft("house");
    now = 4_600;
    controller.send();
    controller.showResult({ outcome: "WRONG", expected: "house", exampleSentence: null });
    controller.next();
    controller.next();

    expect(focused).toEqual([1_000, 4_000]);
    expect(controller.state.shownAtMs).toBe(4_000);
    expect(submitted).toEqual([
      {
        wordId: "house",
        reinforcement: false,
        kind: "answer",
        typed: "house",
        usedHint: false,
        responseTimeMs: 600,
      },
    ]);
    expect(announced).toHaveLength(1);
    expect(announced[0]).toContain("Errado");
    expect(announced[0]).toContain("house");
    expect(continued).toEqual([1]);
  });
});

describe("typing card boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");

  it("uses the entry touch target of at least 44 points", () => {
    expect(TYPING_CARD_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
    expect(TYPING_CARD_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });

  it("keeps the card state free of React, grading, composition and the database", () => {
    const source = read("src/lib/presentation/review/typing-card.ts");

    expect(source).not.toMatch(/from\s+["'](react|react-native|expo[^"']*)["']/);
    expect(source).not.toMatch(
      /@\/composition|@\/persistence|typing-review|typing-answer|review-session|expo-sqlite/,
    );
  });

  it("keeps the field focused, the keyboard open, and suggestions off", () => {
    const source = read("src/components/review/typing-card.tsx");
    const card = source.indexOf("function TypingCard");
    const avoiding = source.indexOf("<KeyboardAvoidingView", card);
    const word = source.indexOf("view.portuguese", card);
    const field = source.indexOf("<TextInput", card);
    const hint = source.indexOf("view.hintAction", card);
    const skip = source.indexOf("view.skipAction", card);
    const closing = source.indexOf("</KeyboardAvoidingView>", card);

    expect(source).toMatch(/<KeyboardAvoidingView[^>]*behavior="padding"/);
    expect(avoiding).toBeGreaterThan(-1);
    expect(word).toBeGreaterThan(avoiding);
    expect(field).toBeGreaterThan(word);
    expect(hint).toBeGreaterThan(field);
    expect(skip).toBeGreaterThan(hint);
    expect(closing).toBeGreaterThan(skip);
    expect(source).toContain("autoFocus");
    expect(source).toContain(".focus()");
    expect(source).toContain('submitBehavior="submit"');
    expect(source).toContain('returnKeyType="send"');
    expect(source).toContain('autoCapitalize="none"');
    expect(source).toContain("autoCorrect={false}");
    expect(source).toContain("spellCheck={false}");
    expect(source).toContain('autoComplete="off"');
    expect(source).toContain('textContentType="none"');
    expect(source).toContain('importantForAutofill="no"');
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
    expect(source).not.toContain(".blur(");
    expect(source).toContain("feedback.icon");
    expect(source).toContain("feedback.title");
    expect(source).toContain("feedback.detail");
    expect(source).toContain("feedback.exampleSentence");
    expect(source).toContain("feedback.announcement");
    expect(source).toContain("minHeight: TYPING_CARD_MIN_TOUCH_TARGET");
    expect(source).toContain("minWidth: TYPING_CARD_MIN_TOUCH_TARGET");
    expect(source).toMatch(
      /import\s*\{[^}]*\bAccessibilityInfo\b[^}]*\}\s*from\s*"react-native"/,
    );
    expect(source).toContain("AccessibilityInfo.announceForAccessibility");
    expect(source).not.toMatch(/import\s*\(/);
  });

  it("does not let the component know composition, the repository or the grade", () => {
    const source = read("src/components/review/typing-card.tsx");

    expect(source).not.toMatch(
      /@\/composition|@\/persistence|typing-review|typing-answer|review-session|gradeTyping|evaluateTyped|expo-sqlite|expo-crypto/,
    );
  });
});
