import {
  calculateProgressMetrics,
  createLearningProgressSnapshot,
} from "./progress-metrics";
import type { Difficulty, LearningProgressSnapshot } from "./types";

export const MINIMUM_DIFFICULTY_EXPOSURES = 3;
export const HARD_ACCURACY_THRESHOLD = 0.7;
export const EASY_ACCURACY_THRESHOLD = 0.9;
export const EASY_AVERAGE_RESPONSE_TIME_MS = 2_000;
export const HARD_AVERAGE_RESPONSE_TIME_MS = 5_000;

export function classifyDifficulty(
  input: LearningProgressSnapshot,
): Difficulty | null {
  const snapshot = createLearningProgressSnapshot(input);
  if (snapshot.timesShown < MINIMUM_DIFFICULTY_EXPOSURES) {
    return null;
  }
  const metrics = calculateProgressMetrics(snapshot);
  if (
    metrics.accuracy < HARD_ACCURACY_THRESHOLD ||
    (metrics.averageCorrectResponseTimeMs !== null &&
      metrics.averageCorrectResponseTimeMs > HARD_AVERAGE_RESPONSE_TIME_MS)
  ) {
    return "HARD";
  }
  if (
    metrics.accuracy >= EASY_ACCURACY_THRESHOLD &&
    metrics.averageCorrectResponseTimeMs !== null &&
    metrics.averageCorrectResponseTimeMs <= EASY_AVERAGE_RESPONSE_TIME_MS
  ) {
    return "EASY";
  }
  return "NORMAL";
}
