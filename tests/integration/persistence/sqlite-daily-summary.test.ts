import { existsSync } from "node:fs";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import type { DailyReviewSummary } from "@/lib/application/review/ports/daily-review-reader";
import { DAILY_NEW_WORD_LIMIT } from "@/lib/domain/learning/daily-review-plan";
import { DEFAULT_TIME_ZONE, localDateOf } from "@/lib/domain/learning/local-day";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { migrate, SUPPORTED_SCHEMA_VERSION } from "@/persistence/migrate";
import { createDailySummaryUseCase } from "@/persistence/sqlite-daily-review-reader";
import type { SqlExecutor, SqlValue } from "@/persistence/sql-executor";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import { vocabularySeed, type VocabularySeedEntry } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
  traceBetterSqliteMigration,
} from "../../support/better-sqlite-executor";
import {
  EXPECTED_TABLES,
  REQUIRED_TABLE_COUNT,
  listExpectedTableNames,
  type ForeignKeyExpectation,
  type IndexExpectation,
} from "../../support/expected-sqlite-schema";
import { readColumns, readForeignKeys, readIndexes, readTableNames } from "../../support/read-sqlite-schema";
import { withDatabaseFile } from "../../support/temporary-database";

const FOREIGN_KEYS_ENABLED = 1;

const PRODUCT_TABLES = [
  "AnonymousVisitor",
  "ChallengeAttempt",
  "ChallengeSession",
  "ChallengeSessionWord",
  "GameAnswer",
  "GameSession",
  "GameSessionWord",
  "LearnerWordProgress",
  "ReviewSession",
  "ReviewSessionWord",
  "TypingAttempt",
  "Word",
] as const;

describe("sqlite schema version 1", () => {
  it("creates twelve tables, keys, and version 1 in one transaction", async () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(listExpectedTableNames()).toEqual([...PRODUCT_TABLES]);
    expect(PRODUCT_TABLES).toHaveLength(REQUIRED_TABLE_COUNT);
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      try {
        const trace = traceBetterSqliteMigration(database);
        await migrate(trace.executor, trace.runInTransaction);
        expect(readUserVersion(database)).toBe(SUPPORTED_SCHEMA_VERSION);
        expect(readJournalMode(database)).toBe("wal");
        expect(readForeignKeysEnabled(database)).toBe(FOREIGN_KEYS_ENABLED);
        expect(pragmaEventsBeforeTransaction(trace.events)).toEqual([
          "connection:PRAGMA foreign_keys = ON",
          "connection:PRAGMA journal_mode = WAL",
        ]);
        expect(eventsInsideTransaction(trace.events).some((event) => event.includes("PRAGMA user_version = 1"))).toBe(
          true,
        );
        expect(eventsInsideTransaction(trace.events).some((event) => event.includes("CREATE TABLE"))).toBe(true);
        expectSchema(database);
        await insertLearnerWord(trace.executor);
        await expect(insertDuplicateWord(trace.executor)).rejects.toThrow();
        await expect(insertSessionForMissingVisitor(trace.executor)).rejects.toThrow();
      } finally {
        database.close();
      }
      expect(existsSync(filePath)).toBe(true);
    });
  });

  it("does not migrate again when the same file is opened", async () => {
    await withDatabaseFile(async (filePath) => {
      const first = new Database(filePath);
      try {
        const trace = traceBetterSqliteMigration(first);
        await migrate(trace.executor, trace.runInTransaction);
        await insertLearnerWord(trace.executor);
      } finally {
        first.close();
      }
      const second = new Database(filePath);
      try {
        const trace = traceBetterSqliteMigration(second);
        await migrate(trace.executor, trace.runInTransaction);
        expect(trace.events.some((event) => event.startsWith("transaction:"))).toBe(false);
        expect(trace.events.some((event) => event.includes("CREATE TABLE"))).toBe(false);
        expect(trace.events.some((event) => event.includes("user_version ="))).toBe(false);
        expect(trace.events).toEqual([
          "connection:PRAGMA foreign_keys = ON",
          "connection:PRAGMA journal_mode = WAL",
        ]);
        expect(readUserVersion(second)).toBe(SUPPORTED_SCHEMA_VERSION);
        expect(readTableNames(second)).toEqual([...PRODUCT_TABLES]);
        const visitors = second.prepare(`SELECT "id" FROM "AnonymousVisitor"`).all();
        expect(visitors).toEqual([{ id: "visitor-1" }]);
      } finally {
        second.close();
      }
    });
  });
});

function expectSchema(database: Database.Database): void {
  expect(readTableNames(database)).toEqual([...PRODUCT_TABLES]);
  for (const tableName of PRODUCT_TABLES) {
    const expected = EXPECTED_TABLES[tableName];
    expect(readColumns(database, tableName)).toEqual(expected?.columns);
    expect(readForeignKeys(database, tableName)).toEqual(sortForeignKeys(expected?.foreignKeys ?? []));
    expect(readIndexes(database, tableName)).toEqual(sortIndexes(expected?.indexes ?? []));
  }
}

function sortForeignKeys(foreignKeys: ForeignKeyExpectation[]): ForeignKeyExpectation[] {
  return [...foreignKeys].sort((left, right) => left.from.localeCompare(right.from));
}

function sortIndexes(indexes: IndexExpectation[]): IndexExpectation[] {
  return [...indexes].sort((left, right) => left.name.localeCompare(right.name));
}

function pragmaEventsBeforeTransaction(events: string[]): string[] {
  const beginAt = events.indexOf("transaction:BEGIN");
  return events.slice(0, beginAt);
}

function eventsInsideTransaction(events: string[]): string[] {
  const beginAt = events.indexOf("transaction:BEGIN");
  const commitAt = events.indexOf("transaction:COMMIT");
  return events.slice(beginAt + 1, commitAt);
}

function readUserVersion(database: Database.Database): number {
  const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function readJournalMode(database: Database.Database): string {
  const row = database.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  return row.journal_mode;
}

function readForeignKeysEnabled(database: Database.Database): number {
  const row = database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
  return row.foreign_keys;
}

async function insertLearnerWord(executor: {
  run(statement: string, params?: readonly string[]): Promise<void>;
}): Promise<void> {
  await executor.run(`INSERT INTO "AnonymousVisitor" ("id") VALUES (?)`, ["visitor-1"]);
  await executor.run(
    `INSERT INTO "Word" (
      "id", "english", "portuguese", "englishNormalized", "portugueseNormalized", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ["word-1", "hello", "olá", "hello", "ola", "2026-11-12T00:00:00.000Z"],
  );
}

async function insertDuplicateWord(executor: {
  run(statement: string, params?: readonly string[]): Promise<void>;
}): Promise<void> {
  await executor.run(
    `INSERT INTO "Word" (
      "id", "english", "portuguese", "englishNormalized", "portugueseNormalized", "updatedAt"
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ["word-2", "hello", "olá", "hello", "ola", "2026-11-12T00:00:00.000Z"],
  );
}

async function insertSessionForMissingVisitor(executor: {
  run(statement: string, params?: readonly (string | number)[]): Promise<void>;
}): Promise<void> {
  await executor.run(
    `INSERT INTO "GameSession" ("id", "visitorId", "status", "targetWords", "startedAt")
     VALUES (?, ?, ?, ?, ?)`,
    ["session-1", "missing-visitor", "ACTIVE", 4, "2026-11-12T00:00:00.000Z"],
  );
}

const SUMMARY_VISITOR_ID = "visitor-summary";
const OTHER_VISITOR_ID = "visitor-other";
const STUDY_INSTANT = new Date("2026-11-12T15:00:00.000Z");
const BOUNDARY_INSTANT = new Date("2026-09-28T02:00:00.000Z");
const TOKYO_TIME_ZONE = "Asia/Tokyo";
const ACTIVE_WORD = 1;
const INACTIVE_WORD = 0;
const ACTIVE_CATALOG_COUNT = 5_000;
const DUE_CATALOG_COUNT = 25;
const FUTURE_CATALOG_COUNT = 3;
const INTRODUCED_TODAY_COUNT = 4;
const INACTIVE_CATALOG_COUNT = 2;
const PAST_AND_CURRENT_DUE_COUNT = 2;
const SINGLE_NEW_WORD = 1;
const QUERY_ROW_LIMIT = 1;
const ONE_MINUTE_MS = 60_000;
const ONE_DAY_MS = 86_400_000;
const FIRST_SEQUENCE = 1;
const FIRST_FUTURE_DAY = 1;
const NEW_WORD_ORIGIN = "NEW";
const DUE_WORD_ORIGIN = "DUE";
const MATCHING_STAGE = "MATCHING";
const REVIEW_SESSION_STATUS = "ACTIVE";
const CATALOG_ID_WIDTH = 5;

const INSERT_VISITOR_SQL = `
INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt")
VALUES (?, ?, ?)
`;

const INSERT_WORD_SQL = `
INSERT INTO "Word" (
  "id",
  "english",
  "portuguese",
  "englishNormalized",
  "portugueseNormalized",
  "active",
  "updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_PROGRESS_SQL = `
INSERT INTO "LearnerWordProgress" ("visitorId", "wordId", "nextReviewAt", "updatedAt")
VALUES (?, ?, ?, ?)
`;

const INSERT_SESSION_SQL = `
INSERT INTO "ReviewSession" (
  "id",
  "visitorId",
  "localDate",
  "timeZone",
  "status",
  "startedAt"
) VALUES (?, ?, ?, ?, ?, ?)
`;

const INSERT_SESSION_WORD_SQL = `
INSERT INTO "ReviewSessionWord" ("sessionId", "wordId", "sequence", "stage", "origin")
VALUES (?, ?, ?, ?, ?)
`;

describe("sqlite daily review summary", () => {
  it("keeps zero due words and at most ten new words after the file is reopened", async () => {
    await withDatabaseFile(async (filePath) => {
      const first = await openSummary(filePath, STUDY_INSTANT);
      const second = await openSummary(filePath, STUDY_INSTANT);
      expect(first.dueCount).toBe(0);
      expect(first.newAvailable).toBe(DAILY_NEW_WORD_LIMIT);
      expect(first.nextReviewAt).toBeNull();
      expect(second).toEqual(first);
    });
  });

  it("counts a past review and the learner's next future review", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      try {
        const visitorId = await bootstrapLearner(database, STUDY_INSTANT);
        const pastWord = requireSeedWord(0);
        const currentWord = requireSeedWord(1);
        const soonerWord = requireSeedWord(2);
        const laterWord = requireSeedWord(3);
        const otherWord = requireSeedWord(4);
        const sooner = new Date(STUDY_INSTANT.getTime() + ONE_DAY_MS);
        const later = new Date(STUDY_INSTANT.getTime() + ONE_DAY_MS * 2);
        const inactiveSoon = new Date(STUDY_INSTANT.getTime() + ONE_MINUTE_MS);
        const otherSoon = new Date(STUDY_INSTANT.getTime() + ONE_MINUTE_MS * 2);
        insertPlainWord(database, { wordId: "inactive-word", active: INACTIVE_WORD, now: STUDY_INSTANT });
        insertStoredVisitor(database, OTHER_VISITOR_ID, STUDY_INSTANT);
        insertReviewProgress(database, {
          visitorId,
          wordId: pastWord.id,
          nextReviewAt: new Date(STUDY_INSTANT.getTime() - ONE_MINUTE_MS),
        });
        insertReviewProgress(database, { visitorId, wordId: currentWord.id, nextReviewAt: STUDY_INSTANT });
        insertReviewProgress(database, { visitorId, wordId: soonerWord.id, nextReviewAt: sooner });
        insertReviewProgress(database, { visitorId, wordId: laterWord.id, nextReviewAt: later });
        insertReviewProgress(database, { visitorId, wordId: "inactive-word", nextReviewAt: inactiveSoon });
        insertReviewProgress(database, {
          visitorId: OTHER_VISITOR_ID,
          wordId: otherWord.id,
          nextReviewAt: otherSoon,
        });
        const summary = await executeSummary(createBetterSqliteExecutor(database), visitorId, STUDY_INSTANT);
        expect(summary.dueCount).toBe(PAST_AND_CURRENT_DUE_COUNT);
        expect(summary.nextReviewAt).toEqual(sooner);
        expect(summary.newAvailable).toBe(DAILY_NEW_WORD_LIMIT);
      } finally {
        database.close();
      }
    });
  });

  it("reduces new words only for NEW words on the stored local day", async () => {
    await withDatabaseFile(async (filePath) => {
      const tokyoDate = localDateOf(BOUNDARY_INSTANT, TOKYO_TIME_ZONE);
      const pauloDate = localDateOf(BOUNDARY_INSTANT, DEFAULT_TIME_ZONE);
      const database = new Database(filePath);
      try {
        const visitorId = await bootstrapLearner(database, BOUNDARY_INSTANT);
        const introducedWord = requireSeedWord(0);
        const dueOriginWord = requireSeedWord(1);
        expect(tokyoDate).not.toBe(pauloDate);
        insertIntroduction(database, {
          sessionId: "session-tokyo",
          visitorId,
          wordId: introducedWord.id,
          localDate: tokyoDate,
          origin: NEW_WORD_ORIGIN,
          now: BOUNDARY_INSTANT,
        });
        insertIntroduction(database, {
          sessionId: "session-tokyo-again",
          visitorId,
          wordId: introducedWord.id,
          localDate: tokyoDate,
          origin: NEW_WORD_ORIGIN,
          now: BOUNDARY_INSTANT,
        });
        insertIntroduction(database, {
          sessionId: "session-due-origin",
          visitorId,
          wordId: dueOriginWord.id,
          localDate: tokyoDate,
          origin: DUE_WORD_ORIGIN,
          now: BOUNDARY_INSTANT,
        });
        const executor = createBetterSqliteExecutor(database);
        const beforeZone = await executeSummary(executor, visitorId, BOUNDARY_INSTANT);
        await new SqliteVisitorPreferences(executor).saveTimeZone(visitorId, TOKYO_TIME_ZONE, BOUNDARY_INSTANT);
        const tokyo = await executeSummary(executor, visitorId, BOUNDARY_INSTANT);
        expect(beforeZone).toEqual({
          dueCount: 0,
          newAvailable: DAILY_NEW_WORD_LIMIT,
          nextReviewAt: null,
        });
        expect(tokyo.dueCount).toBe(0);
        expect(tokyo.newAvailable).toBe(DAILY_NEW_WORD_LIMIT - SINGLE_NEW_WORD);
        expect(tokyo.nextReviewAt).toBeNull();
      } finally {
        database.close();
      }
    });
  });

  it("summarizes 5000 active words without loading the catalog", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      try {
        const executor = createBetterSqliteExecutor(database);
        await migrate(executor, runBetterSqliteTransaction(database));
        const firstFuture = seedLargeCatalog(database, STUDY_INSTANT);
        const observed = observeQueries(executor);
        const summary = await executeSummary(observed.executor, SUMMARY_VISITOR_ID, STUDY_INSTANT);
        expect(summary).toEqual({
          dueCount: DUE_CATALOG_COUNT,
          newAvailable: DAILY_NEW_WORD_LIMIT - INTRODUCED_TODAY_COUNT,
          nextReviewAt: firstFuture,
        });
        expect(observed.largestResult()).toBeLessThanOrEqual(QUERY_ROW_LIMIT);
        expect(observed.returnedRows()).toBeGreaterThan(0);
        expect(observed.returnedRows()).toBeLessThan(ACTIVE_CATALOG_COUNT);
      } finally {
        database.close();
      }
    });
  });
});

async function openSummary(filePath: string, now: Date): Promise<DailyReviewSummary> {
  const database = new Database(filePath);
  try {
    const visitorId = await bootstrapLearner(database, now);
    return await executeSummary(createBetterSqliteExecutor(database), visitorId, now);
  } finally {
    database.close();
  }
}

async function bootstrapLearner(database: Database.Database, now: Date): Promise<string> {
  const identity = await bootstrapEnglishDatabase({
    executor: createBetterSqliteExecutor(database),
    runInTransaction: runBetterSqliteTransaction(database),
    createVisitorId: () => SUMMARY_VISITOR_ID,
    now: () => now,
  });
  return identity.visitorId;
}

async function executeSummary(
  executor: SqlExecutor,
  visitorId: string,
  now: Date,
): Promise<DailyReviewSummary> {
  const useCase = createDailySummaryUseCase(executor, { now: () => now });
  return useCase.execute({ visitorId });
}

function requireSeedWord(index: number): VocabularySeedEntry {
  const entry = vocabularySeed[index];
  if (entry === undefined) {
    throw new Error("Vocabulary seed is missing a word.");
  }
  return entry;
}

function insertStoredVisitor(database: Database.Database, visitorId: string, now: Date): void {
  const storedAt = now.toISOString();
  database.prepare(INSERT_VISITOR_SQL).run(visitorId, storedAt, storedAt);
}

function insertPlainWord(database: Database.Database, word: PlainWord): void {
  database.prepare(INSERT_WORD_SQL).run(
    word.wordId,
    `english ${word.wordId}`,
    `portuguese ${word.wordId}`,
    `english ${word.wordId}`,
    `portuguese ${word.wordId}`,
    word.active,
    word.now.toISOString(),
  );
}

function insertReviewProgress(database: Database.Database, progress: StoredProgress): void {
  const storedAt = progress.nextReviewAt.toISOString();
  database.prepare(INSERT_PROGRESS_SQL).run(progress.visitorId, progress.wordId, storedAt, storedAt);
}

function insertIntroduction(database: Database.Database, introduction: StoredIntroduction): void {
  const storedAt = introduction.now.toISOString();
  database.prepare(INSERT_SESSION_SQL).run(
    introduction.sessionId,
    introduction.visitorId,
    introduction.localDate,
    DEFAULT_TIME_ZONE,
    REVIEW_SESSION_STATUS,
    storedAt,
  );
  database.prepare(INSERT_SESSION_WORD_SQL).run(
    introduction.sessionId,
    introduction.wordId,
    FIRST_SEQUENCE,
    MATCHING_STAGE,
    introduction.origin,
  );
}

function seedLargeCatalog(database: Database.Database, now: Date): Date {
  const statements = prepareCatalogStatements(database);
  const firstFuture = new Date(now.getTime() + ONE_DAY_MS);
  const writeCatalog = database.transaction(() => {
    insertCatalogVisitors(statements, now);
    insertActiveCatalog(statements, now);
    insertIntroducedWords(statements, now);
    insertOtherLearnerRows(statements, now);
    insertInactiveCatalog(statements, now);
  });
  writeCatalog();
  return firstFuture;
}

function prepareCatalogStatements(database: Database.Database): CatalogStatements {
  return {
    insertVisitor: database.prepare(INSERT_VISITOR_SQL),
    insertWord: database.prepare(INSERT_WORD_SQL),
    insertProgress: database.prepare(INSERT_PROGRESS_SQL),
    insertSession: database.prepare(INSERT_SESSION_SQL),
    insertSessionWord: database.prepare(INSERT_SESSION_WORD_SQL),
  };
}

function insertCatalogVisitors(statements: CatalogStatements, now: Date): void {
  const storedAt = now.toISOString();
  statements.insertVisitor.run(SUMMARY_VISITOR_ID, storedAt, storedAt);
  statements.insertVisitor.run(OTHER_VISITOR_ID, storedAt, storedAt);
}

function insertActiveCatalog(statements: CatalogStatements, now: Date): void {
  const storedAt = now.toISOString();
  const past = new Date(now.getTime() - ONE_MINUTE_MS).toISOString();
  for (let index = 0; index < ACTIVE_CATALOG_COUNT; index += 1) {
    const wordId = formatCatalogWordId(index);
    statements.insertWord.run(
      wordId,
      `english ${index}`,
      `portuguese ${index}`,
      `english ${index}`,
      `portuguese ${index}`,
      ACTIVE_WORD,
      storedAt,
    );
    writeActiveSchedule({ statements, index, wordId, past, storedAt, now });
  }
}

function writeActiveSchedule(schedule: ActiveSchedule): void {
  if (schedule.index < DUE_CATALOG_COUNT) {
    schedule.statements.insertProgress.run(
      SUMMARY_VISITOR_ID,
      schedule.wordId,
      schedule.past,
      schedule.storedAt,
    );
    return;
  }
  const futureIndex = schedule.index - DUE_CATALOG_COUNT;
  if (futureIndex >= FUTURE_CATALOG_COUNT) {
    return;
  }
  const dayOffset = futureIndex + FIRST_FUTURE_DAY;
  const reviewAt = new Date(schedule.now.getTime() + dayOffset * ONE_DAY_MS).toISOString();
  schedule.statements.insertProgress.run(SUMMARY_VISITOR_ID, schedule.wordId, reviewAt, schedule.storedAt);
}

function insertIntroducedWords(statements: CatalogStatements, now: Date): void {
  const storedAt = now.toISOString();
  const localDate = localDateOf(now, DEFAULT_TIME_ZONE);
  const sessionId = "session-introduced";
  statements.insertSession.run(
    sessionId,
    SUMMARY_VISITOR_ID,
    localDate,
    DEFAULT_TIME_ZONE,
    REVIEW_SESSION_STATUS,
    storedAt,
  );
  for (let offset = 0; offset < INTRODUCED_TODAY_COUNT; offset += 1) {
    const index = DUE_CATALOG_COUNT + FUTURE_CATALOG_COUNT + offset;
    statements.insertSessionWord.run(
      sessionId,
      formatCatalogWordId(index),
      offset + FIRST_SEQUENCE,
      MATCHING_STAGE,
      NEW_WORD_ORIGIN,
    );
  }
}

function insertOtherLearnerRows(statements: CatalogStatements, now: Date): void {
  const storedAt = now.toISOString();
  const localDate = localDateOf(now, DEFAULT_TIME_ZONE);
  const wordId = formatCatalogWordId(DUE_CATALOG_COUNT + FUTURE_CATALOG_COUNT + INTRODUCED_TODAY_COUNT);
  const past = new Date(now.getTime() - ONE_MINUTE_MS).toISOString();
  statements.insertProgress.run(OTHER_VISITOR_ID, wordId, past, storedAt);
  statements.insertSession.run(
    "session-other",
    OTHER_VISITOR_ID,
    localDate,
    DEFAULT_TIME_ZONE,
    REVIEW_SESSION_STATUS,
    storedAt,
  );
  statements.insertSessionWord.run(
    "session-other",
    wordId,
    FIRST_SEQUENCE,
    MATCHING_STAGE,
    NEW_WORD_ORIGIN,
  );
}

function insertInactiveCatalog(statements: CatalogStatements, now: Date): void {
  const storedAt = now.toISOString();
  const past = new Date(now.getTime() - ONE_MINUTE_MS).toISOString();
  const soon = new Date(now.getTime() + ONE_MINUTE_MS).toISOString();
  for (let index = 0; index < INACTIVE_CATALOG_COUNT; index += 1) {
    const wordId = `inactive-${index}`;
    statements.insertWord.run(
      wordId,
      `inactive english ${index}`,
      `inactive portuguese ${index}`,
      `inactive english ${index}`,
      `inactive portuguese ${index}`,
      INACTIVE_WORD,
      storedAt,
    );
    const reviewAt = index === 0 ? past : soon;
    statements.insertProgress.run(SUMMARY_VISITOR_ID, wordId, reviewAt, storedAt);
  }
}

function formatCatalogWordId(index: number): string {
  return `catalog-${index.toString(10).padStart(CATALOG_ID_WIDTH, "0")}`;
}

function observeQueries(executor: SqlExecutor): QueryObservation {
  let largestResult = 0;
  let returnedRows = 0;
  return {
    executor: {
      exec(statement: string): Promise<void> {
        return executor.exec(statement);
      },
      async getAll<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]> {
        const rows = await executor.getAll<Row>(statement, params);
        returnedRows += rows.length;
        if (rows.length > largestResult) {
          largestResult = rows.length;
        }
        return rows;
      },
      run(statement: string, params?: readonly SqlValue[]): Promise<void> {
        return executor.run(statement, params);
      },
    },
    largestResult(): number {
      return largestResult;
    },
    returnedRows(): number {
      return returnedRows;
    },
  };
}

interface PlainWord {
  wordId: string;
  active: number;
  now: Date;
}

interface StoredProgress {
  visitorId: string;
  wordId: string;
  nextReviewAt: Date;
}

interface ActiveSchedule {
  statements: CatalogStatements;
  index: number;
  wordId: string;
  past: string;
  storedAt: string;
  now: Date;
}

interface StoredIntroduction {
  sessionId: string;
  visitorId: string;
  wordId: string;
  localDate: string;
  origin: string;
  now: Date;
}

interface CatalogStatements {
  insertVisitor: Database.Statement;
  insertWord: Database.Statement;
  insertProgress: Database.Statement;
  insertSession: Database.Statement;
  insertSessionWord: Database.Statement;
}

interface QueryObservation {
  executor: SqlExecutor;
  largestResult(): number;
  returnedRows(): number;
}
