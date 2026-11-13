import {
  type BuildSessionReviewInput,
  buildSessionReview,
} from "@/lib/application/game/build-session-review";
import {
  EMPTY_SESSION_RESULT_LISTS,
  type SessionResultLists,
} from "@/lib/application/game/session-view";
import {
  AttemptConflictError,
  GameSessionNotFoundError,
  InvalidGameSessionError,
} from "@/lib/domain/game/errors";
import { GameSession } from "@/lib/domain/game/game-session";
import { CURRENT_RESPONSE_TIME_MEASUREMENT_VERSION } from "@/lib/domain/game/response-time-measurement";
import {
  type AttemptResult,
  type Clock,
  createWord,
  GAME_SESSION_MODES,
  GAME_SESSION_STATUSES,
  type GameSessionMode,
  type GameSessionSnapshot,
  type GameSessionStatus,
  type SessionExposure,
} from "@/lib/domain/game/types";
import {
  applyAttemptToProgress,
  assertAttemptProgressAllowed,
} from "@/lib/domain/learning/attempt-progress";
import { applyMatchingReview } from "@/lib/domain/learning/matching-review";
import { createLearningProgressSnapshot } from "@/lib/domain/learning/progress-metrics";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import type { LearningProgressSnapshot } from "@/lib/domain/learning/types";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import {
  toReviewScheduleFromRow,
  toSchedulePersistence,
  type ReviewScheduleRow,
} from "@/persistence/sqlite-daily-review-reader";

const INSERT_SESSION = `
INSERT INTO "GameSession" (
  "id", "visitorId", "status", "targetWords", "correctAnswers", "wrongAnswers",
  "startedAt", "finishedAt", "durationMs", "mode"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_SESSION_WORD = `
INSERT INTO "GameSessionWord" (
  "sessionId", "wordId", "sequence", "presentedAt", "completedAt", "graded"
) VALUES (?, ?, ?, ?, ?, ?)
`;

const SELECT_SESSION = `
SELECT "id", "visitorId", "mode", "status", "targetWords", "correctAnswers",
       "wrongAnswers", "startedAt", "finishedAt", "durationMs"
FROM "GameSession"
WHERE "id" = ?
`;

const SELECT_SESSION_WORDS = `
SELECT sw."wordId", sw."sequence", sw."presentedAt", sw."completedAt", sw."graded",
       w."english", w."portuguese", w."exampleSentence", w."active"
FROM "GameSessionWord" AS sw
JOIN "Word" AS w ON w."id" = sw."wordId"
WHERE sw."sessionId" = ?
ORDER BY sw."sequence" ASC
`;

const SELECT_ANSWERS = `
SELECT "attemptId", "sequence", "promptWordId", "selectedWordId", "isCorrect",
       "responseTimeMs", "createdAt"
FROM "GameAnswer"
WHERE "sessionId" = ?
ORDER BY "sequence" ASC
`;

const SELECT_ANSWER_OWNER = `
SELECT "sessionId", "responseTimeMeasurementVersion"
FROM "GameAnswer"
WHERE "attemptId" = ?
`;

const INSERT_ANSWER = `
INSERT INTO "GameAnswer" (
  "id", "attemptId", "sessionId", "sequence", "promptWordId", "selectedWordId",
  "isCorrect", "responseTimeMs", "responseTimeMeasurementVersion", "createdAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const COMPLETE_SESSION_WORD = `
UPDATE "GameSessionWord"
SET "completedAt" = ?
WHERE "sessionId" = ? AND "wordId" = ? AND "completedAt" IS NULL
`;

const PRESENT_SESSION_WORD = `
UPDATE "GameSessionWord"
SET "presentedAt" = ?
WHERE "sessionId" = ? AND "wordId" = ? AND "presentedAt" IS NULL
`;

const UPDATE_SESSION = `
UPDATE "GameSession"
SET "status" = ?, "correctAnswers" = ?, "wrongAnswers" = ?, "finishedAt" = ?, "durationMs" = ?
WHERE "id" = ? AND "status" = 'ACTIVE'
`;

const SELECT_PROGRESS = `
SELECT "timesShown", "correctCount", "wrongCount", "totalCorrectResponseTimeMs"
FROM "LearnerWordProgress"
WHERE "visitorId" = ? AND "wordId" = ?
`;

const SELECT_SESSION_PROGRESS = `
SELECT p."wordId", p."timesShown", p."correctCount", p."wrongCount",
       p."totalCorrectResponseTimeMs"
FROM "LearnerWordProgress" AS p
JOIN "GameSessionWord" AS sw ON sw."wordId" = p."wordId"
WHERE sw."sessionId" = ? AND p."visitorId" = ?
`;

/** Agenda columns keep their defaults: the free practice never schedules. */
const COUNT_EXPOSURE = `
INSERT INTO "LearnerWordProgress" ("visitorId", "wordId", "timesShown", "updatedAt")
VALUES (?, ?, 1, ?)
ON CONFLICT ("visitorId", "wordId") DO UPDATE
SET "timesShown" = "timesShown" + 1, "updatedAt" = excluded."updatedAt"
`;

/** Only the counters change; the agenda columns are left as they are. */
const UPDATE_PROGRESS_COUNTERS = `
UPDATE "LearnerWordProgress"
SET "correctCount" = ?, "wrongCount" = ?, "totalCorrectResponseTimeMs" = ?, "updatedAt" = ?
WHERE "visitorId" = ? AND "wordId" = ?
`;

const SELECT_REVIEW_TIME_ZONE = `
SELECT "timeZone" AS "timeZone"
FROM "ReviewSession"
WHERE "gameSessionId" = ?
`;

const SELECT_MATCHING_SCHEDULE = `
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

const UPDATE_MATCHING_SCHEDULE = `
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

export interface GameSessionRow {
  id: string;
  visitorId: string;
  mode: string;
  status: string;
  targetWords: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface GameSessionWordRow {
  wordId: string;
  sequence: number;
  presentedAt: string | null;
  completedAt: string | null;
  graded: number;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  active: number;
}

export interface GameAnswerRow {
  attemptId: string;
  sequence: number;
  promptWordId: string;
  selectedWordId: string;
  isCorrect: number;
  responseTimeMs: number;
  createdAt: string;
}

export interface StoredGameSessionRows {
  readonly session: GameSessionRow;
  readonly words: readonly GameSessionWordRow[];
  readonly answers: readonly GameAnswerRow[];
}

export interface RecordGameExposuresInput {
  readonly sessionId: string;
  readonly wordIds: readonly string[];
}

export interface RecordGameAttemptInput {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly responseTimeMs: number;
}

interface AnswerOwnerRow {
  sessionId: string;
  responseTimeMeasurementVersion: number;
}

interface ProgressRow {
  timesShown: number;
  correctCount: number;
  wrongCount: number;
  totalCorrectResponseTimeMs: number;
}

interface SessionProgressRow extends ProgressRow {
  wordId: string;
}

export class SqliteGameSessionRepository {
  private readonly executor: SqlExecutor;
  private readonly runInTransaction: RunInTransaction;
  private readonly clock: Clock;

  constructor(executor: SqlExecutor, runInTransaction: RunInTransaction, clock: Clock) {
    this.executor = executor;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
  }

  async create(session: GameSession): Promise<void> {
    await this.runInTransaction(async () => {
      await insertGameSession(this.executor, session);
    });
  }

  async findById(sessionId: string): Promise<GameSession | null> {
    const rows = await this.readRows(sessionId);
    return rows === null ? null : toGameSession(rows);
  }

  async recordExposures(input: RecordGameExposuresInput): Promise<readonly SessionExposure[]> {
    let exposures: readonly SessionExposure[] = [];
    await this.runInTransaction(async () => {
      const session = await this.requireSession(input.sessionId);
      exposures = session.recordExposures(input.wordIds, this.clock);
      for (const exposure of exposures) {
        if (exposure.isNew) {
          await this.storeExposure(session, exposure);
        }
      }
    });
    return exposures;
  }

  async recordAttempt(input: RecordGameAttemptInput): Promise<AttemptResult> {
    let outcome: AttemptResult | undefined;
    await this.runInTransaction(async () => {
      const owner = await this.readAnswerOwner(input.attemptId);
      assertSameAttemptOwner(owner, input);
      const session = await this.requireSession(input.sessionId);
      const storedAttempts = session.attempts.length;
      const result = session.recordAttempt(
        {
          attemptId: input.attemptId,
          promptWordId: input.promptWordId,
          selectedWordId: input.selectedWordId,
          responseTimeMs: input.responseTimeMs,
        },
        this.clock,
      );
      outcome = result;
      if (owner !== null) {
        return;
      }
      await this.storeProgress(session.visitorId, result);
      await this.storeMatchingSchedule(session, result);
      await this.storeAnswer(session.id, storedAttempts, result);
      await this.storeSessionState(session);
    });
    if (outcome === undefined) {
      throw new GameSessionNotFoundError(input.sessionId);
    }
    return outcome;
  }

  /** Abandoning a session that already ended keeps it as it was. */
  async abandon(sessionId: string): Promise<GameSession> {
    let ended: GameSession | undefined;
    await this.runInTransaction(async () => {
      const session = await this.requireSession(sessionId);
      ended = session;
      if (session.status !== "ACTIVE") {
        return;
      }
      session.abandon(this.clock);
      await this.storeSessionState(session);
    });
    if (ended === undefined) {
      throw new GameSessionNotFoundError(sessionId);
    }
    return ended;
  }

  async readResultLists(sessionId: string): Promise<SessionResultLists> {
    const rows = await this.readRows(sessionId);
    if (rows === null) {
      return EMPTY_SESSION_RESULT_LISTS;
    }
    const progress = await this.executor.getAll<SessionProgressRow>(SELECT_SESSION_PROGRESS, [
      sessionId,
      rows.session.visitorId,
    ]);
    const progressByWordId = new Map(
      progress.map((row) => [row.wordId, toProgressSnapshot(row)] as const),
    );
    return buildSessionReview(toSessionReviewFacts(rows.words, rows.answers, progressByWordId));
  }

  private async readRows(sessionId: string): Promise<StoredGameSessionRows | null> {
    const sessions = await this.executor.getAll<GameSessionRow>(SELECT_SESSION, [sessionId]);
    const session = sessions[0];
    if (session === undefined) {
      return null;
    }
    const words = await this.executor.getAll<GameSessionWordRow>(SELECT_SESSION_WORDS, [sessionId]);
    const answers = await this.executor.getAll<GameAnswerRow>(SELECT_ANSWERS, [sessionId]);
    return { session, words, answers };
  }

  private async requireSession(sessionId: string): Promise<GameSession> {
    const session = await this.findById(sessionId);
    if (session === null) {
      throw new GameSessionNotFoundError(sessionId);
    }
    return session;
  }

  private async readAnswerOwner(attemptId: string): Promise<AnswerOwnerRow | null> {
    const rows = await this.executor.getAll<AnswerOwnerRow>(SELECT_ANSWER_OWNER, [attemptId]);
    return rows[0] ?? null;
  }

  private async readProgress(
    visitorId: string,
    wordId: string,
  ): Promise<LearningProgressSnapshot | null> {
    const rows = await this.executor.getAll<ProgressRow>(SELECT_PROGRESS, [visitorId, wordId]);
    const row = rows[0];
    return row === undefined ? null : toProgressSnapshot(row);
  }

  private async storeExposure(session: GameSession, exposure: SessionExposure): Promise<void> {
    const presentedAt = exposure.presentedAt.toISOString();
    await this.executor.run(PRESENT_SESSION_WORD, [presentedAt, session.id, exposure.wordId]);
    await this.executor.run(COUNT_EXPOSURE, [session.visitorId, exposure.wordId, presentedAt]);
  }

  private async storeMatchingSchedule(session: GameSession, result: AttemptResult): Promise<void> {
    const wordId = result.attempt.promptWordId;
    if (!session.gradesWord(wordId)) {
      return;
    }
    const timeZone = await readReviewTimeZone(this.executor, session.id);
    const current = await readMatchingSchedule(this.executor, session.visitorId, wordId);
    const nextSchedule = scheduleMatchingAttempt({ session, result, current, timeZone });
    if (nextSchedule === null) {
      return;
    }
    await writeMatchingSchedule(this.executor, {
      visitorId: session.visitorId,
      wordId,
      reviewedAt: result.attempt.occurredAt,
      schedule: nextSchedule,
    });
  }

  private async storeProgress(visitorId: string, result: AttemptResult): Promise<void> {
    const wordId = result.attempt.promptWordId;
    const current = await this.readProgress(visitorId, wordId);
    const attempt = {
      isCorrect: result.isCorrect,
      responseTimeMs: result.attempt.responseTimeMs,
    };
    assertAttemptProgressAllowed(current, attempt);
    const next = applyAttemptToProgress(current, attempt);
    await this.executor.run(UPDATE_PROGRESS_COUNTERS, [
      next.correctCount,
      next.wrongCount,
      next.totalCorrectResponseTimeMs,
      result.attempt.occurredAt.toISOString(),
      visitorId,
      wordId,
    ]);
  }

  private async storeAnswer(
    sessionId: string,
    sequence: number,
    result: AttemptResult,
  ): Promise<void> {
    const { attempt } = result;
    const occurredAt = attempt.occurredAt.toISOString();
    await this.executor.run(INSERT_ANSWER, [
      `${sessionId}:${sequence}`,
      attempt.attemptId,
      sessionId,
      sequence,
      attempt.promptWordId,
      attempt.selectedWordId,
      attempt.isCorrect ? 1 : 0,
      attempt.responseTimeMs,
      CURRENT_RESPONSE_TIME_MEASUREMENT_VERSION,
      occurredAt,
    ]);
    if (result.completedWordId !== null) {
      await this.executor.run(COMPLETE_SESSION_WORD, [
        occurredAt,
        sessionId,
        result.completedWordId,
      ]);
    }
  }

  private async storeSessionState(session: GameSession): Promise<void> {
    await this.executor.run(UPDATE_SESSION, [
      session.status,
      session.correctAnswers,
      session.wrongAnswers,
      toStoredInstant(session.finishedAt),
      session.result?.durationMs ?? null,
      session.id,
    ]);
  }
}

export interface MatchingAttemptSchedule {
  readonly session: GameSession;
  readonly result: AttemptResult;
  readonly current: ReviewSchedule | null;
  readonly timeZone: string;
}

export function scheduleMatchingAttempt(input: MatchingAttemptSchedule): ReviewSchedule | null {
  const wordId = input.result.attempt.promptWordId;
  if (!input.session.gradesWord(wordId)) {
    return null;
  }
  const attemptId = input.result.attempt.attemptId;
  const previousAttempts = input.session.attempts.filter(
    (attempt) => attempt.attemptId !== attemptId,
  );
  return applyMatchingReview({
    current: input.current,
    previousAttempts,
    result: input.result,
    timeZone: input.timeZone,
  });
}

export async function insertGameSession(executor: SqlExecutor, session: GameSession): Promise<void> {
  assertStoredMode(session.mode);
  const snapshot = session.toSnapshot();
  await executor.run(INSERT_SESSION, [
    snapshot.id,
    snapshot.visitorId,
    snapshot.status,
    snapshot.targetWords,
    session.correctAnswers,
    session.wrongAnswers,
    snapshot.startedAt.toISOString(),
    toStoredInstant(snapshot.finishedAt),
    session.result?.durationMs ?? null,
    snapshot.mode,
  ]);
  for (const entry of snapshot.words) {
    await executor.run(INSERT_SESSION_WORD, [
      snapshot.id,
      entry.word.id,
      entry.sequence,
      toStoredInstant(entry.presentedAt),
      toStoredInstant(entry.completedAt),
      entry.graded ? 1 : 0,
    ]);
  }
}

export function toGameSessionSnapshot(rows: StoredGameSessionRows): GameSessionSnapshot {
  const { session } = rows;
  return {
    id: session.id,
    visitorId: session.visitorId,
    mode: parseMode(session.mode),
    status: parseStatus(session.status),
    targetWords: Number(session.targetWords),
    words: [...rows.words]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({
        word: createWord({
          id: row.wordId,
          english: row.english,
          portuguese: row.portuguese,
          exampleSentence: row.exampleSentence,
          active: row.active === 1,
        }),
        sequence: Number(row.sequence),
        presentedAt: fromStoredInstant(row.presentedAt),
        completedAt: fromStoredInstant(row.completedAt),
        graded: row.graded === 1,
      })),
    attempts: [...rows.answers]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({
        attemptId: row.attemptId,
        promptWordId: row.promptWordId,
        selectedWordId: row.selectedWordId,
        isCorrect: row.isCorrect === 1,
        responseTimeMs: Number(row.responseTimeMs),
        occurredAt: new Date(row.createdAt),
      })),
    startedAt: new Date(session.startedAt),
    finishedAt: fromStoredInstant(session.finishedAt),
  };
}

export function toSessionReviewFacts(
  words: readonly GameSessionWordRow[],
  answers: readonly GameAnswerRow[],
  progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>,
): BuildSessionReviewInput {
  return {
    words: [...words]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({ wordId: row.wordId, english: row.english, portuguese: row.portuguese })),
    attempts: [...answers]
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({
        promptWordId: row.promptWordId,
        isCorrect: row.isCorrect === 1,
        responseTimeMs: Number(row.responseTimeMs),
      })),
    progressByWordId,
  };
}

interface MatchingScheduleWrite {
  readonly visitorId: string;
  readonly wordId: string;
  readonly reviewedAt: Date;
  readonly schedule: ReviewSchedule;
}

async function readReviewTimeZone(executor: SqlExecutor, gameSessionId: string): Promise<string> {
  const rows = await executor.getAll<{ timeZone: string | null }>(SELECT_REVIEW_TIME_ZONE, [
    gameSessionId,
  ]);
  const timeZone = rows[0]?.timeZone;
  if (timeZone === undefined || timeZone === null || timeZone.length === 0) {
    throw new InvalidGameSessionError("A review game needs the review session time zone.");
  }
  return timeZone;
}

async function readMatchingSchedule(
  executor: SqlExecutor,
  visitorId: string,
  wordId: string,
): Promise<ReviewSchedule | null> {
  const rows = await executor.getAll<ReviewScheduleRow>(SELECT_MATCHING_SCHEDULE, [
    visitorId,
    wordId,
  ]);
  const row = rows[0];
  return row === undefined ? null : toReviewScheduleFromRow(row);
}

async function writeMatchingSchedule(
  executor: SqlExecutor,
  input: MatchingScheduleWrite,
): Promise<void> {
  const stored = toSchedulePersistence(input.schedule);
  const reviewedAt = input.reviewedAt.toISOString();
  await executor.run(UPDATE_MATCHING_SCHEDULE, [
    reviewedAt,
    stored.nextReviewAt,
    stored.reviewRepetitions,
    stored.reviewLapses,
    stored.reviewIntervalDays,
    stored.reviewEaseFactor,
    stored.reviewState,
    reviewedAt,
    input.visitorId,
    input.wordId,
  ]);
}

function assertStoredMode(mode: GameSessionMode): void {
  if (mode !== "FREE" && mode !== "REVIEW") {
    throw new InvalidGameSessionError("Only FREE and REVIEW sessions are stored here.");
  }
}

function toGameSession(rows: StoredGameSessionRows): GameSession {
  const session = GameSession.restore(toGameSessionSnapshot(rows));
  assertStoredCounters(rows.session, session);
  return session;
}

function assertStoredCounters(row: GameSessionRow, session: GameSession): void {
  if (
    Number(row.correctAnswers) !== session.correctAnswers ||
    Number(row.wrongAnswers) !== session.wrongAnswers
  ) {
    throw new InvalidGameSessionError("Stored session counters differ from its answers.");
  }
  const durationMs = row.durationMs === null ? null : Number(row.durationMs);
  if (durationMs !== (session.result?.durationMs ?? null)) {
    throw new InvalidGameSessionError("Stored session duration differs from its timestamps.");
  }
}

function assertSameAttemptOwner(owner: AnswerOwnerRow | null, input: RecordGameAttemptInput): void {
  if (owner === null) {
    return;
  }
  if (
    owner.sessionId !== input.sessionId ||
    Number(owner.responseTimeMeasurementVersion) !== CURRENT_RESPONSE_TIME_MEASUREMENT_VERSION
  ) {
    throw new AttemptConflictError(input.attemptId);
  }
}

function toProgressSnapshot(row: ProgressRow): LearningProgressSnapshot {
  return createLearningProgressSnapshot({
    timesShown: Number(row.timesShown),
    correctCount: Number(row.correctCount),
    wrongCount: Number(row.wrongCount),
    totalCorrectResponseTimeMs: Number(row.totalCorrectResponseTimeMs),
  });
}

function parseMode(value: string): GameSessionMode {
  const mode = GAME_SESSION_MODES.find((candidate) => candidate === value);
  if (mode === undefined) {
    throw new InvalidGameSessionError(`Unknown stored session mode: ${value}.`);
  }
  return mode;
}

function parseStatus(value: string): GameSessionStatus {
  const status = GAME_SESSION_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) {
    throw new InvalidGameSessionError(`Unknown stored session status: ${value}.`);
  }
  return status;
}

function toStoredInstant(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function fromStoredInstant(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}
