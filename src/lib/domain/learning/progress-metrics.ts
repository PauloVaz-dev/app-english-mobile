import { InvalidLearningSnapshotError } from "./errors";
import type {
  LearningProgressMetrics,
  LearningProgressSnapshot,
} from "./types";

export function createLearningProgressSnapshot(
  input: LearningProgressSnapshot,
): LearningProgressSnapshot {
  const timesShown = requireNonNegativeInteger(input.timesShown, "timesShown");
  const correctCount = requireNonNegativeInteger(
    input.correctCount,
    "correctCount",
  );
  const wrongCount = requireNonNegativeInteger(input.wrongCount, "wrongCount");
  const totalCorrectResponseTimeMs = requireNonNegativeInteger(
    input.totalCorrectResponseTimeMs,
    "totalCorrectResponseTimeMs",
  );
  if (correctCount > timesShown) {
    throw new InvalidLearningSnapshotError(
      "Correct answers cannot exceed recorded exposures.",
    );
  }
  if (timesShown === 0 && wrongCount > 0) {
    throw new InvalidLearningSnapshotError(
      "Wrong answers require at least one recorded exposure.",
    );
  }
  if (correctCount === 0 && totalCorrectResponseTimeMs !== 0) {
    throw new InvalidLearningSnapshotError(
      "Correct response time requires at least one correct answer.",
    );
  }
  return Object.freeze({
    timesShown,
    correctCount,
    wrongCount,
    totalCorrectResponseTimeMs,
  });
}

export function calculateProgressMetrics(
  input: LearningProgressSnapshot,
): LearningProgressMetrics {
  const snapshot = createLearningProgressSnapshot(input);
  const answerCount = snapshot.correctCount + snapshot.wrongCount;
  return Object.freeze({
    accuracy: answerCount === 0 ? 0 : snapshot.correctCount / answerCount,
    averageCorrectResponseTimeMs:
      snapshot.correctCount === 0
        ? null
        : snapshot.totalCorrectResponseTimeMs / snapshot.correctCount,
  });
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidLearningSnapshotError(
      `${field} must be a non-negative safe integer.`,
    );
  }
  return value;
}
