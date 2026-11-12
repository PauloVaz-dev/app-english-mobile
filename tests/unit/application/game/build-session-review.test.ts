import { describe, expect, it } from "vitest";

import { buildSessionReview } from "@/lib/application/game/build-session-review";
import { createLearningProgressSnapshot } from "@/lib/domain/learning/progress-metrics";

describe("buildSessionReview", () => {
  it("builds review and praise lists from the same session facts", () => {
    const progressByWordId = new Map([
      [
        "hard",
        createLearningProgressSnapshot({
          timesShown: 3,
          correctCount: 1,
          wrongCount: 2,
          totalCorrectResponseTimeMs: 9_000,
        }),
      ],
      [
        "sparse",
        createLearningProgressSnapshot({
          timesShown: 2,
          correctCount: 1,
          wrongCount: 1,
          totalCorrectResponseTimeMs: 1_000,
        }),
      ],
    ]);

    const result = buildSessionReview({
      words: [
        { wordId: "hard", english: "hard", portuguese: "dificil" },
        { wordId: "sparse", english: "sparse", portuguese: "escasso" },
        { wordId: "fast", english: "fast", portuguese: "rapido" },
        { wordId: "unfinished", english: "unfinished", portuguese: "incompleto" },
      ],
      attempts: [
        { promptWordId: "hard", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "hard", isCorrect: false, responseTimeMs: 200 },
        { promptWordId: "hard", isCorrect: true, responseTimeMs: 6_000 },
        { promptWordId: "sparse", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "sparse", isCorrect: true, responseTimeMs: 6_000 },
        { promptWordId: "fast", isCorrect: true, responseTimeMs: 400 },
        { promptWordId: "unfinished", isCorrect: false, responseTimeMs: 900 },
      ],
      progressByWordId,
    });

    expect(result.reviewWords).toEqual([
      {
        wordId: "hard",
        english: "hard",
        portuguese: "dificil",
        wrongAnswers: 2,
        timeToCorrectMs: 6_000,
        difficulty: "HARD",
      },
      {
        wordId: "sparse",
        english: "sparse",
        portuguese: "escasso",
        wrongAnswers: 1,
        timeToCorrectMs: 6_000,
        difficulty: null,
      },
      {
        wordId: "unfinished",
        english: "unfinished",
        portuguese: "incompleto",
        wrongAnswers: 1,
        timeToCorrectMs: null,
        difficulty: null,
      },
    ]);
    expect(result.praiseWords).toEqual([
      {
        wordId: "fast",
        english: "fast",
        portuguese: "rapido",
        wrongAnswers: 0,
        timeToCorrectMs: 400,
        difficulty: null,
      },
    ]);
    expect(sharedWordIds(result)).toEqual([]);
  });

  it("returns empty lists when no word is eligible for review or praise", () => {
    const result = buildSessionReview({
      words: [{ wordId: "slow", english: "slow", portuguese: "lento" }],
      attempts: [{ promptWordId: "slow", isCorrect: true, responseTimeMs: 2_001 }],
      progressByWordId: new Map(),
    });
    expect(result).toEqual({ reviewWords: [], praiseWords: [] });
  });

  it("returns only praise when the session has a fast clean hit", () => {
    const result = buildSessionReview({
      words: [{ wordId: "ok", english: "ok", portuguese: "ok" }],
      attempts: [{ promptWordId: "ok", isCorrect: true, responseTimeMs: 500 }],
      progressByWordId: new Map(),
    });
    expect(result.reviewWords).toEqual([]);
    expect(result.praiseWords).toEqual([
      {
        wordId: "ok",
        english: "ok",
        portuguese: "ok",
        wrongAnswers: 0,
        timeToCorrectMs: 500,
        difficulty: null,
      },
    ]);
  });

  it("breaks review ties by English then word id and keeps at most three items", () => {
    const result = buildSessionReview({
      words: [
        { wordId: "z", english: "zebra", portuguese: "zebra" },
        { wordId: "a", english: "Apple", portuguese: "maca" },
        { wordId: "b", english: "banana", portuguese: "banana" },
        { wordId: "c", english: "carrot", portuguese: "cenoura" },
      ],
      attempts: [
        { promptWordId: "z", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "z", isCorrect: true, responseTimeMs: 4_000 },
        { promptWordId: "a", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "a", isCorrect: true, responseTimeMs: 4_000 },
        { promptWordId: "b", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "b", isCorrect: true, responseTimeMs: 4_000 },
        { promptWordId: "c", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "c", isCorrect: true, responseTimeMs: 4_000 },
      ],
      progressByWordId: new Map(),
    });
    expect(result.reviewWords.map(({ wordId }) => wordId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(result.praiseWords).toEqual([]);
  });

  it("orders praise by time then English and keeps lists disjoint", () => {
    const result = buildSessionReview({
      words: [
        { wordId: "review", english: "review", portuguese: "revisar" },
        { wordId: "late", english: "late", portuguese: "tarde" },
        { wordId: "beta", english: "beta", portuguese: "beta" },
        { wordId: "alpha", english: "alpha", portuguese: "alfa" },
        { wordId: "gamma", english: "gamma", portuguese: "gama" },
      ],
      attempts: [
        { promptWordId: "review", isCorrect: false, responseTimeMs: 100 },
        { promptWordId: "late", isCorrect: true, responseTimeMs: 1_800 },
        { promptWordId: "beta", isCorrect: true, responseTimeMs: 400 },
        { promptWordId: "alpha", isCorrect: true, responseTimeMs: 400 },
        { promptWordId: "gamma", isCorrect: true, responseTimeMs: 900 },
      ],
      progressByWordId: new Map(),
    });
    expect(result.reviewWords.map(({ wordId }) => wordId)).toEqual(["review"]);
    expect(result.praiseWords.map(({ wordId }) => wordId)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(sharedWordIds(result)).toEqual([]);
  });
});

function sharedWordIds(result: {
  readonly reviewWords: readonly { readonly wordId: string }[];
  readonly praiseWords: readonly { readonly wordId: string }[];
}): readonly string[] {
  const reviewIds = new Set(result.reviewWords.map(({ wordId }) => wordId));
  return result.praiseWords
    .map(({ wordId }) => wordId)
    .filter((wordId) => reviewIds.has(wordId));
}
