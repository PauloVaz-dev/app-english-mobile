import { InvalidReviewCandidateError } from "./errors";
import { collectDistinctCandidates, compareReviewText } from "./review-candidate";
import type { ReviewCandidate } from "./types";

export const DEFAULT_PRAISE_LIMIT = 3;
export const FAST_PRAISE_RESPONSE_TIME_MS = 2_000;

export function selectPraisePriority(
  input: readonly ReviewCandidate[],
): readonly ReviewCandidate[] {
  const selected = collectDistinctCandidates(input)
    .filter(isEligibleForPraise)
    .sort(comparePraisePriority)
    .slice(0, DEFAULT_PRAISE_LIMIT);
  return Object.freeze(selected);
}

function isEligibleForPraise(candidate: ReviewCandidate): boolean {
  return (
    candidate.wrongAnswers === 0 &&
    candidate.timeToCorrectMs !== null &&
    candidate.timeToCorrectMs <= FAST_PRAISE_RESPONSE_TIME_MS
  );
}

function comparePraisePriority(left: ReviewCandidate, right: ReviewCandidate): number {
  const timeComparison = compareMeasuredTimeAscending(left.timeToCorrectMs, right.timeToCorrectMs);
  if (timeComparison !== 0) {
    return timeComparison;
  }
  const englishComparison = compareReviewText(left.english, right.english);
  return englishComparison !== 0 ? englishComparison : compareReviewText(left.wordId, right.wordId);
}

function compareMeasuredTimeAscending(left: number | null, right: number | null): number {
  if (left === null || right === null) {
    throw new InvalidReviewCandidateError("Praise ranking requires a measured time.");
  }
  return left - right;
}
