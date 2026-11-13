import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  DAILY_NEW_WORD_LIMIT,
  DAILY_REVIEW_SESSION_LIMIT,
  planDailyReview,
} from "@/lib/domain/learning/daily-review-plan";
import { DEFAULT_TIME_ZONE, localDateOf, startOfLocalDay } from "@/lib/domain/learning/local-day";
import { migrate } from "@/persistence/migrate";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const TIME_ZONE = DEFAULT_TIME_ZONE;
const NOW = new Date("2026-11-12T15:00:00.000Z");
const VISITOR_ID = "visitor-plan";
const OTHER_VISITOR_ID = "visitor-other";
const ACTIVE_WORD = 1;
const INACTIVE_WORD = 0;
const FIRST_DAY_WORD_COUNT = 12;
const OVERDUE_WORD_COUNT = 22;
const CATALOG_SIZE = 5_000;
const DUE_CATALOG_COUNT = 2_500;
const PLAN_READ_LIMIT_MS = 500;
const ONE_MINUTE_MS = 60_000;
const NEW_WORD_ORIGIN = "NEW";
const DUE_WORD_ORIGIN = "DUE";
const MATCHING_STAGE = "MATCHING";
const ABANDONED_STATUS = "ABANDONED";
const ACTIVE_STATUS = "ACTIVE";
const REVIEW_STATE = "REVIEW";
const LEARNING_STATE = "LEARNING";
const STORED_REPETITIONS = 2;
const STORED_LAPSES = 0;
const STORED_INTERVAL_DAYS = 6;
const STORED_EASE = 2.5;

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

const INSERT_SESSION_SQL = `
INSERT INTO "ReviewSession" (
  "id", "visitorId", "localDate", "timeZone", "status", "startedAt", "finishedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_SESSION_WORD_SQL = `
INSERT INTO "ReviewSessionWord" ("sessionId", "wordId", "sequence", "stage", "origin")
VALUES (?, ?, ?, ?, ?)
`;

interface PlanContext {
  readonly database: Database.Database;
  readonly reader: SqliteDailyReviewReader;
}

describe("sqlite daily review plan", () => {
  it("loads only new words on the first day and the plan keeps ten of them for matching", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      const wordIds = Array.from({ length: FIRST_DAY_WORD_COUNT }, (_, index) => `fresh-${index}`);
      for (const [index, wordId] of wordIds.entries()) {
        insertWord(database, {
          wordId,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index, 0)),
        });
      }

      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const plan = planDailyReview({
        ...inputs,
        sessionLimit: DAILY_REVIEW_SESSION_LIMIT,
        dailyNewLimit: DAILY_NEW_WORD_LIMIT,
        now: NOW,
      });

      expect(inputs.due).toEqual([]);
      expect(inputs.introducedToday).toBe(0);
      expect(inputs.newCandidates).toEqual(wordIds);
      expect(plan.typingWordIds).toEqual([]);
      expect(plan.newWordIds).toEqual(wordIds.slice(0, DAILY_NEW_WORD_LIMIT));
      expect(plan.matchingWordIds).toEqual(plan.newWordIds);
    });
  });

  it("returns every overdue word from the most late to the least late and leaves the rest after twenty", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      const overdueIds = Array.from({ length: OVERDUE_WORD_COUNT }, (_, index) => `due-${index}`);
      for (const [index, wordId] of overdueIds.entries()) {
        insertWord(database, { wordId, createdAt: NOW });
        insertSchedule(database, {
          wordId,
          nextReviewAt: startOfLocalDay(NOW, TIME_ZONE, -(OVERDUE_WORD_COUNT - index)),
          state: index % 2 === 0 ? REVIEW_STATE : LEARNING_STATE,
        });
      }
      insertWord(database, { wordId: "future-word", createdAt: NOW });
      insertSchedule(database, {
        wordId: "future-word",
        nextReviewAt: startOfLocalDay(NOW, TIME_ZONE, 1),
        state: REVIEW_STATE,
      });

      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const plan = planDailyReview({
        ...inputs,
        sessionLimit: DAILY_REVIEW_SESSION_LIMIT,
        dailyNewLimit: DAILY_NEW_WORD_LIMIT,
        now: NOW,
      });

      const admitted = overdueIds.slice(0, DAILY_REVIEW_SESSION_LIMIT);
      expect(inputs.due.map((item) => item.wordId)).toEqual(overdueIds);
      expect(inputs.due.map((item) => item.wordId)).not.toContain("future-word");
      expect(inputs.due[1]?.schedule.state).toBe(LEARNING_STATE);
      expect(plan.typingWordIds).toEqual(admitted.filter((_, index) => index % 2 === 0));
      expect(plan.matchingWordIds).toEqual(admitted.filter((_, index) => index % 2 === 1));
      expect(inputs.due.slice(DAILY_REVIEW_SESSION_LIMIT).map((item) => item.wordId)).toEqual(
        overdueIds.slice(DAILY_REVIEW_SESSION_LIMIT),
      );
    });
  });

  it("keeps a future review out of the plan and agrees with the entry summary", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      const yesterday = startOfLocalDay(NOW, TIME_ZONE, -1);
      const today = startOfLocalDay(NOW, TIME_ZONE, 0);
      const tomorrow = startOfLocalDay(NOW, TIME_ZONE, 1);
      insertWord(database, { wordId: "yesterday", createdAt: NOW });
      insertWord(database, { wordId: "today", createdAt: NOW });
      insertWord(database, { wordId: "tomorrow", createdAt: NOW });
      insertSchedule(database, {
        wordId: "yesterday",
        nextReviewAt: yesterday,
        state: REVIEW_STATE,
      });
      insertSchedule(database, { wordId: "today", nextReviewAt: today, state: REVIEW_STATE });
      insertSchedule(database, {
        wordId: "tomorrow",
        nextReviewAt: tomorrow,
        state: REVIEW_STATE,
      });

      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const summary = await reader.summary(VISITOR_ID, NOW, TIME_ZONE);
      const remainingNewWords = Math.max(0, DAILY_NEW_WORD_LIMIT - inputs.introducedToday);

      expect(inputs.due.map((item) => item.wordId)).toEqual(["yesterday", "today"]);
      expect(inputs.due[0]?.schedule.nextReviewAt).toEqual(yesterday);
      expect(inputs.newCandidates).toEqual([]);
      expect(summary).toEqual({
        dueCount: inputs.due.length,
        newAvailable: Math.min(inputs.newCandidates.length, remainingNewWords),
        nextReviewAt: tomorrow,
      });
      const studied = await reader.listStudied(VISITOR_ID);
      expect(studied.map((item) => item.wordId).sort()).toEqual(["today", "tomorrow", "yesterday"]);
    });
  });

  it("counts new words already introduced today, including an abandoned session", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      insertVisitor(database, OTHER_VISITOR_ID);
      const candidateIds = Array.from({ length: FIRST_DAY_WORD_COUNT }, (_, index) => `new-${index}`);
      for (const [index, wordId] of candidateIds.entries()) {
        insertWord(database, {
          wordId,
          createdAt: new Date(Date.UTC(2026, 0, 2, 0, index, 0)),
        });
      }
      const introducedIds = candidateIds.slice(0, DAILY_NEW_WORD_LIMIT);
      for (const [index, wordId] of introducedIds.entries()) {
        insertIntroduction(database, {
          sessionId: `introduced-${index}`,
          visitorId: VISITOR_ID,
          wordId,
          localDate: localDateOf(NOW, TIME_ZONE),
          origin: NEW_WORD_ORIGIN,
          status: index === 0 ? ABANDONED_STATUS : ACTIVE_STATUS,
        });
      }
      insertIntroduction(database, {
        sessionId: "introduced-again",
        visitorId: VISITOR_ID,
        wordId: introducedIds[0] ?? "new-0",
        localDate: localDateOf(NOW, TIME_ZONE),
        origin: NEW_WORD_ORIGIN,
        status: ACTIVE_STATUS,
      });
      insertIntroduction(database, {
        sessionId: "introduced-due",
        visitorId: VISITOR_ID,
        wordId: "new-10",
        localDate: localDateOf(NOW, TIME_ZONE),
        origin: DUE_WORD_ORIGIN,
        status: ACTIVE_STATUS,
      });
      insertIntroduction(database, {
        sessionId: "introduced-yesterday",
        visitorId: VISITOR_ID,
        wordId: "new-11",
        localDate: localDateOf(startOfLocalDay(NOW, TIME_ZONE, -1), TIME_ZONE),
        origin: NEW_WORD_ORIGIN,
        status: ACTIVE_STATUS,
      });
      insertIntroduction(database, {
        sessionId: "introduced-other",
        visitorId: OTHER_VISITOR_ID,
        wordId: "new-11",
        localDate: localDateOf(NOW, TIME_ZONE),
        origin: NEW_WORD_ORIGIN,
        status: ACTIVE_STATUS,
      });

      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const plan = planDailyReview({
        ...inputs,
        sessionLimit: DAILY_REVIEW_SESSION_LIMIT,
        dailyNewLimit: DAILY_NEW_WORD_LIMIT,
        now: NOW,
      });

      expect(inputs.introducedToday).toBe(DAILY_NEW_WORD_LIMIT);
      expect(inputs.newCandidates).toEqual(candidateIds);
      expect(plan.newWordIds).toEqual([]);
      expect(plan.matchingWordIds).toEqual([]);
    });
  });

  it("leaves inactive words out of the plan, the studied list, and active word lookup", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      insertWord(database, { wordId: "active-due", createdAt: new Date(Date.UTC(2026, 0, 3)) });
      insertWord(database, {
        wordId: "inactive-due",
        createdAt: new Date(Date.UTC(2026, 0, 3, 1)),
        active: INACTIVE_WORD,
      });
      insertWord(database, {
        wordId: "inactive-fresh",
        createdAt: new Date(Date.UTC(2026, 0, 1)),
        active: INACTIVE_WORD,
      });
      insertWord(database, { wordId: "active-fresh", createdAt: new Date(Date.UTC(2026, 0, 4)) });
      insertWord(database, {
        wordId: "exposed",
        createdAt: new Date(Date.UTC(2026, 0, 2)),
      });
      insertSchedule(database, {
        wordId: "active-due",
        nextReviewAt: startOfLocalDay(NOW, TIME_ZONE, -1),
        state: REVIEW_STATE,
      });
      insertSchedule(database, {
        wordId: "inactive-due",
        nextReviewAt: startOfLocalDay(NOW, TIME_ZONE, -2),
        state: REVIEW_STATE,
      });
      insertProgressWithoutSchedule(database, "exposed");

      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const studied = await reader.listStudied(VISITOR_ID);
      const active = await reader.findActiveWords([
        "missing",
        "inactive-due",
        "active-fresh",
        "active-due",
      ]);

      expect(inputs.due.map((item) => item.wordId)).toEqual(["active-due"]);
      expect(inputs.newCandidates).toEqual(["exposed", "active-fresh"]);
      expect(studied.map((item) => item.wordId)).toEqual(["active-due"]);
      expect(studied[0]?.schedule.state).toBe(REVIEW_STATE);
      expect(active.map((word) => word.id)).toEqual(["active-fresh", "active-due"]);
      expect(await reader.findActiveWords([])).toEqual([]);
    });
  });

  it("reads a plan of 5000 words and progress in under 500 milliseconds", async () => {
    await withReader(async ({ database, reader }) => {
      insertVisitor(database, VISITOR_ID);
      seedLargeCatalog(database);
      const startedAt = performance.now();
      const inputs = await reader.loadPlanInputs(VISITOR_ID, NOW, TIME_ZONE);
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeLessThan(PLAN_READ_LIMIT_MS);
      expect(inputs.due).toHaveLength(DUE_CATALOG_COUNT);
      expect(inputs.due[0]?.wordId).toBe(catalogWordId(0));
      expect(inputs.due[DUE_CATALOG_COUNT - 1]?.wordId).toBe(catalogWordId(DUE_CATALOG_COUNT - 1));
      expect(inputs.due.map((item) => item.wordId)).not.toContain(catalogWordId(DUE_CATALOG_COUNT));
      expect(inputs.newCandidates).toEqual([]);
      expect(inputs.introducedToday).toBe(0);
      const summary = await reader.summary(VISITOR_ID, NOW, TIME_ZONE);
      expect(summary.dueCount).toBe(inputs.due.length);
      expect(summary.newAvailable).toBe(0);
    });
  });
});

async function withReader(verify: (context: PlanContext) => Promise<void>): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      await migrate(executor, runBetterSqliteTransaction(database));
      await verify({ database, reader: new SqliteDailyReviewReader(executor) });
    } finally {
      database.close();
    }
  });
}

function insertVisitor(database: Database.Database, visitorId: string): void {
  const storedAt = NOW.toISOString();
  database.prepare(INSERT_VISITOR_SQL).run(visitorId, storedAt, storedAt);
}

function insertWord(
  database: Database.Database,
  word: { readonly wordId: string; readonly createdAt: Date; readonly active?: number },
): void {
  const storedAt = word.createdAt.toISOString();
  database.prepare(INSERT_WORD_SQL).run(
    word.wordId,
    `english ${word.wordId}`,
    `portuguese ${word.wordId}`,
    `english ${word.wordId}`,
    `portuguese ${word.wordId}`,
    null,
    word.active ?? ACTIVE_WORD,
    storedAt,
    storedAt,
  );
}

function insertSchedule(
  database: Database.Database,
  schedule: { readonly wordId: string; readonly nextReviewAt: Date; readonly state: string },
): void {
  database.prepare(INSERT_PROGRESS_SQL).run(
    VISITOR_ID,
    schedule.wordId,
    0,
    0,
    0,
    0,
    null,
    schedule.nextReviewAt.toISOString(),
    STORED_REPETITIONS,
    STORED_LAPSES,
    STORED_INTERVAL_DAYS,
    STORED_EASE,
    schedule.state,
    NOW.toISOString(),
  );
}

function insertProgressWithoutSchedule(database: Database.Database, wordId: string): void {
  database.prepare(INSERT_PROGRESS_SQL).run(
    VISITOR_ID,
    wordId,
    1,
    0,
    0,
    0,
    null,
    null,
    0,
    0,
    0,
    STORED_EASE,
    LEARNING_STATE,
    NOW.toISOString(),
  );
}

function insertIntroduction(
  database: Database.Database,
  introduction: {
    readonly sessionId: string;
    readonly visitorId: string;
    readonly wordId: string;
    readonly localDate: string;
    readonly origin: string;
    readonly status: string;
  },
): void {
  const storedAt = NOW.toISOString();
  const finishedAt = introduction.status === ACTIVE_STATUS ? null : storedAt;
  database.prepare(INSERT_SESSION_SQL).run(
    introduction.sessionId,
    introduction.visitorId,
    introduction.localDate,
    TIME_ZONE,
    introduction.status,
    storedAt,
    finishedAt,
  );
  database.prepare(INSERT_SESSION_WORD_SQL).run(
    introduction.sessionId,
    introduction.wordId,
    0,
    MATCHING_STAGE,
    introduction.origin,
  );
}

function seedLargeCatalog(database: Database.Database): void {
  const insertWordStatement = database.prepare(INSERT_WORD_SQL);
  const insertProgressStatement = database.prepare(INSERT_PROGRESS_SQL);
  const writeCatalog = database.transaction(() => {
    for (let index = 0; index < CATALOG_SIZE; index += 1) {
      const wordId = catalogWordId(index);
      const storedAt = NOW.toISOString();
      insertWordStatement.run(
        wordId,
        `english ${wordId}`,
        `portuguese ${wordId}`,
        `english ${wordId}`,
        `portuguese ${wordId}`,
        null,
        ACTIVE_WORD,
        storedAt,
        storedAt,
      );
      const due = index < DUE_CATALOG_COUNT;
      const nextReviewAt = new Date(
        NOW.getTime() + (due ? -(DUE_CATALOG_COUNT - index) : index - DUE_CATALOG_COUNT + 1) * ONE_MINUTE_MS,
      );
      insertProgressStatement.run(
        VISITOR_ID,
        wordId,
        1,
        0,
        0,
        0,
        null,
        nextReviewAt.toISOString(),
        STORED_REPETITIONS,
        STORED_LAPSES,
        STORED_INTERVAL_DAYS,
        STORED_EASE,
        REVIEW_STATE,
        storedAt,
      );
    }
  });
  writeCatalog();
}

function catalogWordId(index: number): string {
  return `word-${String(index).padStart(5, "0")}`;
}
