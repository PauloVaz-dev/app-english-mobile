import { describe, expect, it } from "vitest";

import { InvalidReviewCandidateError } from "@/lib/domain/learning/errors";
import { selectReviewPriority } from "@/lib/domain/learning/review-priority";
import type { ReviewCandidate } from "@/lib/domain/learning/types";

function candidate(input: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    wordId: "word-1",
    english: "house",
    portuguese: "casa",
    wrongAnswers: 0,
    timeToCorrectMs: 1_000,
    difficulty: null,
    ...input,
  };
}

describe("review priority", () => {
  it("keeps words with an error or a correct response above five seconds", () => {
    const result = selectReviewPriority([
      candidate({ wordId: "fast", english: "fast" }),
      candidate({ wordId: "boundary", english: "boundary", timeToCorrectMs: 5_000 }),
      candidate({ wordId: "slow", english: "slow", timeToCorrectMs: 5_001 }),
      candidate({ wordId: "wrong", english: "wrong", wrongAnswers: 1 }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["wrong", "slow"]);
  });

  it("orders by errors, then time to correct, then English alphabetically", () => {
    const result = selectReviewPriority([
      candidate({ wordId: "z", english: "zebra", wrongAnswers: 2, timeToCorrectMs: 4_000 }),
      candidate({ wordId: "a", english: "Apple", wrongAnswers: 2, timeToCorrectMs: 4_000 }),
      candidate({ wordId: "slow", english: "slow", wrongAnswers: 2, timeToCorrectMs: 7_000 }),
      candidate({ wordId: "many", english: "many", wrongAnswers: 3, timeToCorrectMs: 1_000 }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["many", "slow", "a"]);
  });

  it("preserves null time for unfinished words and ranks it after a measured tie", () => {
    const result = selectReviewPriority([
      candidate({ wordId: "unfinished", english: "alpha", wrongAnswers: 1, timeToCorrectMs: null }),
      candidate({ wordId: "finished", english: "zulu", wrongAnswers: 1, timeToCorrectMs: 1_000 }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["finished", "unfinished"]);
    expect(result[1].timeToCorrectMs).toBeNull();
  });

  it("returns at most three immutable copies without mutating the input", () => {
    const input = [
      candidate({ wordId: "1", english: "one", wrongAnswers: 4 }),
      candidate({ wordId: "2", english: "two", wrongAnswers: 3 }),
      candidate({ wordId: "3", english: "three", wrongAnswers: 2 }),
      candidate({ wordId: "4", english: "four", wrongAnswers: 1 }),
    ];
    const originalOrder = input.map(({ wordId }) => wordId);
    const result = selectReviewPriority(input);
    expect(result).toHaveLength(3);
    expect(input.map(({ wordId }) => wordId)).toEqual(originalOrder);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    candidate({ wordId: "", wrongAnswers: 1 }),
    candidate({ english: " ", wrongAnswers: 1 }),
    candidate({ wrongAnswers: -1 }),
    candidate({ wrongAnswers: 1.5 }),
    candidate({ wrongAnswers: 1, timeToCorrectMs: -1 }),
    candidate({ wrongAnswers: 1, difficulty: "UNKNOWN" as never }),
  ])("rejects an invalid review candidate", (input) => {
    expect(() => selectReviewPriority([input])).toThrow(InvalidReviewCandidateError);
  });
});
