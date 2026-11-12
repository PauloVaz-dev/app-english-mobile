import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { migrate } from "@/persistence/migrate";
import type { SqlExecutor } from "@/persistence/sql-executor";
import { seedVocabulary } from "@/seed/seed-vocabulary";
import { vocabularySeed, type VocabularySeedEntry } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const FIRST_INSTANT = "2026-11-12T10:00:00.000Z";
const SECOND_INSTANT = "2026-11-12T20:00:00.000Z";
const FIRST_ENTRY_INDEX = 0;
const SECOND_ENTRY_INDEX = 1;
const INITIAL_WORD_COUNT = 32;
const CHANGED_ENGLISH = "changed apple";
const CHANGED_PORTUGUESE = "maçã alterada";
const CHANGED_SENTENCE = "This sentence was edited on the device.";
const REPLACED_ENGLISH = "edited book";
const REPLACED_PORTUGUESE = "livro editado";
const REPLACED_SENTENCE = "The stored sentence stays.";

describe("vocabulary seed", () => {
  it("does not duplicate or overwrite text on the second seed", async () => {
    await withMigratedDatabase(async (database, executor) => {
      const apple = entryAt(FIRST_ENTRY_INDEX);
      const book = entryAt(SECOND_ENTRY_INDEX);
      await seedVocabulary(executor, () => new Date(FIRST_INSTANT));
      database
        .prepare(
          `UPDATE "Word"
           SET "english" = ?, "portuguese" = ?, "exampleSentence" = ?
           WHERE "id" = ?`,
        )
        .run(CHANGED_ENGLISH, CHANGED_PORTUGUESE, CHANGED_SENTENCE, apple.id);
      await seedVocabulary(executor, () => new Date(SECOND_INSTANT));
      const rows = readWords(database);
      expect(vocabularySeed).toHaveLength(INITIAL_WORD_COUNT);
      expect(rows).toHaveLength(INITIAL_WORD_COUNT);
      expect(rows).toContainEqual({
        id: apple.id,
        english: CHANGED_ENGLISH,
        portuguese: CHANGED_PORTUGUESE,
        exampleSentence: CHANGED_SENTENCE,
        updatedAt: FIRST_INSTANT,
      });
      expect(rows).toContainEqual({
        id: book.id,
        english: book.english,
        portuguese: book.portuguese,
        exampleSentence: book.exampleSentence,
        updatedAt: FIRST_INSTANT,
      });
    });
  });

  it("inserts a missing pair and keeps an edited word", async () => {
    await withMigratedDatabase(async (database, executor) => {
      const removed = entryAt(FIRST_ENTRY_INDEX);
      const edited = entryAt(SECOND_ENTRY_INDEX);
      await seedVocabulary(executor, () => new Date(FIRST_INSTANT));
      database.prepare(`DELETE FROM "Word" WHERE "id" = ?`).run(removed.id);
      database
        .prepare(
          `UPDATE "Word"
           SET "english" = ?, "portuguese" = ?, "englishNormalized" = ?, "portugueseNormalized" = ?, "exampleSentence" = ?
           WHERE "id" = ?`,
        )
        .run(
          REPLACED_ENGLISH,
          REPLACED_PORTUGUESE,
          REPLACED_ENGLISH,
          REPLACED_PORTUGUESE,
          REPLACED_SENTENCE,
          edited.id,
        );
      await seedVocabulary(executor, () => new Date(SECOND_INSTANT));
      const rows = readWords(database);
      expect(rows).toHaveLength(INITIAL_WORD_COUNT);
      expect(rows).toContainEqual({
        id: removed.id,
        english: removed.english,
        portuguese: removed.portuguese,
        exampleSentence: removed.exampleSentence,
        updatedAt: SECOND_INSTANT,
      });
      expect(rows).toContainEqual({
        id: edited.id,
        english: REPLACED_ENGLISH,
        portuguese: REPLACED_PORTUGUESE,
        exampleSentence: REPLACED_SENTENCE,
        updatedAt: FIRST_INSTANT,
      });
    });
  });
});

function entryAt(index: number): VocabularySeedEntry {
  const entry = vocabularySeed[index];
  if (entry === undefined) {
    throw new Error(`Vocabulary seed is missing index ${index}.`);
  }
  return entry;
}

async function withMigratedDatabase(
  verify: (database: Database.Database, executor: SqlExecutor) => Promise<void>,
): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      await migrate(executor, runBetterSqliteTransaction(database));
      await verify(database, executor);
    } finally {
      database.close();
    }
  });
}

function readWords(database: Database.Database): StoredWord[] {
  return database
    .prepare(
      `SELECT "id", "english", "portuguese", "exampleSentence", "updatedAt"
       FROM "Word"`,
    )
    .all() as StoredWord[];
}

interface StoredWord {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  updatedAt: string;
}
