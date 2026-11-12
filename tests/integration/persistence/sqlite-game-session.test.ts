import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  AttemptConflictError,
  GameSessionNotFoundError,
  InvalidGameSessionError,
  InvalidWordCatalogError,
  SessionEndedError,
} from "@/lib/domain/game/errors";
import { GameSession } from "@/lib/domain/game/game-session";
import type { Clock, RandomSource, Word } from "@/lib/domain/game/types";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const OTHER_VISITOR_ID = "visitor-other";
const CREATED_AT = "2026-11-12T10:00:00.000Z";
const START = "2026-11-12T12:00:00.000Z";
const BOARD_SIZE = 5;
const AGENDA_COLUMNS = [
  "lastReviewedAt",
  "nextReviewAt",
  "reviewRepetitions",
  "reviewLapses",
  "reviewIntervalDays",
  "reviewEaseFactor",
  "reviewState",
] as const;

class FakeClock implements Clock {
  private current: Date;

  constructor(start: string) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

function seededRandom(seed: number): RandomSource {
  let state = seed;
  return {
    next() {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
  };
}

interface Learner {
  readonly database: Database.Database;
  readonly clock: FakeClock;
  readonly repository: SqliteGameSessionRepository;
  readonly catalog: SqliteWordCatalog;
}

async function createLearnerFile(filePath: string): Promise<void> {
  const database = new Database(filePath);
  try {
    await bootstrapEnglishDatabase({
      executor: createBetterSqliteExecutor(database),
      runInTransaction: runBetterSqliteTransaction(database),
      createVisitorId: () => VISITOR_ID,
      now: () => new Date(CREATED_AT),
    });
  } finally {
    database.close();
  }
}

async function useFile(
  filePath: string,
  work: (learner: Learner) => Promise<void>,
  options: { readonly clock?: FakeClock; readonly random?: RandomSource } = {},
): Promise<void> {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const executor = createBetterSqliteExecutor(database);
    const clock = options.clock ?? new FakeClock(START);
    const repository = new SqliteGameSessionRepository(
      executor,
      runBetterSqliteTransaction(database),
      clock,
    );
    const catalog = new SqliteWordCatalog(executor, options.random ?? seededRandom(7), clock);
    await work({ database, clock, repository, catalog });
  } finally {
    database.close();
  }
}

async function startFreeSession(learner: Learner, id: string): Promise<GameSession> {
  const words = await learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID });
  const session = GameSession.start({ id, visitorId: VISITOR_ID, words, mode: "FREE" }, learner.clock);
  await learner.repository.create(session);
  return session;
}

interface PlayOptions {
  readonly sessionId: string;
  readonly words: readonly Word[];
  readonly wrongBeforeCorrect: ReadonlySet<number>;
  readonly correctUpTo: number;
}

/**
 * Plays like the board: five pairs enter, each correct match frees a slot for
 * the next word. Wrong attempts pick the next word on the board.
 */
async function play(learner: Learner, options: PlayOptions): Promise<void> {
  const { repository, clock } = learner;
  const ids = options.words.map(({ id }) => id);
  clock.advance(300);
  await repository.recordExposures({ sessionId: options.sessionId, wordIds: ids.slice(0, BOARD_SIZE) });
  for (let index = 0; index < options.correctUpTo; index += 1) {
    const promptWordId = ids[index] ?? "";
    if (options.wrongBeforeCorrect.has(index)) {
      clock.advance(1_000);
      await repository.recordAttempt({
        sessionId: options.sessionId,
        attemptId: `${options.sessionId}-wrong-${index}`,
        promptWordId,
        selectedWordId: ids[index + 1] ?? "",
        responseTimeMs: 1_000,
      });
    }
    clock.advance(1_500);
    await repository.recordAttempt({
      sessionId: options.sessionId,
      attemptId: `${options.sessionId}-right-${index}`,
      promptWordId,
      selectedWordId: promptWordId,
      responseTimeMs: 1_500 + index * 100,
    });
    const nextWordId = ids[index + BOARD_SIZE];
    if (nextWordId !== undefined) {
      clock.advance(100);
      await repository.recordExposures({ sessionId: options.sessionId, wordIds: [nextWordId] });
    }
  }
}

describe("sqlite game session repository", () => {
  it("stores a free session of twenty and reopens it with the same metrics and lists", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      let expectedMetrics: unknown;
      let expectedLists: unknown;
      let expectedSnapshot: unknown;
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-full");
        expect(readSessionRow(learner.database, "session-full")).toMatchObject({
          mode: "FREE",
          status: "ACTIVE",
          targetWords: 20,
          correctAnswers: 0,
          wrongAnswers: 0,
          finishedAt: null,
          durationMs: null,
        });
        expect(readGradedFlags(learner.database, "session-full")).toEqual(Array(20).fill(0));
        await play(learner, {
          sessionId: session.id,
          words: session.words.map(({ word }) => word),
          wrongBeforeCorrect: new Set([0, 3, 7, 12]),
          correctUpTo: 20,
        });
        const stored = await learner.repository.findById("session-full");
        if (stored === null) {
          throw new Error("Session was not stored.");
        }
        expect(stored.status).toBe("COMPLETED");
        expectedMetrics = stored.result;
        expectedSnapshot = stored.toSnapshot();
        expectedLists = await learner.repository.readResultLists("session-full");
      });
      await useFile(filePath, async (learner) => {
        const reopened = await learner.repository.findById("session-full");
        if (reopened === null) {
          throw new Error("Session was not reopened.");
        }
        expect(reopened.toSnapshot()).toEqual(expectedSnapshot);
        expect(reopened.result).toEqual(expectedMetrics);
        expect(reopened.result).toMatchObject({
          status: "COMPLETED",
          targetWords: 20,
          completedWords: 20,
          correctAnswers: 20,
          wrongAnswers: 4,
          accuracy: (20 / 24) * 100,
        });
        const lists = await learner.repository.readResultLists("session-full");
        expect(lists).toEqual(expectedLists);
        expect(lists.reviewWords.length).toBeGreaterThan(0);
        expect(lists.reviewWords.length).toBeLessThanOrEqual(3);
        expect(lists.praiseWords.length).toBeGreaterThan(0);
        expect(lists.praiseWords.length).toBeLessThanOrEqual(3);
        const row = readSessionRow(learner.database, "session-full");
        expect(row).toMatchObject({
          status: "COMPLETED",
          correctAnswers: 20,
          wrongAnswers: 4,
        });
        expect(row.finishedAt).not.toBeNull();
        expect(row.durationMs).toBe(reopened.result?.durationMs);
        expect(readAnswerVersions(learner.database, "session-full")).toEqual(Array(24).fill(2));
        expect(readCompletedCount(learner.database, "session-full")).toBe(20);
        const progress = readProgress(learner.database, VISITOR_ID);
        expect(progress).toHaveLength(20);
        expect(progress.every((entry) => entry.timesShown === 1)).toBe(true);
        expect(progress.every((entry) => entry.correctCount === 1)).toBe(true);
        expect(progress.reduce((sum, entry) => sum + entry.wrongCount, 0)).toBe(4);
      });
    });
  });

  it("counts an exposure once per word and session", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-exposure");
        const ids = session.words.map(({ word }) => word.id);
        learner.clock.advance(200);
        await learner.repository.recordExposures({ sessionId: session.id, wordIds: ids.slice(0, 5) });
        const firstPresented = readPresentedAt(learner.database, session.id, ids[0] ?? "");
        learner.clock.advance(5_000);
        const repeated = await learner.repository.recordExposures({
          sessionId: session.id,
          wordIds: ids.slice(1, 6),
        });
        expect(repeated.map(({ isNew }) => isNew)).toEqual([false, false, false, false, true]);
        await learner.repository.recordExposures({ sessionId: session.id, wordIds: [ids[0] ?? ""] });
        expect(readPresentedAt(learner.database, session.id, ids[0] ?? "")).toBe(firstPresented);
        const progress = readProgress(learner.database, VISITOR_ID);
        expect(progress).toHaveLength(6);
        expect(progress.every((entry) => entry.timesShown === 1)).toBe(true);
      });
      await useFile(filePath, async (learner) => {
        const second = await startFreeSession(learner, "session-exposure-2");
        const shared = second.words.find(({ word }) =>
          readProgress(learner.database, VISITOR_ID).some((entry) => entry.wordId === word.id),
        );
        if (shared === undefined) {
          throw new Error("Expected a word seen in the previous session.");
        }
        learner.clock.advance(200);
        await learner.repository.recordExposures({ sessionId: second.id, wordIds: [shared.word.id] });
        const entry = readProgress(learner.database, VISITOR_ID).find(
          ({ wordId }) => wordId === shared.word.id,
        );
        expect(entry?.timesShown).toBe(2);
      });
    });
  });

  it("does not count the same attempt twice", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-repeat");
        const other = await startFreeSession(learner, "session-repeat-other");
        const ids = session.words.map(({ word }) => word.id);
        const promptWordId = ids[0] ?? "";
        learner.clock.advance(200);
        await learner.repository.recordExposures({ sessionId: session.id, wordIds: ids.slice(0, 5) });
        learner.clock.advance(1_000);
        const wrong = {
          sessionId: session.id,
          attemptId: "attempt-wrong",
          promptWordId,
          selectedWordId: ids[1] ?? "",
          responseTimeMs: 900,
        };
        const right = { ...wrong, attemptId: "attempt-right", selectedWordId: promptWordId };
        await learner.repository.recordAttempt(wrong);
        await learner.repository.recordAttempt(right);
        const progressBefore = readProgress(learner.database, VISITOR_ID);
        const sessionBefore = readSessionRow(learner.database, session.id);
        learner.clock.advance(1_000);
        const repeatedWrong = await learner.repository.recordAttempt(wrong);
        const repeatedRight = await learner.repository.recordAttempt(right);
        expect(repeatedWrong.isCorrect).toBe(false);
        expect(repeatedRight.isCorrect).toBe(true);
        expect(readAnswerVersions(learner.database, session.id)).toHaveLength(2);
        expect(readProgress(learner.database, VISITOR_ID)).toEqual(progressBefore);
        expect(readSessionRow(learner.database, session.id)).toEqual(sessionBefore);
        await expect(
          learner.repository.recordAttempt({ ...wrong, selectedWordId: ids[2] ?? "" }),
        ).rejects.toBeInstanceOf(AttemptConflictError);
        await expect(
          learner.repository.recordAttempt({ ...wrong, sessionId: other.id }),
        ).rejects.toBeInstanceOf(AttemptConflictError);
        expect(readProgress(learner.database, VISITOR_ID)).toEqual(progressBefore);
      });
    });
  });

  it("keeps exposure and errors without a correct time for a word never matched", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-missed");
        const ids = session.words.map(({ word }) => word.id);
        const missed = ids[0] ?? "";
        learner.clock.advance(200);
        await learner.repository.recordExposures({ sessionId: session.id, wordIds: ids.slice(0, 5) });
        for (const [index, selected] of [ids[1], ids[2]].entries()) {
          learner.clock.advance(1_000);
          await learner.repository.recordAttempt({
            sessionId: session.id,
            attemptId: `missed-${index}`,
            promptWordId: missed,
            selectedWordId: selected ?? "",
            responseTimeMs: 1_000,
          });
        }
        learner.clock.advance(1_000);
        await learner.repository.abandon(session.id);
        const entry = readProgress(learner.database, VISITOR_ID).find(({ wordId }) => wordId === missed);
        expect(entry).toMatchObject({
          timesShown: 1,
          correctCount: 0,
          wrongCount: 2,
          totalCorrectResponseTimeMs: 0,
        });
        expect(readCompletedCount(learner.database, session.id)).toBe(0);
      });
    });
  });

  it("leaves the review agenda columns untouched in free mode", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const scheduled = vocabularySeed.map(({ id }) => id);
      seedScheduledProgress(filePath, scheduled);
      const before = readAgenda(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-agenda");
        await play(learner, {
          sessionId: session.id,
          words: session.words.map(({ word }) => word),
          wrongBeforeCorrect: new Set([1, 2]),
          correctUpTo: 20,
        });
      });
      expect(readAgenda(filePath)).toEqual(before);
    });
  });

  it("writes no agenda for words seen for the first time in free mode", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-new-agenda");
        await play(learner, {
          sessionId: session.id,
          words: session.words.map(({ word }) => word),
          wrongBeforeCorrect: new Set([0]),
          correctUpTo: 20,
        });
      });
      const agenda = readAgenda(filePath);
      expect(agenda).toHaveLength(20);
      for (const entry of agenda) {
        expect(entry).toMatchObject({
          lastReviewedAt: null,
          nextReviewAt: null,
          reviewRepetitions: 0,
          reviewLapses: 0,
          reviewIntervalDays: 0,
          reviewEaseFactor: 2.5,
          reviewState: "LEARNING",
        });
      }
    });
  });

  it("abandons with status, finish time and duration and keeps the attempts made", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-abandon");
        await play(learner, {
          sessionId: session.id,
          words: session.words.map(({ word }) => word),
          wrongBeforeCorrect: new Set([1]),
          correctUpTo: 3,
        });
        const progressBefore = readProgress(learner.database, VISITOR_ID);
        learner.clock.advance(2_000);
        const abandoned = await learner.repository.abandon(session.id);
        expect(abandoned.status).toBe("ABANDONED");
        const row = readSessionRow(learner.database, session.id);
        expect(row).toMatchObject({ status: "ABANDONED", correctAnswers: 3, wrongAnswers: 1 });
        expect(row.finishedAt).toBe(learner.clock.now().toISOString());
        expect(row.durationMs).toBe(learner.clock.now().getTime() - new Date(START).getTime());
        expect(readProgress(learner.database, VISITOR_ID)).toEqual(progressBefore);
        await expect(
          learner.repository.recordAttempt({
            sessionId: session.id,
            attemptId: "after-abandon",
            promptWordId: session.words[3]?.word.id ?? "",
            selectedWordId: session.words[3]?.word.id ?? "",
            responseTimeMs: 500,
          }),
        ).rejects.toBeInstanceOf(SessionEndedError);
        learner.clock.advance(2_000);
        const again = await learner.repository.abandon(session.id);
        expect(again.status).toBe("ABANDONED");
        expect(readSessionRow(learner.database, session.id)).toEqual(row);
      });
      await useFile(filePath, async (learner) => {
        const reopened = await learner.repository.findById("session-abandon");
        expect(reopened?.result).toMatchObject({
          status: "ABANDONED",
          correctAnswers: 3,
          wrongAnswers: 1,
          completedWords: 3,
        });
      });
    });
  });

  it("keeps a completed session completed when it is abandoned afterwards", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const session = await startFreeSession(learner, "session-done");
        await play(learner, {
          sessionId: session.id,
          words: session.words.map(({ word }) => word),
          wrongBeforeCorrect: new Set(),
          correctUpTo: 20,
        });
        const row = readSessionRow(learner.database, session.id);
        learner.clock.advance(1_000);
        const result = await learner.repository.abandon(session.id);
        expect(result.status).toBe("COMPLETED");
        expect(readSessionRow(learner.database, session.id)).toEqual(row);
      });
    });
  });

  it("refuses unknown sessions, other modes and tampered counters", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        expect(await learner.repository.findById("ghost")).toBeNull();
        await expect(
          learner.repository.recordAttempt({
            sessionId: "ghost",
            attemptId: "ghost-attempt",
            promptWordId: "a",
            selectedWordId: "a",
            responseTimeMs: 1,
          }),
        ).rejects.toBeInstanceOf(GameSessionNotFoundError);
        await expect(
          learner.repository.recordExposures({ sessionId: "ghost", wordIds: ["a"] }),
        ).rejects.toBeInstanceOf(GameSessionNotFoundError);
        await expect(learner.repository.abandon("ghost")).rejects.toBeInstanceOf(
          GameSessionNotFoundError,
        );
        const words = await learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID });
        const review = GameSession.start(
          { id: "session-review", visitorId: VISITOR_ID, words, mode: "REVIEW" },
          learner.clock,
        );
        await expect(learner.repository.create(review)).rejects.toBeInstanceOf(
          InvalidGameSessionError,
        );
        expect(countSessions(learner.database)).toBe(0);
        await startFreeSession(learner, "session-tampered");
        learner.database
          .prepare(`UPDATE "GameSession" SET "wrongAnswers" = 5 WHERE "id" = ?`)
          .run("session-tampered");
        await expect(learner.repository.findById("session-tampered")).rejects.toBeInstanceOf(
          InvalidGameSessionError,
        );
      });
    });
  });
});

describe("sqlite practice draw", () => {
  it("draws twenty distinct active words from the learner file", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (learner) => {
        const words = await learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID });
        expect(words).toHaveLength(20);
        expect(new Set(words.map(({ id }) => id)).size).toBe(20);
        expect(words.every((word) => word.active)).toBe(true);
      });
    });
  });

  it("leaves inactive words out and fails below twenty active words", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const inactive = vocabularySeed.slice(0, 12).map(({ id }) => id);
      setInactive(filePath, inactive);
      await useFile(filePath, async (learner) => {
        const words = await learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID });
        expect(words.map(({ id }) => id).sort()).toEqual(
          vocabularySeed.slice(12).map(({ id }) => id).sort(),
        );
      });
      setInactive(filePath, [vocabularySeed[12]?.id ?? ""]);
      await useFile(filePath, async (learner) => {
        await expect(
          learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID }),
        ).rejects.toBeInstanceOf(InvalidWordCatalogError);
      });
    });
  });

  it("weighs only the learner's own history", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const sorted = vocabularySeed.map(({ id }) => id).sort();
      const lastTwelve = sorted.slice(20);
      seedOtherVisitorHardWords(filePath, lastTwelve);
      await useFile(
        filePath,
        async (learner) => {
          const words = await learner.catalog.drawPracticeWords({ visitorId: VISITOR_ID });
          expect(words.map(({ id }) => id).sort()).toEqual(sorted.slice(0, 20));
        },
        { random: { next: () => 0.5 } },
      );
      await useFile(
        filePath,
        async (learner) => {
          const words = await learner.catalog.drawPracticeWords({ visitorId: OTHER_VISITOR_ID });
          expect(words.map(({ id }) => id)).toEqual(expect.arrayContaining(lastTwelve));
        },
        { random: { next: () => 0.5 } },
      );
    });
  });
});

interface StoredSessionRow {
  mode: string;
  status: string;
  targetWords: number;
  correctAnswers: number;
  wrongAnswers: number;
  finishedAt: string | null;
  durationMs: number | null;
}

function readSessionRow(database: Database.Database, sessionId: string): StoredSessionRow {
  return database
    .prepare(
      `SELECT "mode", "status", "targetWords", "correctAnswers", "wrongAnswers",
              "finishedAt", "durationMs"
       FROM "GameSession" WHERE "id" = ?`,
    )
    .get(sessionId) as StoredSessionRow;
}

function readGradedFlags(database: Database.Database, sessionId: string): number[] {
  const rows = database
    .prepare(`SELECT "graded" FROM "GameSessionWord" WHERE "sessionId" = ? ORDER BY "sequence"`)
    .all(sessionId) as { graded: number }[];
  return rows.map(({ graded }) => graded);
}

function readPresentedAt(
  database: Database.Database,
  sessionId: string,
  wordId: string,
): string | null {
  const row = database
    .prepare(`SELECT "presentedAt" FROM "GameSessionWord" WHERE "sessionId" = ? AND "wordId" = ?`)
    .get(sessionId, wordId) as { presentedAt: string | null };
  return row.presentedAt;
}

function readAnswerVersions(database: Database.Database, sessionId: string): number[] {
  const rows = database
    .prepare(
      `SELECT "responseTimeMeasurementVersion" AS "version"
       FROM "GameAnswer" WHERE "sessionId" = ? ORDER BY "sequence"`,
    )
    .all(sessionId) as { version: number }[];
  return rows.map(({ version }) => version);
}

function readCompletedCount(database: Database.Database, sessionId: string): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS "total" FROM "GameSessionWord"
       WHERE "sessionId" = ? AND "completedAt" IS NOT NULL`,
    )
    .get(sessionId) as { total: number };
  return row.total;
}

function countSessions(database: Database.Database): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "GameSession"`).get() as {
    total: number;
  };
  return row.total;
}

interface ProgressRow {
  wordId: string;
  timesShown: number;
  correctCount: number;
  wrongCount: number;
  totalCorrectResponseTimeMs: number;
}

function readProgress(database: Database.Database, visitorId: string): ProgressRow[] {
  return database
    .prepare(
      `SELECT "wordId", "timesShown", "correctCount", "wrongCount", "totalCorrectResponseTimeMs"
       FROM "LearnerWordProgress" WHERE "visitorId" = ? ORDER BY "wordId"`,
    )
    .all(visitorId) as ProgressRow[];
}

function readAgenda(filePath: string): Record<(typeof AGENDA_COLUMNS)[number], unknown>[] {
  const database = new Database(filePath);
  try {
    const columns = AGENDA_COLUMNS.map((column) => `"${column}"`).join(", ");
    return database
      .prepare(
        `SELECT "wordId", ${columns} FROM "LearnerWordProgress"
         WHERE "visitorId" = ? ORDER BY "wordId"`,
      )
      .all(VISITOR_ID) as Record<(typeof AGENDA_COLUMNS)[number], unknown>[];
  } finally {
    database.close();
  }
}

function seedScheduledProgress(filePath: string, wordIds: readonly string[]): void {
  const database = new Database(filePath);
  try {
    const insert = database.prepare(
      `INSERT INTO "LearnerWordProgress" (
         "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
         "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
         "reviewRepetitions", "reviewLapses", "reviewIntervalDays", "reviewEaseFactor",
         "reviewState", "updatedAt"
       ) VALUES (?, ?, 4, 3, 1, 5400, ?, ?, 2, 1, 6, 2.36, 'REVIEW', ?)`,
    );
    for (const wordId of wordIds) {
      insert.run(VISITOR_ID, wordId, CREATED_AT, "2026-11-14T10:00:00.000Z", CREATED_AT);
    }
  } finally {
    database.close();
  }
}

function seedOtherVisitorHardWords(filePath: string, wordIds: readonly string[]): void {
  const database = new Database(filePath);
  try {
    database
      .prepare(`INSERT INTO "AnonymousVisitor" ("id") VALUES (?)`)
      .run(OTHER_VISITOR_ID);
    const insert = database.prepare(
      `INSERT INTO "LearnerWordProgress" (
         "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
         "totalCorrectResponseTimeMs", "updatedAt"
       ) VALUES (?, ?, 10, 2, 8, 4000, ?)`,
    );
    for (const wordId of wordIds) {
      insert.run(OTHER_VISITOR_ID, wordId, CREATED_AT);
    }
  } finally {
    database.close();
  }
}

function setInactive(filePath: string, wordIds: readonly string[]): void {
  const database = new Database(filePath);
  try {
    const update = database.prepare(`UPDATE "Word" SET "active" = 0 WHERE "id" = ?`);
    for (const wordId of wordIds) {
      update.run(wordId);
    }
  } finally {
    database.close();
  }
}
