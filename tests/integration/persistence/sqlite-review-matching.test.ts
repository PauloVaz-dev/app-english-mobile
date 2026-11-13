import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { GameSession } from "@/lib/domain/game/game-session";
import type { Clock, Word } from "@/lib/domain/game/types";
import { createWord } from "@/lib/domain/game/types";
import {
  scheduleReview,
  type ReviewSchedule,
} from "@/lib/domain/learning/review-schedule";
import { ReviewSession } from "@/lib/domain/review";
import type { ReviewWordOrigin } from "@/lib/domain/review";
import { migrate } from "@/persistence/migrate";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteReviewSessionRepository } from "@/persistence/sqlite-review-session-repository";
import type { SqlExecutor } from "@/persistence/sql-executor";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const TIME_ZONE = "America/New_York";
const STARTED_AT = new Date("2026-11-12T15:00:00.000Z");
const VISITOR_ID = "visitor-1";
const FAST_RESPONSE_MS = 400;
const ONE_SECOND_MS = 1_000;
const ACTIVE_WORD = 1;
const TIMES_SHOWN = 4;
const CORRECT_COUNT = 3;
const WRONG_COUNT = 1;
const TOTAL_CORRECT_RESPONSE_MS = 9_000;
const DAY_MS = 86_400_000;

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

const SELECT_AGENDA_SQL = `
SELECT "lastReviewedAt", "nextReviewAt", "reviewRepetitions", "reviewLapses",
       "reviewIntervalDays", "reviewEaseFactor", "reviewState"
FROM "LearnerWordProgress"
WHERE "visitorId" = ? AND "wordId" = ?
`;

const SELECT_COUNTERS_SQL = `
SELECT "timesShown", "correctCount", "wrongCount", "totalCorrectResponseTimeMs"
FROM "LearnerWordProgress"
WHERE "visitorId" = ? AND "wordId" = ?
`;

interface AgendaRow {
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewRepetitions: number;
  reviewLapses: number;
  reviewIntervalDays: number;
  reviewEaseFactor: number;
  reviewState: string;
}

interface CounterRow {
  timesShown: number;
  correctCount: number;
  wrongCount: number;
  totalCorrectResponseTimeMs: number;
}

interface MatchingContext {
  readonly database: Database.Database;
  readonly executor: SqlExecutor;
  readonly clock: ManualClock;
  readonly reviews: SqliteReviewSessionRepository;
  readonly games: SqliteGameSessionRepository;
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

interface BoardWord {
  readonly id: string;
  readonly portuguese: string;
  readonly origin: ReviewWordOrigin;
}

describe("sqlite review matching", () => {
  it("stores a review game and reads graded scheduled words back", async () => {
    await withMatching(async ({ database, clock, games }) => {
      insertVisitor(database);
      insertWords(database, [
        { id: "river", portuguese: "rio", origin: "NEW" },
        { id: "stone", portuguese: "pedra", origin: "DISTRACTOR" },
        { id: "cloud", portuguese: "nuvem", origin: "DISTRACTOR" },
      ]);
      const game = GameSession.start(
        {
          id: "game-create",
          visitorId: VISITOR_ID,
          mode: "REVIEW",
          words: ["river", "stone", "cloud"].map((id) => plainWord(id)),
          ungradedWordIds: ["stone", "cloud"],
        },
        clock,
      );

      await games.create(game);
      const stored = await games.findById(game.id);

      expect(stored?.mode).toBe("REVIEW");
      expect(stored?.words.map((entry) => [entry.word.id, entry.graded])).toEqual([
        ["river", true],
        ["stone", false],
        ["cloud", false],
      ]);
    });
  });

  it("grades a fast match at most good in the review session time zone", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [
        { id: "river", portuguese: "rio", origin: "NEW" },
        { id: "stone", portuguese: "pedra", origin: "NEW" },
      ];
      insertWords(database, words);
      const linked = startLinked(clock, "review-good", "game-good", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["river"] });
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();

      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "river")).toEqual(
        storedAgenda(scheduleReview(null, "GOOD", reviewedAt, TIME_ZONE), reviewedAt),
      );
      expect(await readCounters(executor, "river")).toEqual({
        timesShown: 1,
        correctCount: 1,
        wrongCount: 0,
        totalCorrectResponseTimeMs: FAST_RESPONSE_MS,
      });
    });
  });

  it("grades the last pair at most hard", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [{ id: "river", portuguese: "rio", origin: "DUE" }];
      insertWords(database, words);
      insertVisitor(database);
      const current = dueSchedule();
      insertProgress(database, "river", current);
      const linked = startLinked(clock, "review-last", "game-last", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["river"] });
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();

      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-last",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "river")).toEqual(
        storedAgenda(scheduleReview(current, "HARD", reviewedAt, TIME_ZONE), reviewedAt),
      );
    });
  });

  it("keeps the first miss when a later match is correct", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [
        { id: "river", portuguese: "rio", origin: "DUE" },
        { id: "stone", portuguese: "pedra", origin: "NEW" },
      ];
      insertWords(database, words);
      insertVisitor(database);
      const current = dueSchedule();
      insertProgress(database, "river", current);
      const linked = startLinked(clock, "review-miss", "game-miss", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["river", "stone"] });
      clock.advance(ONE_SECOND_MS);
      const missedAt = clock.now();
      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-miss",
        promptWordId: "river",
        selectedWordId: "stone",
        responseTimeMs: ONE_SECOND_MS,
      });
      clock.advance(ONE_SECOND_MS);
      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-hit",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "river")).toEqual(
        storedAgenda(scheduleReview(current, "AGAIN", missedAt, TIME_ZONE), missedAt),
      );
      expect(await readCounters(executor, "river")).toEqual({
        timesShown: TIMES_SHOWN + 1,
        correctCount: CORRECT_COUNT + 1,
        wrongCount: WRONG_COUNT + 1,
        totalCorrectResponseTimeMs: TOTAL_CORRECT_RESPONSE_MS + FAST_RESPONSE_MS,
      });
    });
  });

  it("leaves a distractor schedule unchanged", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [
        { id: "river", portuguese: "rio", origin: "NEW" },
        { id: "stone", portuguese: "pedra", origin: "DISTRACTOR" },
      ];
      insertWords(database, words);
      insertVisitor(database);
      const distractorSchedule = futureSchedule();
      insertProgress(database, "stone", distractorSchedule);
      const before = await readAgenda(executor, "stone");
      const linked = startLinked(clock, "review-distractor", "game-distractor", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["stone"] });
      clock.advance(ONE_SECOND_MS);
      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-stone",
        promptWordId: "stone",
        selectedWordId: "stone",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "stone")).toEqual(before);
      expect(await readCounters(executor, "stone")).toEqual({
        timesShown: TIMES_SHOWN + 1,
        correctCount: CORRECT_COUNT + 1,
        wrongCount: WRONG_COUNT,
        totalCorrectResponseTimeMs: TOTAL_CORRECT_RESPONSE_MS + FAST_RESPONSE_MS,
      });
    });
  });

  it("leaves a word that is not due today unchanged", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [
        { id: "river", portuguese: "rio", origin: "DUE" },
        { id: "stone", portuguese: "pedra", origin: "NEW" },
      ];
      insertWords(database, words);
      insertVisitor(database);
      insertProgress(database, "river", futureSchedule());
      const before = await readAgenda(executor, "river");
      const linked = startLinked(clock, "review-later", "game-later", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["river"] });
      clock.advance(ONE_SECOND_MS);
      await games.recordAttempt({
        sessionId: linked.game.id,
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "river")).toEqual(before);
      expect(await readCounters(executor, "river")).toEqual({
        timesShown: TIMES_SHOWN + 1,
        correctCount: CORRECT_COUNT + 1,
        wrongCount: WRONG_COUNT,
        totalCorrectResponseTimeMs: TOTAL_CORRECT_RESPONSE_MS + FAST_RESPONSE_MS,
      });
    });
  });

  it("ignores a repeated attempt id", async () => {
    await withMatching(async ({ database, clock, reviews, games, executor }) => {
      const words: BoardWord[] = [
        { id: "river", portuguese: "rio", origin: "NEW" },
        { id: "stone", portuguese: "pedra", origin: "NEW" },
      ];
      insertWords(database, words);
      const linked = startLinked(clock, "review-repeat", "game-repeat", words);
      await reviews.create(linked.session, linked.game);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: linked.game.id, wordIds: ["river"] });
      clock.advance(ONE_SECOND_MS);
      const reviewedAt = clock.now();
      const attempt = {
        sessionId: linked.game.id,
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      };
      await games.recordAttempt(attempt);
      clock.advance(ONE_SECOND_MS);
      await games.recordAttempt(attempt);

      expect(await readAgenda(executor, "river")).toEqual(
        storedAgenda(scheduleReview(null, "GOOD", reviewedAt, TIME_ZONE), reviewedAt),
      );
      expect(await readCounters(executor, "river")).toEqual({
        timesShown: 1,
        correctCount: 1,
        wrongCount: 0,
        totalCorrectResponseTimeMs: FAST_RESPONSE_MS,
      });
      const answers = await executor.getAll<{ total: number }>(
        `SELECT COUNT(*) AS "total" FROM "GameAnswer" WHERE "attemptId" = ?`,
        [attempt.attemptId],
      );
      expect(answers[0]?.total).toBe(1);
    });
  });

  it("leaves the free practice agenda unchanged", async () => {
    await withMatching(async ({ database, clock, games, executor }) => {
      insertVisitor(database);
      const words = [
        plainWord("river", "rio"),
        plainWord("stone", "pedra"),
        plainWord("cloud", "nuvem"),
      ];
      insertWords(
        database,
        words.map((word) => ({ id: word.id, portuguese: word.portuguese, origin: "NEW" })),
      );
      insertProgress(database, "river", dueSchedule());
      const before = await readAgenda(executor, "river");
      const session = GameSession.start(
        { id: "game-free", visitorId: VISITOR_ID, mode: "FREE", words },
        clock,
      );
      await games.create(session);
      clock.advance(ONE_SECOND_MS);
      await games.recordExposures({ sessionId: session.id, wordIds: ["river", "stone"] });
      clock.advance(ONE_SECOND_MS);
      await games.recordAttempt({
        sessionId: session.id,
        attemptId: "attempt-free",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(await readAgenda(executor, "river")).toEqual(before);
      const fresh = await readAgenda(executor, "stone");
      expect(fresh?.nextReviewAt).toBeNull();
      expect(fresh?.lastReviewedAt).toBeNull();
      expect(fresh?.reviewState).toBe("LEARNING");
    });
  });
});

function startLinked(
  clock: ManualClock,
  reviewId: string,
  gameId: string,
  words: readonly BoardWord[],
): { session: ReviewSession; game: GameSession } {
  const session = ReviewSession.start(
    {
      id: reviewId,
      visitorId: VISITOR_ID,
      timeZone: TIME_ZONE,
      gameSessionId: gameId,
      words: words.map((word) => ({
        word: { id: word.id, english: word.id, portuguese: word.portuguese },
        stage: "MATCHING" as const,
        origin: word.origin,
      })),
    },
    clock,
  );
  const game = GameSession.start(
    {
      id: gameId,
      visitorId: VISITOR_ID,
      mode: "REVIEW",
      words: words.map((word) => plainWord(word.id, word.portuguese)),
      ungradedWordIds: words.filter((word) => word.origin === "DISTRACTOR").map((word) => word.id),
    },
    clock,
  );
  return { session, game };
}

function dueSchedule(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: new Date(STARTED_AT),
  };
}

function futureSchedule(): ReviewSchedule {
  return {
    ...dueSchedule(),
    nextReviewAt: new Date(STARTED_AT.getTime() + DAY_MS),
  };
}

function storedAgenda(schedule: ReviewSchedule, reviewedAt: Date): AgendaRow {
  return {
    lastReviewedAt: reviewedAt.toISOString(),
    nextReviewAt: schedule.nextReviewAt.toISOString(),
    reviewRepetitions: schedule.repetitions,
    reviewLapses: schedule.lapses,
    reviewIntervalDays: schedule.intervalDays,
    reviewEaseFactor: schedule.easeFactor,
    reviewState: schedule.state,
  };
}

function plainWord(id: string, portuguese = id): Word {
  return createWord({ id, english: id, portuguese });
}

function insertVisitor(database: Database.Database): void {
  const storedAt = STARTED_AT.toISOString();
  database.prepare(INSERT_VISITOR_SQL).run(VISITOR_ID, storedAt, storedAt);
}

function insertWords(database: Database.Database, words: readonly BoardWord[]): void {
  const storedAt = STARTED_AT.toISOString();
  const insert = database.prepare(INSERT_WORD_SQL);
  for (const word of words) {
    insert.run(
      word.id,
      word.id,
      word.portuguese,
      word.id,
      word.portuguese,
      null,
      ACTIVE_WORD,
      storedAt,
      storedAt,
    );
  }
}

function insertProgress(
  database: Database.Database,
  wordId: string,
  schedule: ReviewSchedule,
): void {
  const reviewedAt = new Date("2026-09-20T15:00:00.000Z").toISOString();
  database.prepare(INSERT_PROGRESS_SQL).run(
    VISITOR_ID,
    wordId,
    TIMES_SHOWN,
    CORRECT_COUNT,
    WRONG_COUNT,
    TOTAL_CORRECT_RESPONSE_MS,
    reviewedAt,
    schedule.nextReviewAt.toISOString(),
    schedule.repetitions,
    schedule.lapses,
    schedule.intervalDays,
    schedule.easeFactor,
    schedule.state,
    reviewedAt,
  );
}

async function readAgenda(
  executor: SqlExecutor,
  wordId: string,
): Promise<AgendaRow | null> {
  const rows = await executor.getAll<AgendaRow>(SELECT_AGENDA_SQL, [VISITOR_ID, wordId]);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    lastReviewedAt: row.lastReviewedAt,
    nextReviewAt: row.nextReviewAt,
    reviewRepetitions: Number(row.reviewRepetitions),
    reviewLapses: Number(row.reviewLapses),
    reviewIntervalDays: Number(row.reviewIntervalDays),
    reviewEaseFactor: Number(row.reviewEaseFactor),
    reviewState: row.reviewState,
  };
}

async function readCounters(executor: SqlExecutor, wordId: string): Promise<CounterRow | null> {
  const rows = await executor.getAll<CounterRow>(SELECT_COUNTERS_SQL, [VISITOR_ID, wordId]);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    timesShown: Number(row.timesShown),
    correctCount: Number(row.correctCount),
    wrongCount: Number(row.wrongCount),
    totalCorrectResponseTimeMs: Number(row.totalCorrectResponseTimeMs),
  };
}

async function withMatching(work: (context: MatchingContext) => Promise<void>): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      database.exec("PRAGMA foreign_keys = ON");
      const executor = createBetterSqliteExecutor(database);
      const clock = new ManualClock(STARTED_AT);
      const runInTransaction = runBetterSqliteTransaction(database);
      await migrate(executor, runInTransaction);
      await work({
        database,
        executor,
        clock,
        reviews: new SqliteReviewSessionRepository(executor, runInTransaction, clock),
        games: new SqliteGameSessionRepository(executor, runInTransaction, clock),
      });
    } finally {
      database.close();
    }
  });
}
