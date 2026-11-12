import { describe, expect, it } from "vitest";

import { InvalidLearningSnapshotError } from "@/lib/domain/learning/errors";
import {
  applyAttemptToProgress,
  assertAttemptProgressAllowed,
} from "@/lib/domain/learning/attempt-progress";
import { createLearningProgressSnapshot } from "@/lib/domain/learning/progress-metrics";

describe("applyAttemptToProgress", () => {
  const exposed = createLearningProgressSnapshot({
    timesShown: 2,
    correctCount: 1,
    wrongCount: 0,
    totalCorrectResponseTimeMs: 900,
  });

  it("increments wrong count without touching correct time totals", () => {
    expect(
      applyAttemptToProgress(exposed, {
        isCorrect: false,
        responseTimeMs: 450,
      }),
    ).toEqual({
      timesShown: 2,
      correctCount: 1,
      wrongCount: 1,
      totalCorrectResponseTimeMs: 900,
    });
  });

  it("increments correct count and sums response time only on correct attempts", () => {
    expect(
      applyAttemptToProgress(exposed, {
        isCorrect: true,
        responseTimeMs: 1_100,
      }),
    ).toEqual({
      timesShown: 2,
      correctCount: 2,
      wrongCount: 0,
      totalCorrectResponseTimeMs: 2_000,
    });
  });

  it("starts from zero counters when progress already has exposures", () => {
    const exposed = createLearningProgressSnapshot({
      timesShown: 1,
      correctCount: 0,
      wrongCount: 0,
      totalCorrectResponseTimeMs: 0,
    });
    expect(
      applyAttemptToProgress(exposed, {
        isCorrect: true,
        responseTimeMs: 300,
      }),
    ).toEqual({
      timesShown: 1,
      correctCount: 1,
      wrongCount: 0,
      totalCorrectResponseTimeMs: 300,
    });
  });

  it("rejects attempts before any exposure exists", () => {
    expect(() =>
      assertAttemptProgressAllowed(null, {
        isCorrect: false,
        responseTimeMs: 100,
      }),
    ).toThrow(InvalidLearningSnapshotError);
    expect(() =>
      assertAttemptProgressAllowed(null, {
        isCorrect: true,
        responseTimeMs: 100,
      }),
    ).toThrow(InvalidLearningSnapshotError);
  });
});
