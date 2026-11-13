import type { GameSession } from "@/lib/domain/game/game-session";
import {
  GameSessionAlreadyExistsError,
  GameSessionNotFoundError,
} from "@/lib/domain/game/errors";
import {
  GAME_SESSION_STATUSES,
  createWord,
  type Clock,
  type GameSessionStatus,
} from "@/lib/domain/game/types";
import {
  REVIEW_GRADES,
  scheduleReview,
  type ReviewGrade,
} from "@/lib/domain/learning/review-schedule";
import { TYPING_OUTCOMES, type TypingOutcome } from "@/lib/domain/learning/typing-answer";
import {
  InvalidReviewSessionError,
  ReviewAttemptConflictError,
  ReviewSession,
  ReviewSessionAlreadyExistsError,
  ReviewSessionNotFoundError,
  REVIEW_SESSION_STATUSES,
  REVIEW_WORD_ORIGINS,
  REVIEW_WORD_STAGES,
  type FinishedReviewSessionStatus,
  type ReviewSessionSnapshot,
  type ReviewSessionStatus,
  type ReviewWordOrigin,
  type ReviewWordStage,
  type TypingAttempt,
} from "@/lib/domain/review";
import type {
  RecordTypingAttempt,
  ReviewSessionRepository,
  TypingAttemptResult,
} from "@/lib/application/review/ports/review-session-repository";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import {
  insertGameSession,
  SqliteGameSessionRepository,
} from "@/persistence/sqlite-game-session-repository";
import {
  toReviewScheduleFromRow,
  toSchedulePersistence,
  type ReviewScheduleRow,
  type StoredReviewSchedule,
} from "@/persistence/sqlite-daily-review-reader";

const STORED_TRUE = 1;
const STORED_FALSE = 0;
const ACTIVE_GAME_STATUS: GameSessionStatus = "ACTIVE";
const ACTIVE_REVIEW_LIMIT = 1;
const ZERO_COUNTER = 0;
const FOREIGN_KEY_CONSTRAINT = "SQLITE_CONSTRAINT_FOREIGNKEY";

const INSERT_VISITOR = `
INSERT INTO "AnonymousVisitor" ("id", "timeZone", "lastSeenAt")
VALUES (?, ?, ?)
`;

const UPDATE_VISITOR = `
UPDATE "AnonymousVisitor"
SET "timeZone" = ?, "lastSeenAt" = ?
WHERE "id" = ?
`;

const SELECT_VISITOR_SEEN = `
SELECT "lastSeenAt" AS "lastSeenAt"
FROM "AnonymousVisitor"
WHERE "id" = ?
`;

const INSERT_REVIEW = `
INSERT INTO "ReviewSession" (
  "id", "visitorId", "localDate", "timeZone", "status", "gameSessionId",
  "startedAt", "finishedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_REVIEW_WORD = `
INSERT INTO "ReviewSessionWord" (
  "sessionId", "wordId", "sequence", "stage", "origin"
) VALUES (?, ?, ?, ?, ?)
`;

const INSERT_ATTEMPT = `
INSERT INTO "TypingAttempt" (
  "id", "attemptId", "sessionId", "sequence", "wordId", "outcome", "typedText",
  "usedHint", "responseTimeMs", "grade", "isReinforcement", "createdAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_REVIEW = `
SELECT
  r."id" AS "id",
  r."visitorId" AS "visitorId",
  r."localDate" AS "localDate",
  r."timeZone" AS "timeZone",
  r."status" AS "status",
  r."gameSessionId" AS "gameSessionId",
  r."startedAt" AS "startedAt",
  r."finishedAt" AS "finishedAt",
  g."status" AS "gameStatus"
FROM "ReviewSession" AS r
LEFT JOIN "GameSession" AS g ON g."id" = r."gameSessionId"
WHERE r."id" = ?
`;

const SELECT_REVIEW_WORDS = `
SELECT
  rw."wordId" AS "wordId",
  rw."sequence" AS "sequence",
  rw."stage" AS "stage",
  rw."origin" AS "origin",
  w."english" AS "english",
  w."portuguese" AS "portuguese",
  w."exampleSentence" AS "exampleSentence",
  w."active" AS "active"
FROM "ReviewSessionWord" AS rw
INNER JOIN "Word" AS w ON w."id" = rw."wordId"
WHERE rw."sessionId" = ?
ORDER BY rw."sequence" ASC
`;

const SELECT_ATTEMPTS = `
SELECT
  "attemptId" AS "attemptId",
  "sequence" AS "sequence",
  "wordId" AS "wordId",
  "outcome" AS "outcome",
  "typedText" AS "typedText",
  "usedHint" AS "usedHint",
  "responseTimeMs" AS "responseTimeMs",
  "grade" AS "grade",
  "isReinforcement" AS "isReinforcement",
  "createdAt" AS "createdAt"
FROM "TypingAttempt"
WHERE "sessionId" = ?
ORDER BY "sequence" ASC
`;

const SELECT_ACTIVE_REVIEW = `
SELECT "id" AS "id"
FROM "ReviewSession"
WHERE "visitorId" = ? AND "status" = 'ACTIVE'
ORDER BY "startedAt" DESC, "id" ASC
LIMIT ${ACTIVE_REVIEW_LIMIT}
`;

const SELECT_ATTEMPT_OWNER = `
SELECT "sessionId" AS "sessionId"
FROM "TypingAttempt"
WHERE "attemptId" = ?
`;

const SELECT_PROGRESS = `
SELECT
  "reviewState" AS "reviewState",
  "reviewRepetitions" AS "reviewRepetitions",
  "reviewLapses" AS "reviewLapses",
  "reviewIntervalDays" AS "reviewIntervalDays",
  "reviewEaseFactor" AS "reviewEaseFactor",
  "nextReviewAt" AS "nextReviewAt"
FROM "LearnerWordProgress"
WHERE "visitorId" = ? AND "wordId" = ?
`;

const UPDATE_SCHEDULE = `
UPDATE "LearnerWordProgress"
SET "lastReviewedAt" = ?,
    "nextReviewAt" = ?,
    "reviewRepetitions" = ?,
    "reviewLapses" = ?,
    "reviewIntervalDays" = ?,
    "reviewEaseFactor" = ?,
    "reviewState" = ?,
    "updatedAt" = ?
WHERE "visitorId" = ? AND "wordId" = ?
`;

const INSERT_SCHEDULE = `
INSERT INTO "LearnerWordProgress" (
  "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
  "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
  "reviewRepetitions", "reviewLapses", "reviewIntervalDays", "reviewEaseFactor",
  "reviewState", "updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const UPDATE_REVIEW_STATUS = `
UPDATE "ReviewSession"
SET "status" = ?, "finishedAt" = ?
WHERE "id" = ?
`;

const SELECT_GAME_CLOCK = `
SELECT "status" AS "status", "startedAt" AS "startedAt"
FROM "GameSession"
WHERE "id" = ?
`;

const ABANDON_GAME = `
UPDATE "GameSession"
SET "status" = 'ABANDONED', "finishedAt" = ?, "durationMs" = ?
WHERE "id" = ? AND "status" = 'ACTIVE'
`;

export interface ReviewSessionRow {
  id: string;
  visitorId: string;
  localDate: string;
  timeZone: string;
  status: string;
  gameSessionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  gameStatus: string | null;
}

export interface ReviewSessionWordRow {
  wordId: string;
  sequence: number;
  stage: string;
  origin: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  active: number;
}

export interface TypingAttemptRow {
  attemptId: string;
  sequence: number;
  wordId: string;
  outcome: string;
  typedText: string | null;
  usedHint: number;
  responseTimeMs: number;
  grade: string | null;
  isReinforcement: number;
  createdAt: string;
}

export interface StoredReviewSessionRows {
  readonly session: ReviewSessionRow;
  readonly words: readonly ReviewSessionWordRow[];
  readonly attempts: readonly TypingAttemptRow[];
}

export class SqliteReviewSessionRepository implements ReviewSessionRepository {
  private readonly executor: SqlExecutor;
  private readonly runInTransaction: RunInTransaction;
  private readonly clock: Clock;
  private readonly games: SqliteGameSessionRepository;

  constructor(executor: SqlExecutor, runInTransaction: RunInTransaction, clock: Clock) {
    this.executor = executor;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
    this.games = new SqliteGameSessionRepository(executor, runInTransaction, clock);
  }

  async create(session: ReviewSession, game: GameSession | null): Promise<void> {
    session.assertLinkedGame(game);
    await this.runInTransaction(async () => {
      try {
        await rejectDuplicates(this.executor, session, game);
        await rememberVisitor(this.executor, session);
        if (game) {
          await insertGameSession(this.executor, game);
        }
        await insertReview(this.executor, session);
      } catch (error) {
        if (isForeignKeyConstraint(error)) {
          throw new InvalidReviewSessionError("Review words must already exist in the catalog.");
        }
        throw error;
      }
    });
  }

  async findById(id: string): Promise<ReviewSession | null> {
    const rows = await readRows(this.executor, id);
    return rows === null ? null : ReviewSession.restore(toReviewSessionSnapshot(rows));
  }

  async findActiveByVisitor(visitorId: string): Promise<ReviewSession | null> {
    const rows = await this.executor.getAll<{ id: string }>(SELECT_ACTIVE_REVIEW, [visitorId]);
    const active = rows[0];
    if (active === undefined) {
      return null;
    }
    return this.findById(active.id);
  }

  async findLinkedGame(gameSessionId: string): Promise<GameSession | null> {
    return this.games.findById(gameSessionId);
  }

  async recordTypingAttempt(input: RecordTypingAttempt): Promise<TypingAttemptResult> {
    let result: TypingAttemptResult | undefined;
    await this.runInTransaction(async () => {
      const owner = await readAttemptOwner(this.executor, input.attemptId);
      if (owner !== null && owner !== input.sessionId) {
        throw new ReviewAttemptConflictError(input.attemptId);
      }
      const session = await this.requireSession(input.sessionId);
      const outcome = session.recordTypingAttempt(
        {
          attemptId: input.attemptId,
          wordId: input.wordId,
          typedText: input.typedText,
          usedHint: input.usedHint,
          responseTimeMs: input.responseTimeMs,
        },
        this.clock,
      );
      if (owner === null) {
        const attempt = recordedAttempt(session, input.attemptId);
        await insertTypingAttempt(this.executor, session.id, attempt);
        if (attempt.grade) {
          await writeTypingSchedule({
            executor: this.executor,
            visitorId: session.visitorId,
            timeZone: session.timeZone,
            attempt,
            current: await readScheduleRow(this.executor, session.visitorId, attempt.wordId),
          });
        }
      }
      const stored = await this.requireSession(input.sessionId);
      result = { ...outcome, session: stored };
    });
    if (result === undefined) {
      throw new ReviewSessionNotFoundError(input.sessionId);
    }
    return result;
  }

  async finish(id: string, status: FinishedReviewSessionStatus): Promise<ReviewSession> {
    let finished: ReviewSession | undefined;
    await this.runInTransaction(async () => {
      const session = await this.requireSession(id);
      if (status === "ABANDONED") {
        session.abandon(this.clock);
        await abandonLinkedGame(this.executor, session);
      } else {
        session.complete(this.clock);
      }
      const finishedAt = requireFinishTime(session);
      await this.executor.run(UPDATE_REVIEW_STATUS, [session.status, finishedAt.toISOString(), session.id]);
      finished = await this.requireSession(id);
    });
    if (finished === undefined) {
      throw new ReviewSessionNotFoundError(id);
    }
    return finished;
  }

  private async requireSession(id: string): Promise<ReviewSession> {
    const session = await this.findById(id);
    if (session === null) {
      throw new ReviewSessionNotFoundError(id);
    }
    return session;
  }
}

export function toReviewSessionSnapshot(rows: StoredReviewSessionRows): ReviewSessionSnapshot {
  const gameStatus = rows.session.gameStatus;
  return {
    id: rows.session.id,
    visitorId: rows.session.visitorId,
    localDate: rows.session.localDate,
    timeZone: rows.session.timeZone,
    status: parseReviewStatus(rows.session.status),
    gameSessionId: rows.session.gameSessionId,
    matchingFinished: gameStatus === null ? false : parseGameStatus(gameStatus) !== ACTIVE_GAME_STATUS,
    startedAt: requireInstant(rows.session.startedAt, "startedAt"),
    finishedAt:
      rows.session.finishedAt === null ? null : requireInstant(rows.session.finishedAt, "finishedAt"),
    words: [...rows.words]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({
        word: createWord({
          id: row.wordId,
          english: row.english,
          portuguese: row.portuguese,
          exampleSentence: row.exampleSentence,
          active: Number(row.active) === STORED_TRUE,
        }),
        sequence: Number(row.sequence),
        stage: parseStage(row.stage),
        origin: parseOrigin(row.origin),
      })),
    attempts: [...rows.attempts]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({
        attemptId: row.attemptId,
        sequence: Number(row.sequence),
        wordId: row.wordId,
        outcome: parseOutcome(row.outcome),
        typedText: row.typedText,
        usedHint: Number(row.usedHint) === STORED_TRUE,
        responseTimeMs: Number(row.responseTimeMs),
        grade: parseGrade(row.grade),
        isReinforcement: Number(row.isReinforcement) === STORED_TRUE,
        createdAt: requireInstant(row.createdAt, "createdAt"),
      })),
  };
}

async function rejectDuplicates(
  executor: SqlExecutor,
  session: ReviewSession,
  game: GameSession | null,
): Promise<void> {
  const reviews = await executor.getAll<{ id: string }>(
    `SELECT "id" AS "id" FROM "ReviewSession" WHERE "id" = ?`,
    [session.id],
  );
  if (reviews[0] !== undefined) {
    throw new ReviewSessionAlreadyExistsError(session.id);
  }
  if (game === null) {
    return;
  }
  const games = await executor.getAll<{ id: string }>(
    `SELECT "id" AS "id" FROM "GameSession" WHERE "id" = ?`,
    [game.id],
  );
  if (games[0] !== undefined) {
    throw new GameSessionAlreadyExistsError(game.id);
  }
}

async function rememberVisitor(executor: SqlExecutor, session: ReviewSession): Promise<void> {
  const startedAt = session.startedAt.toISOString();
  const rows = await executor.getAll<{ lastSeenAt: string }>(SELECT_VISITOR_SEEN, [session.visitorId]);
  const current = rows[0];
  if (current === undefined) {
    await executor.run(INSERT_VISITOR, [session.visitorId, session.timeZone, startedAt]);
    return;
  }
  const lastSeenAt = current.lastSeenAt > startedAt ? current.lastSeenAt : startedAt;
  await executor.run(UPDATE_VISITOR, [session.timeZone, lastSeenAt, session.visitorId]);
}

async function insertReview(executor: SqlExecutor, session: ReviewSession): Promise<void> {
  await executor.run(INSERT_REVIEW, [
    session.id,
    session.visitorId,
    session.localDate,
    session.timeZone,
    session.status,
    session.gameSessionId,
    session.startedAt.toISOString(),
    toStoredInstant(session.finishedAt),
  ]);
  for (const entry of session.words) {
    await executor.run(INSERT_REVIEW_WORD, [
      session.id,
      entry.word.id,
      entry.sequence,
      entry.stage,
      entry.origin,
    ]);
  }
}

async function insertTypingAttempt(
  executor: SqlExecutor,
  sessionId: string,
  attempt: TypingAttempt,
): Promise<void> {
  await executor.run(INSERT_ATTEMPT, [
    attempt.attemptId,
    attempt.attemptId,
    sessionId,
    attempt.sequence,
    attempt.wordId,
    attempt.outcome,
    attempt.typedText,
    attempt.usedHint ? STORED_TRUE : STORED_FALSE,
    attempt.responseTimeMs,
    attempt.grade,
    attempt.isReinforcement ? STORED_TRUE : STORED_FALSE,
    attempt.createdAt.toISOString(),
  ]);
}

interface TypingScheduleWrite {
  readonly executor: SqlExecutor;
  readonly visitorId: string;
  readonly timeZone: string;
  readonly attempt: TypingAttempt;
  readonly current: ReviewScheduleRow | null;
}

async function writeTypingSchedule(input: TypingScheduleWrite): Promise<void> {
  const grade = input.attempt.grade;
  if (grade === null) {
    return;
  }
  const next = scheduleReview(
    input.current === null ? null : toReviewScheduleFromRow(input.current),
    grade,
    input.attempt.createdAt,
    input.timeZone,
  );
  const stored = toSchedulePersistence(next);
  const reviewedAt = input.attempt.createdAt.toISOString();
  if (input.current === null) {
    await insertScheduleRow(input, stored, reviewedAt);
    return;
  }
  await updateScheduleRow(input, stored, reviewedAt);
}

async function readScheduleRow(
  executor: SqlExecutor,
  visitorId: string,
  wordId: string,
): Promise<ReviewScheduleRow | null> {
  const rows = await executor.getAll<ReviewScheduleRow>(SELECT_PROGRESS, [visitorId, wordId]);
  return rows[0] ?? null;
}

async function insertScheduleRow(
  input: TypingScheduleWrite,
  stored: StoredReviewSchedule,
  reviewedAt: string,
): Promise<void> {
  await input.executor.run(INSERT_SCHEDULE, [
    input.visitorId,
    input.attempt.wordId,
    ZERO_COUNTER,
    ZERO_COUNTER,
    ZERO_COUNTER,
    ZERO_COUNTER,
    reviewedAt,
    stored.nextReviewAt,
    stored.reviewRepetitions,
    stored.reviewLapses,
    stored.reviewIntervalDays,
    stored.reviewEaseFactor,
    stored.reviewState,
    reviewedAt,
  ]);
}

async function updateScheduleRow(
  input: TypingScheduleWrite,
  stored: StoredReviewSchedule,
  reviewedAt: string,
): Promise<void> {
  await input.executor.run(UPDATE_SCHEDULE, [
    reviewedAt,
    stored.nextReviewAt,
    stored.reviewRepetitions,
    stored.reviewLapses,
    stored.reviewIntervalDays,
    stored.reviewEaseFactor,
    stored.reviewState,
    reviewedAt,
    input.visitorId,
    input.attempt.wordId,
  ]);
}

async function abandonLinkedGame(executor: SqlExecutor, session: ReviewSession): Promise<void> {
  const gameSessionId = session.gameSessionId;
  if (gameSessionId === null) {
    return;
  }
  const rows = await executor.getAll<{ status: string; startedAt: string }>(SELECT_GAME_CLOCK, [
    gameSessionId,
  ]);
  const game = rows[0];
  if (game === undefined) {
    throw new GameSessionNotFoundError(gameSessionId);
  }
  if (game.status !== ACTIVE_GAME_STATUS) {
    return;
  }
  const finishedAt = requireFinishTime(session);
  const startedAt = requireInstant(game.startedAt, "startedAt");
  await executor.run(ABANDON_GAME, [
    finishedAt.toISOString(),
    finishedAt.getTime() - startedAt.getTime(),
    gameSessionId,
  ]);
}

async function readRows(executor: SqlExecutor, id: string): Promise<StoredReviewSessionRows | null> {
  const sessions = await executor.getAll<ReviewSessionRow>(SELECT_REVIEW, [id]);
  const session = sessions[0];
  if (session === undefined) {
    return null;
  }
  const words = await executor.getAll<ReviewSessionWordRow>(SELECT_REVIEW_WORDS, [id]);
  const attempts = await executor.getAll<TypingAttemptRow>(SELECT_ATTEMPTS, [id]);
  return { session, words, attempts };
}

async function readAttemptOwner(executor: SqlExecutor, attemptId: string): Promise<string | null> {
  const rows = await executor.getAll<{ sessionId: string }>(SELECT_ATTEMPT_OWNER, [attemptId]);
  return rows[0]?.sessionId ?? null;
}

function recordedAttempt(session: ReviewSession, attemptId: string): TypingAttempt {
  const attempt = session.attempts.find((candidate) => candidate.attemptId === attemptId);
  if (attempt === undefined) {
    throw new InvalidReviewSessionError("Typing attempt was not recorded.");
  }
  return attempt;
}

function requireFinishTime(session: ReviewSession): Date {
  const finishedAt = session.finishedAt;
  if (finishedAt === null) {
    throw new InvalidReviewSessionError("A finished review needs a finish time.");
  }
  return finishedAt;
}

function parseReviewStatus(status: string): ReviewSessionStatus {
  const parsed = REVIEW_SESSION_STATUSES.find((candidate) => candidate === status);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted review status: ${status}.`);
  }
  return parsed;
}

function parseGameStatus(status: string): GameSessionStatus {
  const parsed = GAME_SESSION_STATUSES.find((candidate) => candidate === status);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted review game status: ${status}.`);
  }
  return parsed;
}

function parseStage(stage: string): ReviewWordStage {
  const parsed = REVIEW_WORD_STAGES.find((candidate) => candidate === stage);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted review stage: ${stage}.`);
  }
  return parsed;
}

function parseOrigin(origin: string): ReviewWordOrigin {
  const parsed = REVIEW_WORD_ORIGINS.find((candidate) => candidate === origin);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted review origin: ${origin}.`);
  }
  return parsed;
}

function parseOutcome(outcome: string): TypingOutcome {
  const parsed = TYPING_OUTCOMES.find((candidate) => candidate === outcome);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted typing outcome: ${outcome}.`);
  }
  return parsed;
}

function parseGrade(grade: string | null): ReviewGrade | null {
  if (grade === null) {
    return null;
  }
  const parsed = REVIEW_GRADES.find((candidate) => candidate === grade);
  if (parsed === undefined) {
    throw new InvalidReviewSessionError(`Unknown persisted typing grade: ${grade}.`);
  }
  return parsed;
}

function requireInstant(value: string, field: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidReviewSessionError(`${field} must be a valid instant.`);
  }
  return instant;
}

function toStoredInstant(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function isForeignKeyConstraint(error: unknown): boolean {
  return sqliteCode(error) === FOREIGN_KEY_CONSTRAINT;
}

function sqliteCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const { code } = error;
  return typeof code === "string" ? code : null;
}
