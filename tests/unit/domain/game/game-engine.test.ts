import { describe, expect, it } from "vitest";

import { CardNotOnBoardError } from "@/lib/domain/game/errors";
import {
  createGameBoard,
  resolveBoardSelection,
  shuffle,
} from "@/lib/domain/game/game-engine";

import { makeWords, SequenceRandom } from "./fixtures";

describe("game-engine", () => {
  it("shuffles without mutating or losing values", () => {
    const source = [1, 2, 3, 4, 5];

    const shuffled = shuffle(source, new SequenceRandom([0]));

    expect(shuffled).toEqual([2, 3, 4, 5, 1]);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });

  it("creates independently shuffled columns with at most five unique pairs", () => {
    const board = createGameBoard(
      makeWords(),
      new SequenceRandom([0.15, 0.8, 0.35, 0.65]),
    );

    expect(board.portugueseCards).toHaveLength(5);
    expect(board.englishCards).toHaveLength(5);
    expect(board.queuedWords).toHaveLength(15);
    expect(new Set(board.portugueseCards.map((card) => card.wordId)).size).toBe(5);
    expect(new Set(board.englishCards.map((card) => card.wordId))).toEqual(
      new Set(board.portugueseCards.map((card) => card.wordId)),
    );
    expect(board.portugueseCards.map((card) => card.wordId)).not.toEqual(
      board.englishCards.map((card) => card.wordId),
    );
  });

  it("keeps the board unchanged after an incorrect selection", () => {
    const random = new SequenceRandom([0]);
    const board = createGameBoard(makeWords(), random);
    const before = structuredClone(board);

    const result = resolveBoardSelection(
      board,
      {
        promptWordId: board.portugueseCards[0].wordId,
        selectedWordId: board.englishCards.find(
          (card) => card.wordId !== board.portugueseCards[0].wordId,
        )!.wordId,
      },
      random,
    );

    expect(result.isCorrect).toBe(false);
    expect(result.board).toEqual(before);
  });

  it("removes a correct pair and continuously replenishes its slot", () => {
    const random = new SequenceRandom([0.4, 0.2, 0.8]);
    const board = createGameBoard(makeWords(), random);
    const matchedWordId = board.portugueseCards[0].wordId;

    const result = resolveBoardSelection(
      board,
      { promptWordId: matchedWordId, selectedWordId: matchedWordId },
      random,
    );

    expect(result.isCorrect).toBe(true);
    expect(result.completedWordId).toBe(matchedWordId);
    expect(result.board.completedWordIds).toContain(matchedWordId);
    expect(result.board.portugueseCards).toHaveLength(5);
    expect(result.board.englishCards).toHaveLength(5);
    expect(result.board.queuedWords).toHaveLength(14);
    expect(result.board.portugueseCards.some((card) => card.wordId === matchedWordId)).toBe(false);
  });

  it("eventually drains the board after all twenty correct matches", () => {
    const random = new SequenceRandom([0.1, 0.9, 0.3, 0.7]);
    let board = createGameBoard(makeWords(), random);

    for (let completed = 0; completed < 20; completed += 1) {
      const wordId = board.portugueseCards[0].wordId;
      board = resolveBoardSelection(
        board,
        { promptWordId: wordId, selectedWordId: wordId },
        random,
      ).board;
      expect(board.portugueseCards).toHaveLength(Math.min(5, 19 - completed));
    }

    expect(board.completedWordIds).toHaveLength(20);
    expect(board.queuedWords).toHaveLength(0);
    expect(board.portugueseCards).toHaveLength(0);
    expect(board.englishCards).toHaveLength(0);
  });

  it("rejects cards that are not visible on the board", () => {
    const random = new SequenceRandom([0]);
    const board = createGameBoard(makeWords(), random);

    expect(() =>
      resolveBoardSelection(
        board,
        { promptWordId: "word-20", selectedWordId: "word-20" },
        random,
      ),
    ).toThrow(CardNotOnBoardError);
  });
});
