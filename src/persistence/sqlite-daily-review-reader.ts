import { GetDailyReviewSummary } from "@/lib/application/review/get-daily-review-summary";
import type {
  DailyReviewReader,
  DailyReviewSummary,
  PlanInputs,
} from "@/lib/application/review/ports/daily-review-reader";
import { createWord, type Clock, type Word } from "@/lib/domain/game/types";
import {
  DAILY_NEW_WORD_LIMIT,
  type DueReviewWord,
} from "@/lib/domain/learning/daily-review-plan";
import { InvalidReviewScheduleError } from "@/lib/domain/learning/errors";
import { localDateOf } from "@/lib/domain/learning/local-day";
import {
  REVIEW_STATES,
  type ReviewSchedule,
  type ReviewState,
} from "@/lib/domain/learning/review-schedule";
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

const DUE_PLAN_STATEMENT = `
SELECT
  p."wordId" AS "wordId",
  p."reviewState" AS "reviewState",
  p."reviewRepetitions" AS "reviewRepetitions",
  p."reviewLapses" AS "reviewLapses",
  p."reviewIntervalDays" AS "reviewIntervalDays",
  p."reviewEaseFactor" AS "reviewEaseFactor",
  p."nextReviewAt" AS "nextReviewAt"
FROM "LearnerWordProgress" AS p
INNER JOIN "Word" AS w ON w."id" = p."wordId"
WHERE p."visitorId" = ?
  AND w."active" = ?
  AND p."nextReviewAt" <= ?
ORDER BY p."nextReviewAt" ASC, p."wordId" ASC
`;

const NEW_PLAN_STATEMENT = `
SELECT w."id" AS "id"
FROM "Word" AS w
WHERE w."active" = ?
  AND NOT EXISTS (
    SELECT p."wordId"
    FROM "LearnerWordProgress" AS p
    WHERE p."visitorId" = ?
      AND p."wordId" = w."id"
      AND p."nextReviewAt" IS NOT NULL
  )
ORDER BY w."createdAt" ASC, w."id" ASC
`;

const STUDIED_STATEMENT = `
SELECT
  p."wordId" AS "wordId",
  p."reviewState" AS "reviewState",
  p."reviewRepetitions" AS "reviewRepetitions",
  p."reviewLapses" AS "reviewLapses",
  p."reviewIntervalDays" AS "reviewIntervalDays",
  p."reviewEaseFactor" AS "reviewEaseFactor",
  p."nextReviewAt" AS "nextReviewAt"
FROM "LearnerWordProgress" AS p
INNER JOIN "Word" AS w ON w."id" = p."wordId"
WHERE p."visitorId" = ?
  AND w."active" = ?
  AND p."nextReviewAt" IS NOT NULL
`;

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

  async loadPlanInputs(visitorId: string, now: Date, timeZone: string): Promise<PlanInputs> {
    const instant = now.toISOString();
    const localDate = localDateOf(now, timeZone);
    const [due, newCandidates, introducedToday] = await Promise.all([
      readDueWords(this.executor, visitorId, instant),
      readNewCandidates(this.executor, visitorId),
      countIntroducedToday(this.executor, visitorId, localDate),
    ]);
    return { due, newCandidates, introducedToday };
  }

  async findActiveWords(wordIds: readonly string[]): Promise<readonly Word[]> {
    return readActiveWords(this.executor, wordIds);
  }

  async listStudied(visitorId: string): Promise<readonly ScheduledWordRef[]> {
    const rows = await this.executor.getAll<ReviewScheduleRow & { wordId: string }>(
      STUDIED_STATEMENT,
      [visitorId, ACTIVE_WORD],
    );
    return rows.map((row) => ({
      wordId: row.wordId,
      schedule: requireSchedule(toReviewScheduleFromRow(row), "Studied word is missing a schedule."),
    }));
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

export interface ReviewScheduleRow {
  reviewState: string;
  reviewRepetitions: number | bigint | string;
  reviewLapses: number | bigint | string;
  reviewIntervalDays: number | bigint | string;
  reviewEaseFactor: number | bigint | string;
  nextReviewAt: string | null;
}

export interface StoredReviewSchedule {
  readonly nextReviewAt: string;
  readonly reviewRepetitions: number;
  readonly reviewLapses: number;
  readonly reviewIntervalDays: number;
  readonly reviewEaseFactor: number;
  readonly reviewState: ReviewState;
}

export function toReviewScheduleFromRow(row: ReviewScheduleRow): ReviewSchedule | null {
  if (row.nextReviewAt === null) {
    return null;
  }
  return Object.freeze({
    state: toReviewState(row.reviewState),
    repetitions: Number(row.reviewRepetitions),
    lapses: Number(row.reviewLapses),
    intervalDays: Number(row.reviewIntervalDays),
    easeFactor: Number(row.reviewEaseFactor),
    nextReviewAt: parseStoredInstant(row.nextReviewAt),
  });
}

export function toSchedulePersistence(schedule: ReviewSchedule): StoredReviewSchedule {
  return {
    nextReviewAt: schedule.nextReviewAt.toISOString(),
    reviewRepetitions: schedule.repetitions,
    reviewLapses: schedule.lapses,
    reviewIntervalDays: schedule.intervalDays,
    reviewEaseFactor: schedule.easeFactor,
    reviewState: schedule.state,
  };
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

interface DuePlanRow extends ReviewScheduleRow {
  wordId: string;
}

interface NewCandidateRow {
  id: string;
}

interface ActiveWordRow {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
}

async function readDueWords(
  executor: SqlExecutor,
  visitorId: string,
  instant: string,
): Promise<DueReviewWord[]> {
  const rows = await executor.getAll<DuePlanRow>(DUE_PLAN_STATEMENT, [
    visitorId,
    ACTIVE_WORD,
    instant,
  ]);
  return rows.map((row) => ({
    wordId: row.wordId,
    schedule: requireSchedule(toReviewScheduleFromRow(row), "Due word is missing a schedule."),
  }));
}

async function readNewCandidates(executor: SqlExecutor, visitorId: string): Promise<string[]> {
  const rows = await executor.getAll<NewCandidateRow>(NEW_PLAN_STATEMENT, [ACTIVE_WORD, visitorId]);
  return rows.map((row) => row.id);
}

async function readActiveWords(
  executor: SqlExecutor,
  wordIds: readonly string[],
): Promise<readonly Word[]> {
  const requested = uniqueIds(wordIds);
  if (requested.length === 0) {
    return [];
  }
  const placeholders = requested.map(() => "?").join(", ");
  const rows = await executor.getAll<ActiveWordRow>(
    `
    SELECT "id", "english", "portuguese", "exampleSentence"
    FROM "Word"
    WHERE "active" = ?
      AND "id" IN (${placeholders})
    `,
    [ACTIVE_WORD, ...requested],
  );
  const byId = new Map(rows.map((row) => [row.id, toActiveWord(row)]));
  return requested.flatMap((wordId) => {
    const word = byId.get(wordId);
    return word === undefined ? [] : [word];
  });
}

function toActiveWord(row: ActiveWordRow): Word {
  return createWord({
    id: row.id,
    english: row.english,
    portuguese: row.portuguese,
    exampleSentence: row.exampleSentence,
    active: true,
  });
}

function uniqueIds(wordIds: readonly string[]): string[] {
  return [...new Set(wordIds)];
}

function requireSchedule(schedule: ReviewSchedule | null, message: string): ReviewSchedule {
  if (schedule === null) {
    throw new InvalidReviewScheduleError(message);
  }
  return schedule;
}

function toReviewState(value: string): ReviewState {
  const state = REVIEW_STATES.find((candidate) => candidate === value);
  if (state === undefined) {
    throw new InvalidReviewScheduleError(`Unknown review state: ${value}.`);
  }
  return state;
}
