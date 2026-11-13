import { describe, expect, it } from "vitest";

import type { AttemptResult, GameAttempt } from "@/lib/domain/game/types";
import { applyMatchingReview } from "@/lib/domain/learning/matching-review";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";

const occurredAt = new Date("2026-09-24T12:00:00.000Z");
const tomorrow = new Date("2026-09-25T00:00:00.000Z");

function attempt(input: Partial<GameAttempt> = {}): GameAttempt {
  return {
    attemptId: "a",
    promptWordId: "w",
    selectedWordId: "w",
    isCorrect: true,
    responseTimeMs: 800,
    occurredAt,
    ...input,
  };
}

function result(
  current: GameAttempt,
  completedWords = 3,
  targetWords = 20,
): AttemptResult {
  return {
    attempt: current,
    isCorrect: current.isCorrect,
    completedWordId: current.isCorrect ? current.promptWordId : null,
    revealedExposure: null,
    metrics: {
      status: completedWords === targetWords ? "COMPLETED" : "ACTIVE",
      targetWords,
      completedWords,
      correctAnswers: completedWords,
      wrongAnswers: 0,
      accuracy: 100,
      averageResponseTimeMs: 800,
      durationMs: 1_000,
    },
    result: null,
  };
}

function schedule(input: Partial<ReviewSchedule> = {}): ReviewSchedule {
  return {
    state: "LEARNING",
    repetitions: 1,
    lapses: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewAt: occurredAt,
    ...input,
  };
}

function apply(
  current: ReviewSchedule | null,
  attemptResult: AttemptResult,
  previousAttempts: readonly GameAttempt[] = [],
) {
  return applyMatchingReview({
    current,
    previousAttempts,
    result: attemptResult,
    timeZone: "UTC",
  });
}

describe("applyMatchingReview", () => {
  it("never grades a recognized pair above GOOD", () => {
    const next = apply(null, result(attempt({ responseTimeMs: 400 })));

    expect(next).toMatchObject({ intervalDays: 1, easeFactor: 2.5 });
  });

  it("grades the last pair on the board at most HARD", () => {
    const next = apply(
      schedule({ state: "REVIEW", repetitions: 2, intervalDays: 6 }),
      result(attempt({ responseTimeMs: 400 }), 20, 20),
    );

    expect(next).toMatchObject({ intervalDays: 7, easeFactor: 2.35 });
  });

  it("schedules a miss for the next local day", () => {
    const next = apply(null, result(attempt({ isCorrect: false, selectedWordId: "x" })));

    expect(next).toMatchObject({ state: "LEARNING", nextReviewAt: tomorrow });
  });

  it("leaves the schedule untouched for a word that is not due yet", () => {
    const notDue = schedule({ nextReviewAt: tomorrow });

    expect(apply(notDue, result(attempt({ isCorrect: false })))).toBeNull();
  });

  it("does not grade a word again after its first outcome in the session", () => {
    const miss = attempt({ attemptId: "m", isCorrect: false, selectedWordId: "x" });

    expect(apply(schedule(), result(attempt()), [miss])).toBeNull();
  });
});
