import { describe, expect, it } from "vitest";

import {
  PairBoardController,
  type PairBoardAttempt,
  type PairBoardState,
} from "@/lib/presentation/game/pair-board-state";
import { BOARD_PAIR_LIMIT } from "@/lib/domain/game/types";

import { SequenceRandom, makeWords } from "../../unit/domain/game/fixtures";

interface Recorded {
  readonly ready: (readonly string[])[];
  readonly entered: (readonly string[])[];
  readonly attempts: PairBoardAttempt[];
  readonly announcements: string[];
  readonly states: PairBoardState[];
}

function setup() {
  let nowMs = 0;
  let attemptCounter = 0;
  const recorded: Recorded = { ready: [], entered: [], attempts: [], announcements: [], states: [] };
  const controller = new PairBoardController({
    words: makeWords(20),
    random: new SequenceRandom([0.42, 0.13, 0.77, 0.58, 0.05, 0.91, 0.36, 0.64, 0.27, 0.83]),
    now: () => nowMs,
    createAttemptId: () => {
      attemptCounter += 1;
      return `attempt-${attemptCounter}`;
    },
    announce: (message) => recorded.announcements.push(message),
    onChange: (state) => recorded.states.push(state),
  });
  controller.setCallbacks({
    onReady: (wordIds) => recorded.ready.push(wordIds),
    onPairsEntered: (wordIds) => recorded.entered.push(wordIds),
    onAttempt: (attempt) => {
      recorded.attempts.push(attempt);
      return new Promise<void>(() => undefined);
    },
  });
  return {
    controller,
    recorded,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("pair board: 20 hits with misses in between", () => {
  it("empties the queue, reports attempts in order and becomes ready once", () => {
    const { controller, recorded, advance } = setup();
    controller.ready();
    controller.ready();
    const exposed = new Set<string>(recorded.ready[0]);
    const expected: { promptWordId: string; selectedWordId: string; isCorrect: boolean }[] = [];

    for (let round = 0; round < 20; round += 1) {
      const { board } = controller.state;
      expect(board.portugueseCards.length).toBeLessThanOrEqual(BOARD_PAIR_LIMIT);
      const target = board.portugueseCards[0].wordId;
      const other = board.englishCards.find((card) => card.wordId !== target);
      if (round % 3 === 0 && other !== undefined) {
        advance(400);
        controller.select(target, "portuguese");
        advance(300);
        controller.select(other.wordId, "english");
        expected.push({ promptWordId: target, selectedWordId: other.wordId, isCorrect: false });
      }
      advance(500);
      controller.select(target, "english");
      advance(250);
      controller.select(target, "portuguese");
      expected.push({ promptWordId: target, selectedWordId: target, isCorrect: true });
      for (const wordId of recorded.entered.at(-1) ?? []) {
        exposed.add(wordId);
      }
    }

    const finalBoard = controller.state.board;
    expect(finalBoard.queuedWords).toEqual([]);
    expect(finalBoard.portugueseCards).toEqual([]);
    expect(finalBoard.englishCards).toEqual([]);
    expect(finalBoard.completedWordIds).toHaveLength(20);
    expect(recorded.ready).toHaveLength(1);
    expect(recorded.ready[0]).toHaveLength(BOARD_PAIR_LIMIT);
    expect(recorded.entered.flat()).toHaveLength(15);
    expect(exposed.size).toBe(20);
    expect(
      recorded.attempts.map(({ promptWordId, selectedWordId, isCorrect }) => ({
        promptWordId,
        selectedWordId,
        isCorrect,
      })),
    ).toEqual(expected);
    expect(recorded.attempts.map((attempt) => attempt.attemptId)).toEqual(
      expected.map((_, index) => `attempt-${index + 1}`),
    );
    expect(recorded.attempts.every((attempt) => attempt.responseTimeMs >= 0)).toBe(true);
    expect(recorded.announcements).toHaveLength(expected.length);
  });

  it("stops accepting taps while disabled", () => {
    const { controller, recorded } = setup();
    controller.ready();
    controller.setDisabled(true);
    const [card] = controller.state.board.portugueseCards;

    controller.select(card.wordId, "portuguese");
    controller.select(card.wordId, "english");

    expect(recorded.attempts).toEqual([]);
    expect(controller.state.selectedPortugueseId).toBeNull();
  });
});
