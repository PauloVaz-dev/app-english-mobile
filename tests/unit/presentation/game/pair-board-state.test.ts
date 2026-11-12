/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BOARD_PAIR_LIMIT } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";
import {
  PAIR_BOARD_FEEDBACK,
  PAIR_BOARD_MIN_TOUCH_TARGET,
  clearPairBoardFeedback,
  createPairBoardState,
  markPairBoardReady,
  pairBoardCardView,
  pairBoardFeedbackView,
  selectPairBoardCard,
  setPairBoardDisabled,
  type PairBoardAttempt,
  type PairBoardEffect,
  type PairBoardLanguage,
  type PairBoardState,
  type PairBoardTransition,
} from "@/lib/presentation/game/pair-board-state";

import { SequenceRandom, makeWords } from "../../domain/game/fixtures";

const RANDOM_VALUES = [0.42, 0.13, 0.77, 0.58, 0.05, 0.91, 0.36, 0.64, 0.27, 0.83];

function newRandom(): SequenceRandom {
  return new SequenceRandom(RANDOM_VALUES);
}

function idFactory(prefix = "attempt"): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

function readyBoard(count = 20, nowMs = 1_000): PairBoardState {
  return markPairBoardReady(createPairBoardState(makeWords(count), newRandom()), nowMs).state;
}

function select(
  state: PairBoardState,
  wordId: string,
  language: PairBoardLanguage,
  nowMs: number,
  createAttemptId: () => string = idFactory(),
): PairBoardTransition {
  return selectPairBoardCard(state, {
    wordId,
    language,
    nowMs,
    createAttemptId,
    random: newRandom(),
  });
}

function visibleIds(state: PairBoardState): string[] {
  return state.board.portugueseCards.map((card) => card.wordId);
}

function wrongPair(state: PairBoardState): { portuguese: string; english: string } {
  const [portuguese, english] = visibleIds(state);
  return { portuguese, english };
}

function attemptsOf(effects: readonly PairBoardEffect[]): PairBoardAttempt[] {
  return effects.flatMap((effect) => (effect.type === "attempt" ? [effect.attempt] : []));
}

describe("pair board state: creation and readiness", () => {
  it("shows at most 5 pairs, one card per language for each word", () => {
    const state = createPairBoardState(makeWords(20), newRandom());

    expect(state.board.portugueseCards).toHaveLength(BOARD_PAIR_LIMIT);
    expect(state.board.englishCards).toHaveLength(BOARD_PAIR_LIMIT);
    expect(new Set(visibleIds(state)).size).toBe(BOARD_PAIR_LIMIT);
    expect(state.board.englishCards.map((card) => card.wordId).sort()).toEqual(
      visibleIds(state).sort(),
    );
    expect(state.board.queuedWords).toHaveLength(15);
  });

  it("is not playable before the first cards are ready", () => {
    const state = createPairBoardState(makeWords(20), newRandom());
    const [wordId] = visibleIds(state);

    const transition = select(state, wordId, "portuguese", 500);

    expect(transition.state).toBe(state);
    expect(transition.effects).toEqual([]);
  });

  it("reports ready once with the first visible words, stamping their entry time", () => {
    const initial = createPairBoardState(makeWords(20), newRandom());

    const first = markPairBoardReady(initial, 1_000);
    const second = markPairBoardReady(first.state, 2_000);

    expect(first.effects).toEqual([{ type: "ready", wordIds: visibleIds(initial) }]);
    expect(first.state.ready).toBe(true);
    for (const wordId of visibleIds(initial)) {
      expect(first.state.pairEnteredAtMs[wordId]).toBe(1_000);
    }
    expect(second.state).toBe(first.state);
    expect(second.effects).toEqual([]);
  });

  it("waits to become ready while disabled, because the cards cannot be tapped yet", () => {
    const disabled = setPairBoardDisabled(createPairBoardState(makeWords(20), newRandom()), true);

    const blocked = markPairBoardReady(disabled, 1_000);
    const enabled = markPairBoardReady(setPairBoardDisabled(blocked.state, false), 3_000);

    expect(blocked.effects).toEqual([]);
    expect(blocked.state.ready).toBe(false);
    expect(enabled.effects).toHaveLength(1);
    expect(Object.values(enabled.state.pairEnteredAtMs)).toEqual(
      Array(BOARD_PAIR_LIMIT).fill(3_000),
    );
  });
});

describe("pair board state: selection", () => {
  it("selects one card per language and keeps both selections until the pair is formed", () => {
    const state = readyBoard();
    const [wordId] = visibleIds(state);

    const next = select(state, wordId, "portuguese", 1_200);

    expect(next.state.selectedPortugueseId).toBe(wordId);
    expect(next.state.selectedEnglishId).toBeNull();
    expect(next.effects).toEqual([]);
  });

  it("swaps the selection when another card of the same language is tapped", () => {
    const state = readyBoard();
    const [first, second] = visibleIds(state);

    const afterFirst = select(state, first, "english", 1_100).state;
    const afterSwap = select(afterFirst, second, "english", 1_200);

    expect(afterSwap.state.selectedEnglishId).toBe(second);
    expect(afterSwap.state.selectedPortugueseId).toBeNull();
    expect(afterSwap.effects).toEqual([]);
  });

  it("clears the selection when the selected card is tapped again", () => {
    const state = readyBoard();
    const [wordId] = visibleIds(state);

    const selected = select(state, wordId, "portuguese", 1_100).state;
    const cleared = select(selected, wordId, "portuguese", 1_200).state;

    expect(cleared.selectedPortugueseId).toBeNull();
  });

  it("ignores a card that is not on the board", () => {
    const state = readyBoard();

    const next = select(state, "word-missing", "portuguese", 1_100);

    expect(next.state).toBe(state);
  });

  it("generates the attempt id only when the pair is formed", () => {
    const state = readyBoard();
    const [wordId] = visibleIds(state);
    const ids: string[] = [];
    const createAttemptId = () => {
      ids.push(`id-${ids.length + 1}`);
      return ids[ids.length - 1];
    };

    const half = select(state, wordId, "portuguese", 1_100, createAttemptId).state;
    expect(ids).toEqual([]);
    const full = select(half, wordId, "english", 1_200, createAttemptId);

    expect(ids).toEqual(["id-1"]);
    expect(attemptsOf(full.effects)[0]?.attemptId).toBe("id-1");
  });
});

describe("pair board state: hit with replacement", () => {
  it("removes both cards, brings the next queued pair and reports the attempt and the new pair", () => {
    const state = readyBoard();
    const [wordId] = visibleIds(state);
    const nextQueued = state.board.queuedWords[0].id;

    const half = select(state, wordId, "english", 1_500).state;
    const hit = select(half, wordId, "portuguese", 2_300, () => "hit-1");

    expect(visibleIds(hit.state)).not.toContain(wordId);
    expect(hit.state.board.englishCards.map((card) => card.wordId)).not.toContain(wordId);
    expect(visibleIds(hit.state)).toContain(nextQueued);
    expect(visibleIds(hit.state)).toHaveLength(BOARD_PAIR_LIMIT);
    expect(hit.state.board.completedWordIds).toEqual([wordId]);
    expect(hit.state.selectedPortugueseId).toBeNull();
    expect(hit.state.selectedEnglishId).toBeNull();
    expect(hit.state.pairEnteredAtMs[nextQueued]).toBe(2_300);
    expect(hit.state.pairEnteredAtMs[wordId]).toBeUndefined();
    expect(hit.effects.map((effect) => effect.type)).toEqual([
      "attempt",
      "pairs_entered",
      "announce",
    ]);
    expect(attemptsOf(hit.effects)).toEqual([
      {
        attemptId: "hit-1",
        promptWordId: wordId,
        selectedWordId: wordId,
        isCorrect: true,
        responseTimeMs: 800,
      },
    ]);
    expect(hit.effects[1]).toEqual({ type: "pairs_entered", wordIds: [nextQueued] });
    expect(hit.state.feedback?.tone).toBe("correct");
  });

  it("does not report a new pair when the queue is empty", () => {
    let state = readyBoard(5);
    const [wordId] = visibleIds(state);

    state = select(state, wordId, "portuguese", 1_100).state;
    const hit = select(state, wordId, "english", 1_200);

    expect(hit.effects.map((effect) => effect.type)).toEqual(["attempt", "announce"]);
    expect(visibleIds(hit.state)).toHaveLength(4);
  });
});

describe("pair board state: miss without revealing", () => {
  it("keeps the cards, clears the selection and reports a wrong attempt", () => {
    const state = readyBoard();
    const { portuguese, english } = wrongPair(state);
    const cardsBefore = state.board;

    const half = select(state, portuguese, "portuguese", 1_400).state;
    const miss = select(half, english, "english", 1_900, () => "miss-1");

    expect(miss.state.board.portugueseCards).toEqual(cardsBefore.portugueseCards);
    expect(miss.state.board.englishCards).toEqual(cardsBefore.englishCards);
    expect(miss.state.board.queuedWords).toEqual(cardsBefore.queuedWords);
    expect(miss.state.selectedPortugueseId).toBeNull();
    expect(miss.state.selectedEnglishId).toBeNull();
    expect(miss.effects.map((effect) => effect.type)).toEqual(["attempt", "announce"]);
    expect(attemptsOf(miss.effects)).toEqual([
      {
        attemptId: "miss-1",
        promptWordId: portuguese,
        selectedWordId: english,
        isCorrect: false,
        responseTimeMs: 500,
      },
    ]);
  });

  it("does not reveal the right answer in the feedback, the announcement or the card states", () => {
    const state = readyBoard();
    const { portuguese, english } = wrongPair(state);
    const englishOfPrompt = state.board.englishCards.find((card) => card.wordId === portuguese);
    const half = select(state, portuguese, "portuguese", 1_400).state;
    const miss = select(half, english, "english", 1_900);

    const announcement = miss.effects.find((effect) => effect.type === "announce");
    const feedback = pairBoardFeedbackView(miss.state.feedback);
    const text = `${announcement?.type === "announce" ? announcement.message : ""} ${feedback?.title} ${feedback?.detail}`;

    expect(englishOfPrompt).toBeDefined();
    expect(text).not.toContain(englishOfPrompt?.text ?? "never");
    const correctEnglishCard = englishOfPrompt;
    if (correctEnglishCard === undefined) {
      throw new Error("prompt word has no english card");
    }
    expect(pairBoardCardView(miss.state, correctEnglishCard).status).toBe("idle");
  });

  it("starts a new count with the first tap after a miss", () => {
    let state = readyBoard();
    const { portuguese, english } = wrongPair(state);

    state = select(state, portuguese, "portuguese", 1_400).state;
    state = select(state, english, "english", 1_900).state;
    state = select(state, portuguese, "portuguese", 2_500).state;
    const hit = select(state, portuguese, "english", 3_000);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(500);
  });
});

describe("pair board state: response time (measurement version 2)", () => {
  it("measures from the first tap to the closing tap, not from the pair entry", () => {
    let state = readyBoard(20, 0);
    const [wordId] = visibleIds(state);

    state = select(state, wordId, "portuguese", 1_000).state;
    const hit = select(state, wordId, "english", 1_375);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(375);
  });

  it("keeps the first tap when the selection is swapped in the same language", () => {
    let state = readyBoard(20, 0);
    const [first, second] = visibleIds(state);

    state = select(state, first, "portuguese", 1_000).state;
    state = select(state, second, "portuguese", 1_200).state;
    const hit = select(state, second, "english", 1_500);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(500);
  });

  it("accepts the english side as the first tap", () => {
    let state = readyBoard(20, 0);
    const [wordId] = visibleIds(state);

    state = select(state, wordId, "english", 4_000).state;
    const hit = select(state, wordId, "portuguese", 4_600);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(600);
  });

  it("restarts the count when the only selected card is tapped again", () => {
    let state = readyBoard(20, 0);
    const [wordId] = visibleIds(state);

    state = select(state, wordId, "portuguese", 1_000).state;
    state = select(state, wordId, "portuguese", 1_500).state;
    state = select(state, wordId, "portuguese", 3_000).state;
    const hit = select(state, wordId, "english", 3_200);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(200);
  });

  it("measures a replacement pair from its own first tap", () => {
    let state = readyBoard(20, 1_000);
    const [first] = visibleIds(state);
    const replacement = state.board.queuedWords[0].id;

    state = select(state, first, "portuguese", 2_000).state;
    state = select(state, first, "english", 2_100).state;
    state = select(state, replacement, "english", 2_700).state;
    const hit = select(state, replacement, "portuguese", 2_850);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(150);
  });

  it("rounds to whole milliseconds and never goes negative", () => {
    let state = readyBoard(20, 0);
    const [wordId] = visibleIds(state);

    state = select(state, wordId, "portuguese", 1_000.4).state;
    const hit = select(state, wordId, "english", 900);

    expect(attemptsOf(hit.effects)[0]?.responseTimeMs).toBe(0);
  });
});

describe("pair board state: disabled", () => {
  it("blocks new selections while disabled", () => {
    const state = setPairBoardDisabled(readyBoard(), true);
    const [wordId] = visibleIds(state);

    const next = select(state, wordId, "portuguese", 1_100);

    expect(next.state).toBe(state);
    expect(next.effects).toEqual([]);
  });

  it("drops a half-made selection when disabled and accepts taps again when re-enabled", () => {
    const state = readyBoard();
    const [wordId] = visibleIds(state);
    const half = select(state, wordId, "portuguese", 1_100).state;

    const disabled = setPairBoardDisabled(half, true);
    const enabled = setPairBoardDisabled(disabled, false);

    expect(disabled.selectedPortugueseId).toBeNull();
    expect(select(enabled, wordId, "portuguese", 1_300).state.selectedPortugueseId).toBe(wordId);
  });

  it("shows every card as unavailable while disabled", () => {
    const state = setPairBoardDisabled(readyBoard(), true);

    for (const card of state.board.portugueseCards) {
      expect(pairBoardCardView(state, card).status).toBe("disabled");
    }
  });
});

describe("pair board state: feedback copy", () => {
  it("distinguishes hit and miss by icon and text, not only colour", () => {
    expect(PAIR_BOARD_FEEDBACK.correct.icon).not.toBe(PAIR_BOARD_FEEDBACK.incorrect.icon);
    expect(PAIR_BOARD_FEEDBACK.correct.title).not.toBe(PAIR_BOARD_FEEDBACK.incorrect.title);
    expect(PAIR_BOARD_FEEDBACK.correct.icon.trim()).not.toBe("");
    expect(PAIR_BOARD_FEEDBACK.incorrect.icon.trim()).not.toBe("");
  });

  it("announces a hit with the matched pair", () => {
    let state = readyBoard();
    const [wordId] = visibleIds(state);
    state = select(state, wordId, "portuguese", 1_100).state;

    const hit = select(state, wordId, "english", 1_200);

    expect(hit.effects.at(-1)).toEqual({
      type: "announce",
      message: `Acertou: ${wordId.replace("word", "english")} é ${wordId.replace("word", "portuguese")}.`,
    });
    expect(pairBoardFeedbackView(hit.state.feedback)).toEqual({
      tone: "correct",
      icon: PAIR_BOARD_FEEDBACK.correct.icon,
      title: PAIR_BOARD_FEEDBACK.correct.title,
      detail: `${wordId.replace("word", "english")} é ${wordId.replace("word", "portuguese")}`,
    });
  });

  it("announces a miss without the answer and asks to try again", () => {
    let state = readyBoard();
    const { portuguese, english } = wrongPair(state);
    state = select(state, portuguese, "portuguese", 1_100).state;

    const miss = select(state, english, "english", 1_200);

    expect(miss.effects.at(-1)).toEqual({
      type: "announce",
      message: "Não combina. Tente de novo.",
    });
    expect(pairBoardFeedbackView(miss.state.feedback)).toEqual({
      tone: "incorrect",
      icon: PAIR_BOARD_FEEDBACK.incorrect.icon,
      title: PAIR_BOARD_FEEDBACK.incorrect.title,
      detail: "Tente de novo.",
    });
  });

  it("clears only the feedback it was scheduled for", () => {
    let state = readyBoard();
    const [first, second] = visibleIds(state);
    state = select(state, first, "portuguese", 1_100).state;
    state = select(state, second, "english", 1_200).state;
    const firstFeedback = state.feedback;
    state = select(state, first, "portuguese", 1_300).state;
    state = select(state, first, "english", 1_400).state;

    const stale = clearPairBoardFeedback(state, firstFeedback?.id ?? -1);
    const current = clearPairBoardFeedback(state, state.feedback?.id ?? -1);

    expect(stale.feedback?.tone).toBe("correct");
    expect(current.feedback).toBeNull();
    expect(pairBoardFeedbackView(current.feedback)).toBeNull();
  });

  it("marks the two cards of a miss until the feedback is cleared or a new tap starts", () => {
    let state = readyBoard();
    const { portuguese, english } = wrongPair(state);
    state = select(state, portuguese, "portuguese", 1_100).state;
    state = select(state, english, "english", 1_200).state;
    const promptCard = state.board.portugueseCards.find((card) => card.wordId === portuguese);
    if (promptCard === undefined) {
      throw new Error("missing card");
    }

    expect(pairBoardCardView(state, promptCard).status).toBe("incorrect");
    const tapped = select(state, english, "english", 1_300).state;
    expect(pairBoardCardView(tapped, promptCard).status).toBe("idle");
  });
});

describe("pair board state: accessibility", () => {
  it("names language, text and state on every card", () => {
    let state = readyBoard();
    const [wordId] = visibleIds(state);
    state = select(state, wordId, "portuguese", 1_100).state;
    const selected = state.board.portugueseCards.find((card) => card.wordId === wordId);
    const idle = state.board.englishCards.find((card) => card.wordId === wordId);
    if (selected === undefined || idle === undefined) {
      throw new Error("missing card");
    }

    expect(pairBoardCardView(state, selected)).toEqual({
      status: "selected",
      selected: true,
      disabled: false,
      text: selected.text,
      accessibilityLabel: `Português: ${selected.text}. Selecionado.`,
    });
    expect(pairBoardCardView(state, idle)).toEqual({
      status: "idle",
      selected: false,
      disabled: false,
      text: idle.text,
      accessibilityLabel: `Inglês: ${idle.text}. Não selecionado.`,
    });
  });

  it("names the miss and unavailable states", () => {
    let state = readyBoard();
    const { portuguese, english } = wrongPair(state);
    state = select(state, portuguese, "portuguese", 1_100).state;
    state = select(state, english, "english", 1_200).state;
    const missed = state.board.englishCards.find((card) => card.wordId === english);
    if (missed === undefined) {
      throw new Error("missing card");
    }

    expect(pairBoardCardView(state, missed).accessibilityLabel).toBe(
      `Inglês: ${missed.text}. Não combinou.`,
    );
    expect(pairBoardCardView(setPairBoardDisabled(state, true), missed).accessibilityLabel).toBe(
      `Inglês: ${missed.text}. Indisponível.`,
    );
  });

  it("uses the entry's 44 pt minimum touch target", () => {
    expect(PAIR_BOARD_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
    expect(PAIR_BOARD_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});

describe("pair board boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");
  const stateFile = "src/lib/presentation/game/pair-board-state.ts";
  const componentFile = "src/components/game/pair-board.tsx";

  it("keeps the board state free of React, React Native and Expo", () => {
    const source = read(stateFile);

    expect(source).not.toMatch(/from\s+["'](react|react-native|expo[^"']*)["']/);
    expect(source).toContain("resolveBoardSelection");
    expect(source).toContain("createGameBoard");
  });

  it("does not let the component know composition, repository, session or scoring", () => {
    const source = read(componentFile);

    expect(source).not.toMatch(/@\/composition/);
    expect(source).not.toMatch(/@\/persistence/);
    expect(source).not.toMatch(/game-session|fixed-challenge|scoring|expo-sqlite|expo-crypto/);
    expect(source).not.toMatch(/import\s*\(/);
    expect(source).toMatch(/import\s*\{[^}]*\bAccessibilityInfo\b[^}]*\}\s*from\s*"react-native"/);
  });

  it("decides hit and miss only through resolveBoardSelection", () => {
    for (const file of [stateFile, componentFile]) {
      const source = read(file);
      expect(source).not.toMatch(/promptWordId\s*[!=]==|[!=]==\s*\w*\.?selectedWordId/);
      expect(source).not.toMatch(/selectedPortugueseId\s*[!=]==\s*\w*\.?selectedEnglishId/);
    }
  });
});
