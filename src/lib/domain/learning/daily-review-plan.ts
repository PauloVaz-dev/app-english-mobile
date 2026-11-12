import { InvalidDailyReviewPlanError } from "./errors";
import { isReviewDue, REVIEW_STATES, type ReviewSchedule } from "./review-schedule";

export const DAILY_REVIEW_SESSION_LIMIT = 20;
export const DAILY_NEW_WORD_LIMIT = 10;

export interface DueReviewWord {
  readonly wordId: string;
  readonly schedule: ReviewSchedule;
}

export interface DailyReviewPlan {
  readonly typingWordIds: readonly string[];
  readonly matchingWordIds: readonly string[];
  readonly newWordIds: readonly string[];
}

export interface PlanDailyReviewInput {
  readonly due: readonly DueReviewWord[];
  readonly newCandidates: readonly string[];
  readonly introducedToday: number;
  readonly sessionLimit: number;
  readonly dailyNewLimit: number;
  readonly now: Date;
}

export function planDailyReview(input: PlanDailyReviewInput): DailyReviewPlan {
  const now = requireInstant(input.now);
  const sessionLimit = requireSessionLimit(input.sessionLimit);
  const dailyNewLimit = requireNonNegativeInteger(input.dailyNewLimit, "Daily new limit");
  const introducedToday = requireNonNegativeInteger(input.introducedToday, "Introduced today");
  const dueWords = admitDueWords(input.due, now, sessionLimit);
  const scheduledWordIds = new Set(input.due.map((item) => item.wordId));
  const openSlots = sessionLimit - dueWords.length;
  const newWordQuota = Math.max(0, dailyNewLimit - introducedToday);
  const newWordIds = admitNewWords({
    newCandidates: input.newCandidates,
    scheduledWordIds,
    openSlots,
    newWordQuota,
  });
  return freezePlan(dueWords, newWordIds);
}

function admitDueWords(
  due: readonly DueReviewWord[],
  now: Date,
  sessionLimit: number,
): DueReviewWord[] {
  requireDistinctWordIds(
    due.map((item) => item.wordId),
    "due word",
  );
  return due
    .map((item) => ({
      wordId: item.wordId,
      schedule: requireSchedule(item.schedule),
    }))
    .filter((item) => isReviewDue(item.schedule, now))
    .sort(compareDueWords)
    .slice(0, sessionLimit);
}

function admitNewWords(input: {
  readonly newCandidates: readonly string[];
  readonly scheduledWordIds: ReadonlySet<string>;
  readonly openSlots: number;
  readonly newWordQuota: number;
}): string[] {
  requireDistinctWordIds(input.newCandidates, "new word");
  const eligible = input.newCandidates.filter((wordId) => !input.scheduledWordIds.has(wordId));
  return eligible.slice(0, Math.min(input.openSlots, input.newWordQuota));
}

function freezePlan(
  dueWords: readonly DueReviewWord[],
  newWordIds: readonly string[],
): DailyReviewPlan {
  const typingWordIds = dueWords
    .filter((item) => item.schedule.state === "REVIEW")
    .map((item) => item.wordId);
  const learningWordIds = dueWords
    .filter((item) => item.schedule.state === "LEARNING")
    .map((item) => item.wordId);
  return Object.freeze({
    typingWordIds: Object.freeze(typingWordIds),
    matchingWordIds: Object.freeze([...learningWordIds, ...newWordIds]),
    newWordIds: Object.freeze([...newWordIds]),
  });
}

function compareDueWords(left: DueReviewWord, right: DueReviewWord): number {
  const timeDelta = left.schedule.nextReviewAt.getTime() - right.schedule.nextReviewAt.getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }
  if (left.wordId < right.wordId) {
    return -1;
  }
  return left.wordId > right.wordId ? 1 : 0;
}

function requireSchedule(schedule: ReviewSchedule): ReviewSchedule {
  if (!REVIEW_STATES.includes(schedule.state)) {
    throw new InvalidDailyReviewPlanError("Review state must be LEARNING or REVIEW.");
  }
  if (!(schedule.nextReviewAt instanceof Date) || Number.isNaN(schedule.nextReviewAt.getTime())) {
    throw new InvalidDailyReviewPlanError("Review date must be a valid instant.");
  }
  return schedule;
}

function requireDistinctWordIds(wordIds: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const wordId of wordIds) {
    if (typeof wordId !== "string" || wordId.length === 0) {
      throw new InvalidDailyReviewPlanError(`${label} must be a non-empty word id.`);
    }
    if (seen.has(wordId)) {
      throw new InvalidDailyReviewPlanError(`Duplicate ${label}: ${wordId}.`);
    }
    seen.add(wordId);
  }
}

function requireSessionLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidDailyReviewPlanError("Session limit must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidDailyReviewPlanError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireInstant(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidDailyReviewPlanError("Current instant must be a valid date.");
  }
  return value;
}
