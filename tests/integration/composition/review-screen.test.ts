import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createReviewComposition, createReviewScreenPort, type ReviewComposition } from "@/composition/review";
import type { Clock } from "@/lib/domain/game/types";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { ReviewScreenController } from "@/lib/presentation/review/review-screen";
import type { TypingCardSubmission } from "@/lib/presentation/review/typing-card";
import { migrate } from "@/persistence/migrate";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteReviewSessionRepository } from "@/persistence/sqlite-review-session-repository";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import { normalizeVocabularyText } from "../../../prisma/seed-data";
import { createBetterSqliteExecutor, runBetterSqliteTransaction } from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-1";
const TIME_ZONE = DEFAULT_TIME_ZONE;
const STARTED_AT = new Date("2026-11-12T15:00:00.000Z");
const GOOD_RESPONSE_MS = 3_000;
const ACTIVE_WORD = 1;

class ManualClock implements Clock {
  private instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }
}

describe("review screen against sqlite", () => {
  it("abandons a session left in the middle and keeps the grades already given", async () => {
    await withScreen(async ({ database, controller }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", null, STARTED_AT);
      insertWord(database, "book", "book", "livro", null, new Date(STARTED_AT.getTime() + 1_000));
      insertProgress(database, "apple", dueReview());
      insertProgress(database, "book", dueReview());
      const bookBefore = readAgenda(database, "book");

      await controller.start();
      await controller.submitTyping(answer("apple"));
      const sessionId = openSessionId(controller);
      await controller.leave();

      expect(readStatus(database, sessionId)).toBe("ABANDONED");
      expect(readTyping(database, "attempt-1")).toMatchObject({
        grade: "GOOD",
        isReinforcement: 0,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      expect(readAgenda(database, "apple")?.nextReviewAt).not.toBe(dueReview().nextReviewAt.toISOString());
      expect(readAgenda(database, "book")).toEqual(bookBefore);
    });
  });

  it("stores the schedules of a finished session and shows the same result as the database", async () => {
    await withScreen(async ({ database, controller, clock }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", null, STARTED_AT);
      insertWord(database, "book", "book", "livro", null, new Date(STARTED_AT.getTime() + 1_000));
      insertWord(database, "house", "house", "casa", null, new Date(STARTED_AT.getTime() + 2_000));
      insertWord(database, "river", "river", "rio", null, new Date(STARTED_AT.getTime() + 3_000));
      insertProgress(database, "apple", dueReview());

      await controller.start();
      await controller.submitTyping(answer("apple"));
      await controller.advance();
      const stage = controller.state;
      if (stage.kind !== "matching") {
        throw new Error(`Expected the matching stage, got ${stage.kind}.`);
      }
      const matching = stage.matching;
      const wordIds = matching.words.map((entry) => entry.id);
      expect(new Set(wordIds)).toEqual(new Set(["book", "house", "river"]));

      await controller.cardsReady(wordIds);
      await controller.attempt({
        attemptId: "pair-miss",
        promptWordId: "book",
        selectedWordId: "house",
        isCorrect: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      for (const wordId of wordIds) {
        await controller.attempt({
          attemptId: `pair-${wordId}`,
          promptWordId: wordId,
          selectedWordId: wordId,
          isCorrect: true,
          responseTimeMs: GOOD_RESPONSE_MS,
        });
      }

      const shown = controller.state;
      if (shown.kind !== "result") {
        throw new Error(`Expected the result, got ${shown.kind}.`);
      }
      const stored = readStoredResult(database, matching.sessionId, matching.gameSessionId, clock.now());

      expect(readStatus(database, matching.sessionId)).toBe("COMPLETED");
      expect(stored.gameStatus).toBe("COMPLETED");
      expect(shown.result.correctAnswers).toBe(stored.correctAnswers);
      expect(shown.result.wrongAnswers).toBe(stored.wrongAnswers);
      expect(shown.result.remainingDueToday).toBe(stored.remainingDueToday);
      expect(shown.result.nextReviewAt).toBe(stored.nextReviewAt);
      expect(readAgenda(database, "apple")?.reviewState).not.toBeNull();
      for (const wordId of wordIds) {
        expect(readAgenda(database, wordId)?.nextReviewAt).toEqual(expect.any(String));
      }
      expect(readPresented(database, matching.gameSessionId)).toEqual(wordIds);
    });
  });
});

async function withScreen(
  verify: (opened: {
    database: Database.Database;
    controller: ReviewScreenController;
    clock: ManualClock;
  }) => Promise<void>,
): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      const runInTransaction = runBetterSqliteTransaction(database);
      await migrate(executor, runInTransaction);
      const clock = new ManualClock(STARTED_AT);
      let sequence = 0;
      const composition: ReviewComposition = createReviewComposition({
        repository: new SqliteReviewSessionRepository(executor, runInTransaction, clock),
        reader: new SqliteDailyReviewReader(executor),
        preferences: new SqliteVisitorPreferences(executor),
        board: new SqliteGameSessionRepository(executor, runInTransaction, clock),
        clock,
        createId: () => {
          sequence += 1;
          return `review-${sequence}`;
        },
        resolveTimeZone: async () => TIME_ZONE,
        recordEvent: () => undefined,
      });
      const port = createReviewScreenPort({
        prepare: async () => ({ composition, visitorId: VISITOR_ID }),
      });
      let attempt = 0;
      const controller = new ReviewScreenController({
        port,
        now: () => clock.now(),
        createAttemptId: () => {
          attempt += 1;
          return `attempt-${attempt}`;
        },
        onChange: () => undefined,
      });
      await verify({ database, controller, clock });
    } finally {
      database.close();
    }
  });
}

function answer(wordId: string): TypingCardSubmission {
  return {
    wordId,
    reinforcement: false,
    kind: "answer",
    typed: wordId,
    usedHint: false,
    responseTimeMs: GOOD_RESPONSE_MS,
  };
}

function openSessionId(controller: ReviewScreenController): string {
  const state = controller.state;
  if (state.kind === "typing") {
    return state.typing.sessionId;
  }
  throw new Error(`Expected an open typing session, got ${state.kind}.`);
}

function insertVisitor(database: Database.Database): void {
  database
    .prepare(`INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt") VALUES (?, ?, ?)`)
    .run(VISITOR_ID, STARTED_AT.toISOString(), STARTED_AT.toISOString());
}

function insertWord(
  database: Database.Database,
  id: string,
  english: string,
  portuguese: string,
  exampleSentence: string | null,
  createdAt: Date,
): void {
  const storedAt = createdAt.toISOString();
  database
    .prepare(
      `INSERT INTO "Word" (
        "id", "english", "portuguese", "englishNormalized", "portugueseNormalized",
        "exampleSentence", "active", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      english,
      portuguese,
      normalizeVocabularyText(english),
      normalizeVocabularyText(portuguese),
      exampleSentence,
      ACTIVE_WORD,
      storedAt,
      storedAt,
    );
}

function insertProgress(database: Database.Database, wordId: string, schedule: ReviewSchedule): void {
  database
    .prepare(
      `INSERT INTO "LearnerWordProgress" (
        "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
        "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
        "reviewRepetitions", "reviewLapses", "reviewIntervalDays", "reviewEaseFactor",
        "reviewState", "updatedAt"
      ) VALUES (?, ?, 1, 1, 0, 0, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      VISITOR_ID,
      wordId,
      schedule.nextReviewAt.toISOString(),
      schedule.repetitions,
      schedule.lapses,
      schedule.intervalDays,
      schedule.easeFactor,
      schedule.state,
      STARTED_AT.toISOString(),
    );
}

function dueReview(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: new Date("2026-11-12T03:00:00.000Z"),
  };
}

function readAgenda(database: Database.Database, wordId: string): { nextReviewAt: string | null; reviewState: string | null } | null {
  const row = database
    .prepare(
      `SELECT "nextReviewAt", "reviewState" FROM "LearnerWordProgress"
       WHERE "visitorId" = ? AND "wordId" = ?`,
    )
    .get(VISITOR_ID, wordId) as { nextReviewAt: string | null; reviewState: string | null } | undefined;
  return row ?? null;
}

function readStatus(database: Database.Database, sessionId: string): string | null {
  const row = database.prepare(`SELECT "status" FROM "ReviewSession" WHERE "id" = ?`).get(sessionId) as
    | { status: string }
    | undefined;
  return row?.status ?? null;
}

function readTyping(database: Database.Database, attemptId: string): {
  grade: string | null;
  isReinforcement: number;
  responseTimeMs: number;
} | null {
  const row = database
    .prepare(`SELECT "grade", "isReinforcement", "responseTimeMs" FROM "TypingAttempt" WHERE "attemptId" = ?`)
    .get(attemptId) as { grade: string | null; isReinforcement: number; responseTimeMs: number } | undefined;
  return row ?? null;
}

function readPresented(database: Database.Database, gameId: string): string[] {
  const rows = database
    .prepare(
      `SELECT "wordId" FROM "GameSessionWord"
       WHERE "sessionId" = ? AND "presentedAt" IS NOT NULL
       ORDER BY "sequence"`,
    )
    .all(gameId) as { wordId: string }[];
  return rows.map((row) => row.wordId);
}

function readStoredResult(
  database: Database.Database,
  sessionId: string,
  gameId: string,
  now: Date,
): {
  correctAnswers: number;
  wrongAnswers: number;
  remainingDueToday: number;
  nextReviewAt: string | null;
  gameStatus: string;
} {
  const typing = database
    .prepare(
      `SELECT "outcome" FROM "TypingAttempt"
       WHERE "sessionId" = ? AND "isReinforcement" = 0`,
    )
    .all(sessionId) as { outcome: string }[];
  const game = database
    .prepare(`SELECT "status", "correctAnswers", "wrongAnswers" FROM "GameSession" WHERE "id" = ?`)
    .get(gameId) as { status: string; correctAnswers: number; wrongAnswers: number };
  const due = database
    .prepare(
      `SELECT COUNT(*) AS "total" FROM "LearnerWordProgress" AS p
       INNER JOIN "Word" AS w ON w."id" = p."wordId"
       WHERE p."visitorId" = ? AND w."active" = ? AND p."nextReviewAt" <= ?`,
    )
    .get(VISITOR_ID, ACTIVE_WORD, now.toISOString()) as { total: number };
  const next = database
    .prepare(
      `SELECT p."nextReviewAt" AS "nextReviewAt" FROM "LearnerWordProgress" AS p
       INNER JOIN "Word" AS w ON w."id" = p."wordId"
       WHERE p."visitorId" = ? AND w."active" = ? AND p."nextReviewAt" > ?
       ORDER BY p."nextReviewAt" ASC, p."wordId" ASC
       LIMIT 1`,
    )
    .get(VISITOR_ID, ACTIVE_WORD, now.toISOString()) as { nextReviewAt: string } | undefined;
  const typingCorrect = typing.filter((row) => row.outcome === "CORRECT" || row.outcome === "ALMOST").length;
  const typingWrong = typing.length - typingCorrect;
  return {
    correctAnswers: typingCorrect + game.correctAnswers,
    wrongAnswers: typingWrong + game.wrongAnswers,
    remainingDueToday: Number(due.total),
    nextReviewAt: next?.nextReviewAt ?? null,
    gameStatus: game.status,
  };
}
