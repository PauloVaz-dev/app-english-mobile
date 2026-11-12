import { InvalidLearningSnapshotError } from "./errors";
import { createLearningProgressSnapshot } from "./progress-metrics";
import type { LearningProgressSnapshot } from "./types";

export interface AttemptProgressInput {
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export function applyAttemptToProgress(
  current: LearningProgressSnapshot | null,
  input: AttemptProgressInput,
): LearningProgressSnapshot {
  const snapshot = current ?? emptyProgress();
  if (!input.isCorrect) {
    return createLearningProgressSnapshot({
      ...snapshot,
      wrongCount: snapshot.wrongCount + 1,
    });
  }
  return createLearningProgressSnapshot({
    ...snapshot,
    correctCount: snapshot.correctCount + 1,
    totalCorrectResponseTimeMs: snapshot.totalCorrectResponseTimeMs + input.responseTimeMs,
  });
}

function emptyProgress(): LearningProgressSnapshot {
  return createLearningProgressSnapshot({
    timesShown: 0,
    correctCount: 0,
    wrongCount: 0,
    totalCorrectResponseTimeMs: 0,
  });
}

export function assertAttemptProgressAllowed(
  current: LearningProgressSnapshot | null,
  input: AttemptProgressInput,
): void {
  const timesShown = current?.timesShown ?? 0;
  if (timesShown === 0) {
    throw new InvalidLearningSnapshotError("Attempts require at least one recorded exposure.");
  }
  if (!input.isCorrect && timesShown === 0) {
    throw new InvalidLearningSnapshotError("Wrong answers require at least one recorded exposure.");
  }
}
