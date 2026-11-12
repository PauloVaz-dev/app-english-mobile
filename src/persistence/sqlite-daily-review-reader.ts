import { GetDailyReviewSummary } from "@/lib/application/review/get-daily-review-summary";
import type {
  DailyReviewReader,
  DailyReviewSummary,
  PlanInputs,
} from "@/lib/application/review/ports/daily-review-reader";
import type { Clock, Word } from "@/lib/domain/game/types";
import { DAILY_NEW_WORD_LIMIT } from "@/lib/domain/learning/daily-review-plan";
import { InvalidReviewScheduleError } from "@/lib/domain/learning/errors";
import { localDateOf } from "@/lib/domain/learning/local-day";
import type { ScheduledWordRef } from "@/lib/domain/learning/word-selection";
import type { SqlExecutor, SqlValue } from "@/persistence/sql-executor";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";

const ACTIVE_WORD = 1;
const EMPTY_COUNT = 0;
const NEW_WORD_ORIGIN = "NEW";
const NEXT_REVIEW_ROW_LIMIT = 1;

const DUE_COUNT_STATEMENT = `
SELECT COUNT(*) AS "total"
FROM "LearnerWordProgress" AS p
INNER JOIN "Word" AS w ON w."id" = p."wordId"
WHERE p."visitorId" = ?
  AND w."active" = ?
  AND p."nextReviewAt" <= ?
`;

const NEW_CANDIDATE_COUNT_STATEMENT = `
SELECT COUNT(*) AS "total"
FROM "Word" AS w
WHERE w."active" = ?
  AND NOT EXISTS (
    SELECT p."wordId"
    FROM "LearnerWordProgress" AS p
    WHERE p."visitorId" = ?
      AND p."wordId" = w."id"
      AND p."nextReviewAt" IS NOT NULL
  )
`;

const INTRODUCED_TODAY_STATEMENT = `
SELECT COUNT(DISTINCT rw."wordId") AS "total"
FROM "ReviewSessionWord" AS rw
INNER JOIN "ReviewSession" AS r ON r."id" = rw."sessionId"
WHERE r."visitorId" = ?
  AND r."localDate" = ?
  AND rw."origin" = ?
`;

const NEXT_REVIEW_STATEMENT = `
SELECT p."nextReviewAt" AS "nextReviewAt"
FROM "LearnerWordProgress" AS p
INNER JOIN "Word" AS w ON w."id" = p."wordId"
WHERE p."visitorId" = ?
  AND w."active" = ?
  AND p."nextReviewAt" > ?
ORDER BY p."nextReviewAt" ASC, p."wordId" ASC
LIMIT ${NEXT_REVIEW_ROW_LIMIT}
`;

export class DailyReviewCapabilityError extends Error {
  readonly name = "DailyReviewCapabilityError";

  constructor(capability: string) {
    super(`${capability} is not available until the daily review feature.`);
  }
}

export class SqliteDailyReviewReader implements DailyReviewReader {
  private readonly executor: SqlExecutor;

  constructor(executor: SqlExecutor) {
    this.executor = executor;
  }

  async summary(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewSummary> {
    const localDate = localDateOf(now, timeZone);
    const instant = now.toISOString();
    const dueCount = await countDueWords(this.executor, visitorId, instant);
    const newCandidateCount = await countNewCandidates(this.executor, visitorId);
    const introducedToday = await countIntroducedToday(this.executor, visitorId, localDate);
    const nextReviewAt = await readNextReviewAt(this.executor, visitorId, instant);
    const remainingNewWords = Math.max(EMPTY_COUNT, DAILY_NEW_WORD_LIMIT - introducedToday);
    return {
      dueCount,
      newAvailable: Math.min(newCandidateCount, remainingNewWords),
      nextReviewAt,
    };
  }

  loadPlanInputs(_visitorId: string, _now: Date, _timeZone: string): Promise<PlanInputs> {
    return rejectCapability("Loading the review plan");
  }

  findActiveWords(_wordIds: readonly string[]): Promise<readonly Word[]> {
    return rejectCapability("Loading active words");
  }

  listStudied(_visitorId: string): Promise<readonly ScheduledWordRef[]> {
    return rejectCapability("Listing studied words");
  }
}

export function createDailySummaryUseCase(
  executor: SqlExecutor,
  clock: Clock,
): GetDailyReviewSummary {
  const reader = new SqliteDailyReviewReader(executor);
  const preferences = new SqliteVisitorPreferences(executor);
  return new GetDailyReviewSummary({ reader, preferences, clock });
}

function rejectCapability(capability: string): Promise<never> {
  return Promise.reject(new DailyReviewCapabilityError(capability));
}

async function countDueWords(
  executor: SqlExecutor,
  visitorId: string,
  instant: string,
): Promise<number> {
  return readTotal(executor, DUE_COUNT_STATEMENT, [visitorId, ACTIVE_WORD, instant]);
}

async function countNewCandidates(executor: SqlExecutor, visitorId: string): Promise<number> {
  return readTotal(executor, NEW_CANDIDATE_COUNT_STATEMENT, [ACTIVE_WORD, visitorId]);
}

async function countIntroducedToday(
  executor: SqlExecutor,
  visitorId: string,
  localDate: string,
): Promise<number> {
  return readTotal(executor, INTRODUCED_TODAY_STATEMENT, [visitorId, localDate, NEW_WORD_ORIGIN]);
}

async function readNextReviewAt(
  executor: SqlExecutor,
  visitorId: string,
  instant: string,
): Promise<Date | null> {
  const rows = await executor.getAll<NextReviewRow>(NEXT_REVIEW_STATEMENT, [
    visitorId,
    ACTIVE_WORD,
    instant,
  ]);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return parseStoredInstant(row.nextReviewAt);
}

async function readTotal(
  executor: SqlExecutor,
  statement: string,
  params: readonly SqlValue[],
): Promise<number> {
  const rows = await executor.getAll<CountRow>(statement, params);
  const row = rows[0];
  if (row === undefined) {
    return EMPTY_COUNT;
  }
  return Number(row.total);
}

function parseStoredInstant(value: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidReviewScheduleError("Review date must be a valid instant.");
  }
  return instant;
}

interface CountRow {
  total: number | bigint | string;
}

interface NextReviewRow {
  nextReviewAt: string;
}
