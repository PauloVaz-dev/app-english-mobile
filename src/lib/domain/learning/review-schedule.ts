import { InvalidReviewScheduleError } from "./errors";
import { startOfLocalDay } from "./local-day";

export const REVIEW_GRADES = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

/** A word without a schedule is NEW; a scheduled word is LEARNING or REVIEW. */
export const REVIEW_STATES = ["LEARNING", "REVIEW"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export type LearningState = "NEW" | ReviewState;

/** Consecutive successful reviews needed to move from LEARNING to REVIEW. */
export const REVIEW_STATE_REPETITIONS = 2;

export const INITIAL_EASE_FACTOR = 2.5;
export const MINIMUM_EASE_FACTOR = 1.3;
export const EASE_FACTOR_STEPS = {
  AGAIN: -0.2,
  HARD: -0.15,
  GOOD: 0,
  EASY: 0.15,
} as const;
export const HARD_GRADE_RESPONSE_TIME_MS = 5_000;
export const EASY_GRADE_RESPONSE_TIME_MS = 2_000;
export const HARD_INTERVAL_MULTIPLIER = 1.2;
export const EASY_BONUS_MULTIPLIER = 1.3;
const FIRST_INTERVAL_DAYS = { HARD: 1, GOOD: 1, EASY: 4 } as const;
const SECOND_INTERVAL_DAYS = { HARD: 6, GOOD: 6, EASY: 8 } as const;
const AGAIN_INTERVAL_DAYS = 1;

export interface ReviewSchedule {
  readonly state: ReviewState;
  readonly repetitions: number;
  readonly lapses: number;
  readonly intervalDays: number;
  readonly easeFactor: number;
  readonly nextReviewAt: Date;
}

export interface ReviewAttempt {
  readonly promptWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export function gradeAttempt(attempt: ReviewAttempt): ReviewGrade {
  if (!attempt.isCorrect) {
    return "AGAIN";
  }
  if (attempt.responseTimeMs > HARD_GRADE_RESPONSE_TIME_MS) {
    return "HARD";
  }
  return attempt.responseTimeMs < EASY_GRADE_RESPONSE_TIME_MS ? "EASY" : "GOOD";
}

/**
 * Only the first outcome of a word within a session moves its schedule:
 * a first-try miss counts once as AGAIN, and a later correct match of that
 * same word keeps it due so the next session brings it back.
 */
export function resolveSessionReviewGrade(
  previousAttempts: readonly ReviewAttempt[],
  attempt: ReviewAttempt,
): ReviewGrade | null {
  const missedBefore = previousAttempts.some(
    (previous) => previous.promptWordId === attempt.promptWordId && !previous.isCorrect,
  );
  return missedBefore ? null : gradeAttempt(attempt);
}

/** Lowers a grade to `max` when the evidence cannot support a higher one. */
export function capReviewGrade(grade: ReviewGrade, max: ReviewGrade): ReviewGrade {
  return REVIEW_GRADES.indexOf(grade) > REVIEW_GRADES.indexOf(max) ? max : grade;
}

export function learningStateOf(schedule: ReviewSchedule | null): LearningState {
  return schedule?.state ?? "NEW";
}

/**
 * Next review dates are the start of a local calendar day in `timeZone`, so a
 * word scheduled "in 1 day" is due from the learner's next midnight on.
 */
export function scheduleReview(
  current: ReviewSchedule | null,
  grade: ReviewGrade,
  reviewedAt: Date,
  timeZone: string,
): ReviewSchedule {
  if (!REVIEW_GRADES.includes(grade)) {
    throw new InvalidReviewScheduleError(`Unknown review grade: ${grade}.`);
  }
  const previous = current ?? initialSchedule(reviewedAt);
  const easeFactor = Math.max(
    MINIMUM_EASE_FACTOR,
    roundEase(previous.easeFactor + EASE_FACTOR_STEPS[grade]),
  );
  if (grade === "AGAIN") {
    return Object.freeze({
      state: "LEARNING",
      repetitions: 0,
      lapses: previous.state === "REVIEW" ? previous.lapses + 1 : previous.lapses,
      intervalDays: AGAIN_INTERVAL_DAYS,
      easeFactor,
      nextReviewAt: startOfLocalDay(reviewedAt, timeZone, AGAIN_INTERVAL_DAYS),
    });
  }
  const intervalDays = nextIntervalDays(previous, grade);
  const repetitions = previous.repetitions + 1;
  return Object.freeze({
    state:
      previous.state === "REVIEW" || repetitions >= REVIEW_STATE_REPETITIONS
        ? "REVIEW"
        : "LEARNING",
    repetitions,
    lapses: previous.lapses,
    intervalDays,
    easeFactor,
    nextReviewAt: startOfLocalDay(reviewedAt, timeZone, intervalDays),
  });
}

export function isReviewDue(schedule: ReviewSchedule, now: Date): boolean {
  return schedule.nextReviewAt.getTime() <= now.getTime();
}

function nextIntervalDays(previous: ReviewSchedule, grade: Exclude<ReviewGrade, "AGAIN">): number {
  if (previous.repetitions === 0) {
    return FIRST_INTERVAL_DAYS[grade];
  }
  if (previous.repetitions === 1) {
    return SECOND_INTERVAL_DAYS[grade];
  }
  const multiplier =
    grade === "HARD"
      ? HARD_INTERVAL_MULTIPLIER
      : grade === "EASY"
        ? previous.easeFactor * EASY_BONUS_MULTIPLIER
        : previous.easeFactor;
  return Math.max(previous.intervalDays + 1, Math.round(previous.intervalDays * multiplier));
}

function initialSchedule(reviewedAt: Date): ReviewSchedule {
  return {
    state: "LEARNING",
    repetitions: 0,
    lapses: 0,
    intervalDays: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    nextReviewAt: reviewedAt,
  };
}

function roundEase(value: number): number {
  return Math.round(value * 100) / 100;
}
