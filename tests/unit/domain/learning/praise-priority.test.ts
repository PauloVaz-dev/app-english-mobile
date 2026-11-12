import { describe, expect, it } from "vitest";

import { InvalidReviewCandidateError } from "@/lib/domain/learning/errors";
import { selectPraisePriority } from "@/lib/domain/learning/praise-priority";
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

describe("praise priority", () => {
  it("keeps words with zero errors and a correct response within two seconds", () => {
    const result = selectPraisePriority([
      candidate({ wordId: "zero", english: "zero", timeToCorrectMs: 0 }),
      candidate({ wordId: "boundary", english: "boundary", timeToCorrectMs: 2_000 }),
      candidate({ wordId: "over", english: "over", timeToCorrectMs: 2_001 }),
      candidate({ wordId: "wrong", english: "wrong", wrongAnswers: 1, timeToCorrectMs: 400 }),
      candidate({ wordId: "unfinished", english: "unfinished", timeToCorrectMs: null }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["zero", "boundary"]);
  });

  it("excludes any error even when the correct response is fast", () => {
    const result = selectPraisePriority([
      candidate({ wordId: "clean", english: "clean", wrongAnswers: 0, timeToCorrectMs: 900 }),
      candidate({ wordId: "once", english: "once", wrongAnswers: 1, timeToCorrectMs: 100 }),
      candidate({ wordId: "twice", english: "twice", wrongAnswers: 2, timeToCorrectMs: 0 }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["clean"]);
  });

  it("orders by fastest time, then English NFKD, then wordId", () => {
    const result = selectPraisePriority([
      candidate({ wordId: "z", english: "zebra", timeToCorrectMs: 800 }),
      candidate({ wordId: "accent", english: "café", timeToCorrectMs: 800 }),
      candidate({ wordId: "plain", english: "cafe", timeToCorrectMs: 800 }),
      candidate({ wordId: "b", english: "apple", timeToCorrectMs: 400 }),
      candidate({ wordId: "a", english: "apple", timeToCorrectMs: 400 }),
    ]);
    expect(result.map(({ wordId }) => wordId)).toEqual(["a", "b", "plain"]);
  });

  it("returns the same ranking for the same candidates", () => {
    const input = [
      candidate({ wordId: "slow", english: "slow", timeToCorrectMs: 1_800 }),
      candidate({ wordId: "fast", english: "fast", timeToCorrectMs: 200 }),
      candidate({ wordId: "mid", english: "mid", timeToCorrectMs: 900 }),
    ];
    expect(selectPraisePriority(input)).toEqual(selectPraisePriority([...input].reverse()));
  });

  it("returns at most three immutable copies without mutating the input", () => {
    const input = [
      candidate({ wordId: "1", english: "one", timeToCorrectMs: 100 }),
      candidate({ wordId: "2", english: "two", timeToCorrectMs: 200 }),
      candidate({ wordId: "3", english: "three", timeToCorrectMs: 300 }),
      candidate({ wordId: "4", english: "four", timeToCorrectMs: 400 }),
    ];
    const originalOrder = input.map(({ wordId }) => wordId);
    const result = selectPraisePriority(input);
    expect(result).toHaveLength(3);
    expect(result.map(({ wordId }) => wordId)).toEqual(["1", "2", "3"]);
    expect(input.map(({ wordId }) => wordId)).toEqual(originalOrder);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
  });

  it("rejects duplicate word ids", () => {
    expect(() =>
      selectPraisePriority([
        candidate({ wordId: "same" }),
        candidate({ wordId: "same", english: "other" }),
      ]),
    ).toThrow(InvalidReviewCandidateError);
  });

  it.each([
    candidate({ wordId: "" }),
    candidate({ english: " " }),
    candidate({ portuguese: "" }),
    candidate({ wrongAnswers: -1 }),
    candidate({ wrongAnswers: 1.5 }),
    candidate({ timeToCorrectMs: -1 }),
    candidate({ difficulty: "UNKNOWN" as never }),
  ])("rejects an invalid praise candidate", (input) => {
    expect(() => selectPraisePriority([input])).toThrow(
      InvalidReviewCandidateError,
    );
  });
});
