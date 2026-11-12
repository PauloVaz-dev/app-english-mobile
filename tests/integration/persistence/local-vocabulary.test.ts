import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SUPPORTED_SCHEMA_VERSION } from "@/persistence/migrate";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const FIRST_INSTANT = "2026-11-12T10:00:00.000Z";
const SECOND_INSTANT = "2026-11-12T20:00:00.000Z";
const FIRST_VISITOR_ID = "visitor-first";
const SECOND_VISITOR_ID = "visitor-second";
const INITIAL_WORD_COUNT = 32;
const SINGLE_LEARNER_COUNT = 1;
const EMPTY_PROGRESS_COUNT = 0;
const ACTIVE_WORD = 1;
const CHANGED_ENGLISH = "changed apple";
const CHANGED_PORTUGUESE = "maçã alterada";
const CHANGED_SENTENCE = "This sentence was edited on the device.";

describe("local vocabulary bootstrap", () => {
  it("keeps one learner and 32 words after two openings", async () => {
    await withDatabaseFile(async (filePath) => {
      const apple = vocabularySeed[0];
      const book = vocabularySeed[1];
      if (apple === undefined || book === undefined) {
        throw new Error("Vocabulary seed is missing its first words.");
      }
      const firstVisitorId = await openDatabase(filePath, FIRST_VISITOR_ID, FIRST_INSTANT);
      rewriteWordText(filePath, apple.id);
      const secondVisitorId = await openDatabase(filePath, SECOND_VISITOR_ID, SECOND_INSTANT);
      expect(firstVisitorId).toBe(FIRST_VISITOR_ID);
      expect(secondVisitorId).toBe(FIRST_VISITOR_ID);
      const database = new Database(filePath);
      try {
        expect(vocabularySeed).toHaveLength(INITIAL_WORD_COUNT);
        expect(readUserVersion(database)).toBe(SUPPORTED_SCHEMA_VERSION);
        expect(readTotal(database, `SELECT COUNT(*) AS "total" FROM "AnonymousVisitor"`)).toBe(
          SINGLE_LEARNER_COUNT,
        );
        expect(readTotal(database, `SELECT COUNT(*) AS "total" FROM "Word"`)).toBe(
          INITIAL_WORD_COUNT,
        );
        expect(readActiveWordTotal(database)).toBe(INITIAL_WORD_COUNT);
        expect(readTotal(database, `SELECT COUNT(*) AS "total" FROM "LearnerWordProgress"`)).toBe(
          EMPTY_PROGRESS_COUNT,
        );
        expect(readWord(database, apple.id)).toEqual({
          id: apple.id,
          english: CHANGED_ENGLISH,
          portuguese: CHANGED_PORTUGUESE,
          exampleSentence: CHANGED_SENTENCE,
          updatedAt: FIRST_INSTANT,
        });
        expect(readWord(database, book.id)).toEqual({
          id: book.id,
          english: book.english,
          portuguese: book.portuguese,
          exampleSentence: book.exampleSentence,
          updatedAt: FIRST_INSTANT,
        });
        expect(readVisitorIds(database)).toEqual([FIRST_VISITOR_ID]);
      } finally {
        database.close();
      }
    });
  });
});

async function openDatabase(filePath: string, visitorId: string, instant: string): Promise<string> {
  const database = new Database(filePath);
  try {
    const identity = await bootstrapEnglishDatabase({
      executor: createBetterSqliteExecutor(database),
      runInTransaction: runBetterSqliteTransaction(database),
      createVisitorId: () => visitorId,
      now: () => new Date(instant),
    });
    return identity.visitorId;
  } finally {
    database.close();
  }
}

function rewriteWordText(filePath: string, wordId: string): void {
  const database = new Database(filePath);
  try {
    database
      .prepare(
        `UPDATE "Word"
         SET "english" = ?, "portuguese" = ?, "exampleSentence" = ?
         WHERE "id" = ?`,
      )
      .run(CHANGED_ENGLISH, CHANGED_PORTUGUESE, CHANGED_SENTENCE, wordId);
  } finally {
    database.close();
  }
}

function readUserVersion(database: Database.Database): number {
  const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function readTotal(database: Database.Database, statement: string): number {
  const row = database.prepare(statement).get() as CountRow;
  return row.total;
}

function readActiveWordTotal(database: Database.Database): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS "total" FROM "Word" WHERE "active" = ?`)
    .get(ACTIVE_WORD) as CountRow;
  return row.total;
}

function readWord(database: Database.Database, wordId: string): StoredWord {
  return database
    .prepare(
      `SELECT "id", "english", "portuguese", "exampleSentence", "updatedAt"
       FROM "Word"
       WHERE "id" = ?`,
    )
    .get(wordId) as StoredWord;
}

function readVisitorIds(database: Database.Database): string[] {
  const rows = database
    .prepare(`SELECT "id" FROM "AnonymousVisitor" ORDER BY "id" ASC`)
    .all() as VisitorIdRow[];
  return rows.map((row) => row.id);
}

interface CountRow {
  total: number;
}

interface StoredWord {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  updatedAt: string;
}

interface VisitorIdRow {
  id: string;
}
