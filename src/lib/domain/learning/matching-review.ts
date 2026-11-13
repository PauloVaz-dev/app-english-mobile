import type { AttemptResult, GameAttempt } from "@/lib/domain/game/types";

import {
  capReviewGrade,
  isReviewDue,
  type ReviewGrade,
  type ReviewSchedule,
  resolveSessionReviewGrade,
  scheduleReview,
} from "./review-schedule";

/** Recognizing a pair is weaker evidence than recalling the word. */
export const MATCHING_MAX_GRADE: ReviewGrade = "GOOD";
/** The last pair on the board can be solved by elimination. */
export const LAST_PAIR_MAX_GRADE: ReviewGrade = "HARD";

export interface MatchingReviewInput {
  readonly current: ReviewSchedule | null;
  readonly previousAttempts: readonly GameAttempt[];
  readonly result: AttemptResult;
  readonly timeZone: string;
}

/**
 * Returns the schedule after a Matching Game attempt, or `null` when the
 * attempt must not move the schedule: a later outcome of a word already
 * graded in the session, or a word whose review is not due yet (it only
 * filled the board). Since every grade pushes the next review to a later
 * local day, a word is graded at most once per day.
 */
export function applyMatchingReview(
  input: MatchingReviewInput,
): ReviewSchedule | null {
  const reviewedAt = input.result.attempt.occurredAt;
  if (input.current && !isReviewDue(input.current, reviewedAt)) {
    return null;
  }
  const grade = resolveSessionReviewGrade(
    input.previousAttempts,
    input.result.attempt,
  );
  if (grade === null) {
    return null;
  }
  const max = isLastPairOnBoard(input.result)
    ? LAST_PAIR_MAX_GRADE
    : MATCHING_MAX_GRADE;
  return scheduleReview(
    input.current,
    capReviewGrade(grade, max),
    reviewedAt,
    input.timeZone,
  );
}

/**
 * The board refills after every match, so a single pair is left only when
 * the correct answer completes the session.
 */
function isLastPairOnBoard(result: AttemptResult): boolean {
  return (
    result.isCorrect &&
    result.metrics.completedWords === result.metrics.targetWords
  );
}
