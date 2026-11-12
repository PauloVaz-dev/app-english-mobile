import {
  collectDistinctCandidates,
  compareReviewText,
} from "./review-candidate";
import type { ReviewCandidate } from "./types";

export const DEFAULT_REVIEW_LIMIT = 3;
export const SLOW_REVIEW_RESPONSE_TIME_MS = 5_000;

export function selectReviewPriority(
  input: readonly ReviewCandidate[],
): readonly ReviewCandidate[] {
  const selected = collectDistinctCandidates(input)
    .filter(isEligibleForReview)
    .sort(compareReviewPriority)
    .slice(0, DEFAULT_REVIEW_LIMIT);
  return Object.freeze(selected);
}

function isEligibleForReview(candidate: ReviewCandidate): boolean {
  return (
    candidate.wrongAnswers > 0 ||
    (candidate.timeToCorrectMs !== null &&
      candidate.timeToCorrectMs > SLOW_REVIEW_RESPONSE_TIME_MS)
  );
}

function compareReviewPriority(
  left: ReviewCandidate,
  right: ReviewCandidate,
): number {
  const errorComparison = right.wrongAnswers - left.wrongAnswers;
  if (errorComparison !== 0) {
    return errorComparison;
  }
  const timeComparison = compareNullableTimeDescending(
    left.timeToCorrectMs,
    right.timeToCorrectMs,
  );
  if (timeComparison !== 0) {
    return timeComparison;
  }
  const englishComparison = compareReviewText(left.english, right.english);
  return englishComparison !== 0
    ? englishComparison
    : compareReviewText(left.wordId, right.wordId);
}

function compareNullableTimeDescending(
  left: number | null,
  right: number | null,
): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return right - left;
}
