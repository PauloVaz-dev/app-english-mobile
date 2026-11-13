import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { GameSession } from "@/lib/domain/game/game-session";
import { GameSessionAlreadyExistsError } from "@/lib/domain/game/errors";
import { createWord, type Clock, type Word } from "@/lib/domain/game/types";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import {
  scheduleReview,
  type ReviewSchedule,
} from "@/lib/domain/learning/review-schedule";
import {
  InvalidReviewSessionError,
  ReviewAttemptConflictError,
  ReviewSession,
  ReviewSessionAlreadyExistsError,
  ReviewSessionNotFoundError,
} from "@/lib/domain/review";
import { migrate } from "@/persistence/migrate";
import { SqliteReviewSessionRepository } from "@/persistence/sqlite-review-session-repository";
import type { SqlExecutor } from "@/persistence/sql-executor";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const TIME_ZONE = DEFAULT_TIME_ZONE;
const STARTED_AT = new Date("2026-11-12T15:00:00.000Z");
const VISITOR_ID = "visitor-1";
const OTHER_VISITOR_ID = "visitor-2";
const ACTIVE_WORD = 1;
const ONE_SECOND_MS = 1_000;
const GOOD_RESPONSE_MS = 3_000;
const REINFORCEMENT_RESPONSE_MS = 100;
const TIMES_SHOWN = 4;
const CORRECT_COUNT = 3;
const WRONG_COUNT = 1;
const TOTAL_CORRECT_RESPONSE_MS = 9_000;
const GRADED_WORD = 1;
const UNGRADED_WORD = 0;
const REINFORCEMENT_FLAG = 1;

const INSERT_VISITOR_SQL = `
INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt")
VALUES (?, ?, ?)
`;

const INSERT_WORD_SQL = `
INSERT INTO "Word" (
  "id", "english", "portuguese", "englishNormalized", "portugueseNormalized",
  "exampleSentence", "active", "createdAt", "updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_PROGRESS_SQL = `
INSERT INTO "LearnerWordProgress" (
  "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
  "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
  "reviewRepetitions", "reviewLapses", "reviewIntervalDays", "reviewEaseFactor",
  "reviewState", "updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

interface SessionContext {
  readonly database: Database.Database;
  readonly executor: SqlExecutor;
  readonly repository: SqliteReviewSessionRepository;
  readonly clock: ManualClock;
}

describe("sqlite review session repository", () => {
  it("stores a typing review and reads the same session back", async () => {
    await withRepository(async ({ database, repository, clock }) => {
      insertVisitor(database, VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", "An apple.");
      const session = startTypingSession(clock, "review-typing", ["apple"]);

      await repository.create(session, null);
      const restored = await repository.findById(session.id);

      expect(restored?.id).toBe(session.id);
      expect(restored?.status).toBe("ACTIVE");
      expect(restored?.finishedAt).toBeNull();
      expect(restored?.localDate).toBe("2026-11-12");
      expect(restored?.timeZone).toBe(TIME_ZONE);
      expect(restored?.gameSessionId).toBeNull();
      expect(restored?.attempts).toEqual([]);
      expect(restored?.words).toEqual([
        expect.objectContaining({
          sequence: 0,
          stage: "TYPING",
          origin: "DUE",
          word: expect.objectContaining({
            id: "apple",
            english: "apple",
            portuguese: "maçã",
            exampleSentence: "An apple.",
          }),
        }),
      ]);
      expect(await repository.findById("missing-review")).toBeNull();
    });
  });

  it("stores the linked review board and rolls the whole write back when a word is missing", async () => {
    await withRepository(async ({ database, repository, clock, executor }) => {
      insertVisitor(database, VISITOR_ID);
      insertCatalogWord(database, "river", "rio", null);
      insertCatalogWord(database, "stone", "pedra", null);
      insertCatalogWord(database, "cloud", "nuvem", null);
      const linked = startMatchingSession(clock, {
        id: "review-board",
        gameSessionId: "game-board",
      });

      await repository.create(linked.session, linked.game);
      const restored = await repository.findById(linked.session.id);
      expect(restored?.stage).toBe("MATCHING");
      expect(restored?.gameSessionId).toBe("game-board");
      expect(restored?.words.map((entry) => [entry.word.id, entry.stage, entry.origin])).toEqual([
        ["river", "MATCHING", "NEW"],
        ["stone", "MATCHING", "DISTRACTOR"],
        ["cloud", "MATCHING", "DISTRACTOR"],
      ]);
      expect(await readGame(executor, "game-board")).toEqual({
        mode: "REVIEW",
        status: "ACTIVE",
        words: [
          { wordId: "river", graded: GRADED_WORD },
          { wordId: "stone", graded: UNGRADED_WORD },
          { wordId: "cloud", graded: UNGRADED_WORD },
        ],
      });
      const linkedGame = await repository.findLinkedGame("game-board");
      expect(linkedGame?.mode).toBe("REVIEW");
      expect(linkedGame?.words.map((entry) => [entry.word.id, entry.graded])).toEqual([
        ["river", true],
        ["stone", false],
        ["cloud", false],
      ]);

      const duplicate = startTypingSession(clock, "review-typing", ["river"]);
      await repository.create(duplicate, null);
      await expect(repository.create(duplicate, null)).rejects.toBeInstanceOf(
        ReviewSessionAlreadyExistsError,
      );

      const missing = startTypingSession(clock, "review-missing", ["missing-word"]);
      await expect(repository.create(missing, null)).rejects.toBeInstanceOf(InvalidReviewSessionError);
      expect(await repository.findById("review-missing")).toBeNull();

      const takenGame = startMatchingSession(clock, {
        id: "review-taken-game",
        gameSessionId: "game-board",
      });
      await expect(repository.create(takenGame.session, takenGame.game)).rejects.toBeInstanceOf(
        GameSessionAlreadyExistsError,
      );
      expect(await repository.findById("review-taken-game")).toBeNull();
    });
  });

  it("moves the schedule on the first typing attempt and leaves the practice counters alone", async () => {
    await withRepository(async ({ database, repository, clock, executor }) => {
      insertVisitor(database, VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", "An apple.");
      insertCatalogWord(database, "plum", "ameixa", null);
      const original = storedSchedule(-1);
      insertProgress(database, "apple", original, new Date("2026-09-20T15:00:00.000Z"));
      const session = startTypingSession(clock, "review-grade", ["apple"]);
      await repository.create(session, null);
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();

      const recorded = await repository.recordTypingAttempt({
        sessionId: session.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        typedText: "apple",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      const progress = await readProgress(executor, VISITOR_ID, "apple");

      expect(recorded).toMatchObject({
        outcome: "CORRECT",
        expected: "apple",
        exampleSentence: "An apple.",
        grade: "GOOD",
        isReinforcement: false,
      });
      expect(recorded.session.stage).toBe("DONE");
      expect(progress).toMatchObject({
        timesShown: TIMES_SHOWN,
        correctCount: CORRECT_COUNT,
        wrongCount: WRONG_COUNT,
        totalCorrectResponseTimeMs: TOTAL_CORRECT_RESPONSE_MS,
        lastReviewedAt: reviewedAt,
        schedule: scheduleReview(original, "GOOD", reviewedAt, TIME_ZONE),
      });

      const fresh = startTypingSession(clock, "review-fresh", ["plum"]);
      await repository.create(fresh, null);
      clock.advance(ONE_SECOND_MS);
      const freshAt = clock.now();
      await repository.recordTypingAttempt({
        sessionId: fresh.id,
        attemptId: "attempt-plum",
        wordId: "plum",
        typedText: "plum",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      const created = await readProgress(executor, VISITOR_ID, "plum");
      expect(created).toMatchObject({
        timesShown: 0,
        correctCount: 0,
        wrongCount: 0,
        totalCorrectResponseTimeMs: 0,
        lastReviewedAt: freshAt,
        schedule: scheduleReview(null, "GOOD", freshAt, TIME_ZONE),
      });
      await expect(
        repository.recordTypingAttempt({
          sessionId: "missing-review",
          attemptId: "attempt-missing",
          wordId: "plum",
          typedText: "plum",
          usedHint: false,
          responseTimeMs: GOOD_RESPONSE_MS,
        }),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
    });
  });

  it("stores one ungraded reinforcement and does not move the schedule again", async () => {
    await withRepository(async ({ database, repository, clock, executor }) => {
      insertVisitor(database, VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", null);
      insertCatalogWord(database, "grape", "uva", null);
      const original = storedSchedule(0);
      insertProgress(database, "apple", original, new Date("2026-09-20T15:00:00.000Z"));
      insertProgress(database, "grape", storedSchedule(0), new Date("2026-09-20T15:00:00.000Z"));
      const session = startTypingSession(clock, "review-again", ["apple", "grape"]);
      await repository.create(session, null);
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();

      await repository.recordTypingAttempt({
        sessionId: session.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        typedText: null,
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      const afterGrade = await readProgress(executor, VISITOR_ID, "apple");
      clock.advance(ONE_SECOND_MS);
      await repository.recordTypingAttempt({
        sessionId: session.id,
        attemptId: "attempt-grape",
        wordId: "grape",
        typedText: "grape",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      const reinforcement = await repository.recordTypingAttempt({
        sessionId: session.id,
        attemptId: "attempt-apple-again",
        wordId: "apple",
        typedText: "apple",
        usedHint: false,
        responseTimeMs: REINFORCEMENT_RESPONSE_MS,
      });

      expect(reinforcement).toMatchObject({
        outcome: "CORRECT",
        grade: null,
        isReinforcement: true,
      });
      expect(reinforcement.session.stage).toBe("DONE");
      expect(await readProgress(executor, VISITOR_ID, "apple")).toEqual(afterGrade);
      expect(afterGrade?.schedule).toEqual(scheduleReview(original, "AGAIN", reviewedAt, TIME_ZONE));
      expect(afterGrade?.lastReviewedAt).toEqual(reviewedAt);
      expect(afterGrade?.correctCount).toBe(CORRECT_COUNT);
      expect(await readAttempt(executor, "attempt-apple-again")).toEqual({
        grade: null,
        isReinforcement: REINFORCEMENT_FLAG,
      });
    });
  });

  it("replays the same attempt id and rejects a different payload", async () => {
    await withRepository(async ({ database, repository, clock, executor }) => {
      insertVisitor(database, VISITOR_ID);
      insertVisitor(database, OTHER_VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", null);
      const original = storedSchedule(0);
      insertProgress(database, "apple", original, new Date("2026-09-20T15:00:00.000Z"));
      const session = startTypingSession(clock, "review-retry", ["apple"]);
      await repository.create(session, null);
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();
      const input = {
        sessionId: session.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        typedText: "apple",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      };

      const first = await repository.recordTypingAttempt(input);
      const replay = await repository.recordTypingAttempt(input);
      const progress = await readProgress(executor, VISITOR_ID, "apple");

      expect(replay.grade).toBe(first.grade);
      expect(replay.outcome).toBe(first.outcome);
      expect(replay.session.attempts).toHaveLength(1);
      expect(progress?.schedule).toEqual(scheduleReview(original, "GOOD", reviewedAt, TIME_ZONE));
      await expect(
        repository.recordTypingAttempt({ ...input, typedText: "appl" }),
      ).rejects.toBeInstanceOf(ReviewAttemptConflictError);
      expect((await repository.findById(session.id))?.attempts).toHaveLength(1);
      expect((await readProgress(executor, VISITOR_ID, "apple"))?.schedule).toEqual(progress?.schedule);

      const other = startTypingSession(clock, "review-other", ["apple"], OTHER_VISITOR_ID);
      await repository.create(other, null);
      await expect(
        repository.recordTypingAttempt({ ...input, sessionId: other.id }),
      ).rejects.toBeInstanceOf(ReviewAttemptConflictError);
    });
  });

  it("keeps recorded grades when the review is abandoned or completed", async () => {
    await withRepository(async ({ database, repository, clock, executor }) => {
      insertVisitor(database, VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", null);
      insertCatalogWord(database, "river", "rio", null);
      insertCatalogWord(database, "stone", "pedra", null);
      insertCatalogWord(database, "cloud", "nuvem", null);
      const original = storedSchedule(0);
      insertProgress(database, "apple", original, new Date("2026-09-20T15:00:00.000Z"));
      const linked = startMixedSession(clock);
      await repository.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await repository.recordTypingAttempt({
        sessionId: linked.session.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        typedText: "apple",
        usedHint: false,
        responseTimeMs: REINFORCEMENT_RESPONSE_MS,
      });
      const graded = await readProgress(executor, VISITOR_ID, "apple");
      clock.advance(ONE_SECOND_MS);
      const finishedAt = clock.now();

      const abandoned = await repository.finish(linked.session.id, "ABANDONED");

      expect(abandoned.status).toBe("ABANDONED");
      expect(abandoned.finishedAt).toEqual(finishedAt);
      expect(abandoned.attempts).toEqual([
        expect.objectContaining({ attemptId: "attempt-apple", grade: "EASY" }),
      ]);
      expect(await readProgress(executor, VISITOR_ID, "apple")).toEqual(graded);
      expect((await readGame(executor, "game-leave"))?.status).toBe("ABANDONED");

      const typing = startTypingSession(clock, "review-done", ["apple"]);
      await repository.create(typing, null);
      clock.advance(ONE_SECOND_MS);
      await repository.recordTypingAttempt({
        sessionId: typing.id,
        attemptId: "attempt-done",
        wordId: "apple",
        typedText: "apple",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      clock.advance(ONE_SECOND_MS);
      const completedAt = clock.now();
      const completed = await repository.finish(typing.id, "COMPLETED");
      expect(completed.status).toBe("COMPLETED");
      expect(completed.finishedAt).toEqual(completedAt);
      expect(completed.attempts).toHaveLength(1);
    });
  });

  it("lists the learner's active review and ignores finished sessions of the same learner", async () => {
    await withRepository(async ({ database, repository, clock }) => {
      insertVisitor(database, VISITOR_ID);
      insertVisitor(database, OTHER_VISITOR_ID);
      insertCatalogWord(database, "apple", "maçã", null);
      insertCatalogWord(database, "grape", "uva", null);
      const first = startTypingSession(clock, "review-first", ["apple"]);
      await repository.create(first, null);
      clock.advance(ONE_SECOND_MS);
      const second = startTypingSession(clock, "review-second", ["grape"]);
      await repository.create(second, null);
      const other = startTypingSession(clock, "review-other", ["apple"], OTHER_VISITOR_ID);
      await repository.create(other, null);

      expect((await repository.findActiveByVisitor(VISITOR_ID))?.id).toBe("review-second");
      expect((await repository.findActiveByVisitor(OTHER_VISITOR_ID))?.id).toBe("review-other");

      await repository.finish("review-second", "ABANDONED");
      expect((await repository.findActiveByVisitor(VISITOR_ID))?.id).toBe("review-first");
      await repository.finish("review-first", "ABANDONED");
      expect(await repository.findActiveByVisitor(VISITOR_ID)).toBeNull();
      expect((await repository.findActiveByVisitor(OTHER_VISITOR_ID))?.id).toBe("review-other");
    });
  });
});

async function withRepository(verify: (context: SessionContext) => Promise<void>): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      await migrate(executor, runBetterSqliteTransaction(database));
      const clock = new ManualClock(STARTED_AT);
      const repository = new SqliteReviewSessionRepository(
        executor,
        runBetterSqliteTransaction(database),
        clock,
      );
      await verify({ database, executor, repository, clock });
    } finally {
      database.close();
    }
  });
}

class ManualClock implements Clock {
  private instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  advance(milliseconds: number): void {
    this.instant = new Date(this.instant.getTime() + milliseconds);
  }
}

function startTypingSession(
  clock: ManualClock,
  id: string,
  wordIds: readonly string[],
  visitorId = VISITOR_ID,
): ReviewSession {
  return ReviewSession.start(
    {
      id,
      visitorId,
      timeZone: TIME_ZONE,
      gameSessionId: null,
      words: wordIds.map((wordId) => ({
        word: {
          id: wordId,
          english: wordId,
          portuguese: wordId === "apple" ? "maçã" : wordId,
          exampleSentence: wordId === "apple" ? "An apple." : null,
        },
        stage: "TYPING",
        origin: "DUE",
      })),
    },
    clock,
  );
}

function startMatchingSession(
  clock: ManualClock,
  input: { readonly id: string; readonly gameSessionId: string },
): { session: ReviewSession; game: GameSession } {
  const words = [
    { id: "river", origin: "NEW" as const },
    { id: "stone", origin: "DISTRACTOR" as const },
    { id: "cloud", origin: "DISTRACTOR" as const },
  ];
  const session = ReviewSession.start(
    {
      id: input.id,
      visitorId: VISITOR_ID,
      timeZone: TIME_ZONE,
      gameSessionId: input.gameSessionId,
      words: words.map((word) => ({
        word: { id: word.id, english: word.id, portuguese: word.id },
        stage: "MATCHING" as const,
        origin: word.origin,
      })),
    },
    clock,
  );
  const game = GameSession.start(
    {
      id: input.gameSessionId,
      visitorId: VISITOR_ID,
      mode: "REVIEW",
      words: words.map((word) => plainWord(word.id)),
      ungradedWordIds: ["stone", "cloud"],
    },
    clock,
  );
  return { session, game };
}

function startMixedSession(clock: ManualClock): { session: ReviewSession; game: GameSession } {
  const matching = [
    { id: "river", origin: "NEW" as const },
    { id: "stone", origin: "DISTRACTOR" as const },
    { id: "cloud", origin: "DISTRACTOR" as const },
  ];
  const session = ReviewSession.start(
    {
      id: "review-leave",
      visitorId: VISITOR_ID,
      timeZone: TIME_ZONE,
      gameSessionId: "game-leave",
      words: [
        {
          word: { id: "apple", english: "apple", portuguese: "maçã" },
          stage: "TYPING",
          origin: "DUE",
        },
        ...matching.map((word) => ({
          word: { id: word.id, english: word.id, portuguese: word.id },
          stage: "MATCHING" as const,
          origin: word.origin,
        })),
      ],
    },
    clock,
  );
  const game = GameSession.start(
    {
      id: "game-leave",
      visitorId: VISITOR_ID,
      mode: "REVIEW",
      words: matching.map((word) => plainWord(word.id)),
      ungradedWordIds: ["stone", "cloud"],
    },
    clock,
  );
  return { session, game };
}

function plainWord(id: string): Word {
  return createWord({ id, english: id, portuguese: id });
}

function storedSchedule(dayOffset: number): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: new Date(STARTED_AT.getTime() + dayOffset * 86_400_000),
  };
}

function insertVisitor(database: Database.Database, visitorId: string): void {
  const storedAt = STARTED_AT.toISOString();
  database.prepare(INSERT_VISITOR_SQL).run(visitorId, storedAt, storedAt);
}

function insertCatalogWord(
  database: Database.Database,
  id: string,
  portuguese: string,
  exampleSentence: string | null,
): void {
  const storedAt = STARTED_AT.toISOString();
  database.prepare(INSERT_WORD_SQL).run(
    id,
    id,
    portuguese,
    id,
    portuguese,
    exampleSentence,
    ACTIVE_WORD,
    storedAt,
    storedAt,
  );
}

function insertProgress(
  database: Database.Database,
  wordId: string,
  schedule: ReviewSchedule,
  lastReviewedAt: Date,
): void {
  database.prepare(INSERT_PROGRESS_SQL).run(
    VISITOR_ID,
    wordId,
    TIMES_SHOWN,
    CORRECT_COUNT,
    WRONG_COUNT,
    TOTAL_CORRECT_RESPONSE_MS,
    lastReviewedAt.toISOString(),
    schedule.nextReviewAt.toISOString(),
    schedule.repetitions,
    schedule.lapses,
    schedule.intervalDays,
    schedule.easeFactor,
    schedule.state,
    STARTED_AT.toISOString(),
  );
}

interface StoredProgress {
  readonly timesShown: number;
  readonly correctCount: number;
  readonly wrongCount: number;
  readonly totalCorrectResponseTimeMs: number;
  readonly lastReviewedAt: Date | null;
  readonly schedule: ReviewSchedule | null;
}

async function readProgress(
  executor: SqlExecutor,
  visitorId: string,
  wordId: string,
): Promise<StoredProgress | null> {
  const rows = await executor.getAll<ProgressRow>(
    `
    SELECT "timesShown", "correctCount", "wrongCount", "totalCorrectResponseTimeMs",
           "lastReviewedAt", "nextReviewAt", "reviewRepetitions", "reviewLapses",
           "reviewIntervalDays", "reviewEaseFactor", "reviewState"
    FROM "LearnerWordProgress"
    WHERE "visitorId" = ? AND "wordId" = ?
    `,
    [visitorId, wordId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    timesShown: Number(row.timesShown),
    correctCount: Number(row.correctCount),
    wrongCount: Number(row.wrongCount),
    totalCorrectResponseTimeMs: Number(row.totalCorrectResponseTimeMs),
    lastReviewedAt: row.lastReviewedAt === null ? null : new Date(row.lastReviewedAt),
    schedule:
      row.nextReviewAt === null
        ? null
        : {
            state: row.reviewState === "LEARNING" ? "LEARNING" : "REVIEW",
            repetitions: Number(row.reviewRepetitions),
            lapses: Number(row.reviewLapses),
            intervalDays: Number(row.reviewIntervalDays),
            easeFactor: Number(row.reviewEaseFactor),
            nextReviewAt: new Date(row.nextReviewAt),
          },
  };
}

interface ProgressRow {
  timesShown: number;
  correctCount: number;
  wrongCount: number;
  totalCorrectResponseTimeMs: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewRepetitions: number;
  reviewLapses: number;
  reviewIntervalDays: number;
  reviewEaseFactor: number;
  reviewState: string;
}

interface GameRead {
  readonly mode: string;
  readonly status: string;
  readonly words: readonly { readonly wordId: string; readonly graded: number }[];
}

async function readGame(executor: SqlExecutor, gameId: string): Promise<GameRead | null> {
  const sessions = await executor.getAll<{ mode: string; status: string }>(
    `SELECT "mode", "status" FROM "GameSession" WHERE "id" = ?`,
    [gameId],
  );
  const session = sessions[0];
  if (session === undefined) {
    return null;
  }
  const words = await executor.getAll<{ wordId: string; graded: number }>(
    `
    SELECT "wordId", "graded"
    FROM "GameSessionWord"
    WHERE "sessionId" = ?
    ORDER BY "sequence" ASC
    `,
    [gameId],
  );
  return { mode: session.mode, status: session.status, words };
}

async function readAttempt(
  executor: SqlExecutor,
  attemptId: string,
): Promise<{ grade: string | null; isReinforcement: number } | null> {
  const rows = await executor.getAll<{ grade: string | null; isReinforcement: number }>(
    `SELECT "grade", "isReinforcement" FROM "TypingAttempt" WHERE "attemptId" = ?`,
    [attemptId],
  );
  return rows[0] ?? null;
}
