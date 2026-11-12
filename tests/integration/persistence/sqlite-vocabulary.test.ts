import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CreateWord } from "@/lib/application/vocabulary/create-word";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import {
  DuplicateVocabularyError,
  InvalidVocabularyTextError,
  VocabularyEntry,
} from "@/lib/domain/vocabulary";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import { SqliteVocabularyRepository } from "@/persistence/sqlite-vocabulary-repository";
import { PRACTICE_WORD_COUNT, SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { normalizeVocabularyText, vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const OPENED_AT = "2026-11-12T10:00:00.000Z";
const REOPENED_AT = "2026-11-13T08:00:00.000Z";
const CREATED_AT = "2026-11-12T11:30:00.000Z";
const INITIAL_WORD_COUNT = vocabularySeed.length;
const NEW_WORD_ID = "word-registered";

interface StoredWordRow {
  id: string;
  english: string;
  portuguese: string;
  englishNormalized: string;
  portugueseNormalized: string;
  exampleSentence: string | null;
  active: number;
  createdAt: string;
  updatedAt: string;
}

interface CountRow {
  total: number;
}

const fixedClock = (instant: string): Clock => ({ now: () => new Date(instant) });

const firstPick: RandomSource = { next: () => 0 };

function sequentialIds(prefix: string): { generate(): string } {
  let sequence = 0;
  return {
    generate: () => {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
  };
}

async function openDatabase(filePath: string, instant: string): Promise<Database.Database> {
  const database = new Database(filePath);
  await bootstrapEnglishDatabase({
    executor: createBetterSqliteExecutor(database),
    runInTransaction: runBetterSqliteTransaction(database),
    createVisitorId: () => VISITOR_ID,
    now: () => new Date(instant),
  });
  return database;
}

function repositoryFor(
  database: Database.Database,
  executor: SqlExecutor = createBetterSqliteExecutor(database),
  runInTransaction: RunInTransaction = runBetterSqliteTransaction(database),
): SqliteVocabularyRepository {
  return new SqliteVocabularyRepository(executor, runInTransaction, fixedClock(CREATED_AT));
}

function createWordFor(
  repository: SqliteVocabularyRepository,
  idGenerator: { generate(): string } = { generate: () => NEW_WORD_ID },
): CreateWord {
  return new CreateWord({ repository, idGenerator });
}

function readWords(database: Database.Database): StoredWordRow[] {
  return database
    .prepare(
      `SELECT "id", "english", "portuguese", "englishNormalized", "portugueseNormalized",
              "exampleSentence", "active", "createdAt", "updatedAt"
       FROM "Word" ORDER BY "id" ASC`,
    )
    .all() as StoredWordRow[];
}

function readWord(database: Database.Database, wordId: string): StoredWordRow | undefined {
  return readWords(database).find((row) => row.id === wordId);
}

function countRows(database: Database.Database, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "${table}"`).get() as CountRow;
  return row.total;
}

function deactivate(database: Database.Database, wordIds: readonly string[]): void {
  const statement = database.prepare(`UPDATE "Word" SET "active" = 0 WHERE "id" = ?`);
  for (const wordId of wordIds) {
    statement.run(wordId);
  }
}

function seedAt(index: number) {
  const entry = vocabularySeed[index];
  if (entry === undefined) {
    throw new Error(`Vocabulary seed has no word at ${index}.`);
  }
  return entry;
}

/** Hides the catalog read so only the unique index can stop the insert. */
function blindCatalogExecutor(executor: SqlExecutor): SqlExecutor {
  return {
    exec: (statement) => executor.exec(statement),
    run: (statement, params) => executor.run(statement, params),
    async getAll<Row>(statement: string, params?: readonly (string | number | null)[]) {
      if (statement.includes(`FROM "Word"`) && !statement.includes("WHERE")) {
        return [] as Row[];
      }
      return executor.getAll<Row>(statement, params);
    },
  };
}

describe("SqliteVocabularyRepository with create-word", () => {
  it("stores a new word that survives closing and reopening the file", async () => {
    await withDatabaseFile(async (filePath) => {
      const first = await openDatabase(filePath, OPENED_AT);
      try {
        const created = await createWordFor(repositoryFor(first)).execute({
          english: "  Green   Apple ",
          portuguese: "Maçã  Verde",
          exampleSentence: " The Green Apple is sour. ",
        });
        expect(created).toEqual({
          id: NEW_WORD_ID,
          english: "Green Apple",
          portuguese: "Maçã Verde",
          exampleSentence: "The Green Apple is sour.",
          active: true,
        });
      } finally {
        first.close();
      }

      const reopened = await openDatabase(filePath, REOPENED_AT);
      try {
        expect(readWord(reopened, NEW_WORD_ID)).toEqual({
          id: NEW_WORD_ID,
          english: "Green Apple",
          portuguese: "Maçã Verde",
          englishNormalized: normalizeVocabularyText("Green Apple"),
          portugueseNormalized: normalizeVocabularyText("Maçã Verde"),
          exampleSentence: "The Green Apple is sour.",
          active: 1,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        expect(countRows(reopened, "Word")).toBe(INITIAL_WORD_COUNT + 1);
        expect(countRows(reopened, "LearnerWordProgress")).toBe(0);
      } finally {
        reopened.close();
      }
    });
  });

  it("stores an empty example sentence as null", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        await createWordFor(repositoryFor(database)).execute({
          english: "pear",
          portuguese: "pera",
          exampleSentence: "   ",
        });
        expect(readWord(database, NEW_WORD_ID)?.exampleSentence).toBeNull();
      } finally {
        database.close();
      }
    });
  });

  it("does not touch the database for invalid text", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const calls: string[] = [];
        const base = createBetterSqliteExecutor(database);
        const spy: SqlExecutor = {
          exec: async (statement) => {
            calls.push(statement);
            await base.exec(statement);
          },
          getAll: async (statement, params) => {
            calls.push(statement);
            return base.getAll(statement, params);
          },
          run: async (statement, params) => {
            calls.push(statement);
            await base.run(statement, params);
          },
        };
        const runInTransaction: RunInTransaction = async (work) => {
          calls.push("BEGIN");
          await runBetterSqliteTransaction(database)(work);
        };
        const before = readWords(database);

        await expect(
          createWordFor(repositoryFor(database, spy, runInTransaction)).execute({
            english: " ",
            portuguese: "a".repeat(81),
          }),
        ).rejects.toBeInstanceOf(InvalidVocabularyTextError);
        expect(calls).toEqual([]);
        expect(readWords(database)).toEqual(before);
      } finally {
        database.close();
      }
    });
  });

  it("refuses a duplicate of an initial word and keeps every row", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const apple = seedAt(0);
        const before = readWords(database);

        const failure = createWordFor(repositoryFor(database)).execute({
          english: "  APPLE ",
          portuguese: "maca",
        });

        await expect(failure).rejects.toBeInstanceOf(DuplicateVocabularyError);
        await expect(failure).rejects.toMatchObject({
          existing: { id: apple.id, english: apple.english, portuguese: apple.portuguese },
        });
        expect(readWords(database)).toEqual(before);
      } finally {
        database.close();
      }
    });
  });

  it("refuses a duplicate of an inactive word without reactivating it", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const water = seedAt(3);
        deactivate(database, [water.id]);
        const before = readWords(database);

        await expect(
          createWordFor(repositoryFor(database)).execute({
            english: "Water",
            portuguese: "agua",
          }),
        ).rejects.toMatchObject({
          code: "DUPLICATE_VOCABULARY",
          existing: { id: water.id, english: "water", portuguese: "água" },
        });
        expect(readWords(database)).toEqual(before);
        expect(readWord(database, water.id)?.active).toBe(0);
      } finally {
        database.close();
      }
    });
  });

  it("turns a unique index violation inside the transaction into a duplicate", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const book = seedAt(1);
        const before = readWords(database);
        const repository = repositoryFor(
          database,
          blindCatalogExecutor(createBetterSqliteExecutor(database)),
        );

        const failure = createWordFor(repository).execute({
          english: "Book",
          portuguese: "Livro",
        });

        await expect(failure).rejects.toBeInstanceOf(DuplicateVocabularyError);
        await expect(failure).rejects.toMatchObject({
          existing: { id: book.id, english: "book", portuguese: "livro" },
        });
        expect(readWords(database)).toEqual(before);
      } finally {
        database.close();
      }
    });
  });

  it("leaves no partial row when the transaction fails after the insert", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const before = readWords(database);
        const failure = new Error("storage failed");
        const entry = VocabularyEntry.create({
          id: NEW_WORD_ID,
          texts: { english: "pear", portuguese: "pera", exampleSentence: null },
        });

        await expect(
          repositoryFor(database).transaction(async (store) => {
            await store.insert(entry);
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(readWords(database)).toEqual(before);
      } finally {
        database.close();
      }
    });
  });

  it("rethrows a storage failure that is not a duplicate and stores nothing", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const before = readWords(database);
        const failure = new Error("disk is full");
        const base = createBetterSqliteExecutor(database);
        const failing: SqlExecutor = {
          exec: (statement) => base.exec(statement),
          getAll: (statement, params) => base.getAll(statement, params),
          run: async () => {
            throw failure;
          },
        };

        await expect(
          createWordFor(repositoryFor(database, failing)).execute({
            english: "pear",
            portuguese: "pera",
          }),
        ).rejects.toBe(failure);
        expect(readWords(database)).toEqual(before);
      } finally {
        database.close();
      }
    });
  });

  it("returns a value from the transaction work", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const total = await repositoryFor(database).transaction(
          async (store) => (await store.listAll()).length,
        );
        expect(total).toBe(INITIAL_WORD_COUNT);
      } finally {
        database.close();
      }
    });
  });

  it("does not duplicate the registered word when the seed runs again", async () => {
    await withDatabaseFile(async (filePath) => {
      const first = await openDatabase(filePath, OPENED_AT);
      try {
        await createWordFor(repositoryFor(first)).execute({ english: "pear", portuguese: "pera" });
      } finally {
        first.close();
      }
      for (const instant of [REOPENED_AT, REOPENED_AT]) {
        const again = await openDatabase(filePath, instant);
        again.close();
      }
      const final = new Database(filePath);
      try {
        expect(countRows(final, "Word")).toBe(INITIAL_WORD_COUNT + 1);
        expect(readWords(final).filter((row) => row.english === "pear")).toHaveLength(1);
      } finally {
        final.close();
      }
    });
  });

  it("registers ten words in sequence, refusing the duplicate, and stores nine", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        const createWord = createWordFor(repositoryFor(database), sequentialIds("word"));
        const inputs = [
          { english: "pear", portuguese: "pera", exampleSentence: "A ripe pear." },
          { english: "grape", portuguese: "uva" },
          { english: "lemon", portuguese: "limão" },
          { english: "PEAR", portuguese: "Pêra" },
          { english: "orange", portuguese: "laranja" },
          { english: "peach", portuguese: "pêssego" },
          { english: "plum", portuguese: "ameixa" },
          { english: "cherry", portuguese: "cereja" },
          { english: "melon", portuguese: "melão" },
          { english: "mango", portuguese: "manga" },
        ];
        const outcomes: string[] = [];
        for (const input of inputs) {
          try {
            await createWord.execute(input);
            outcomes.push("created");
          } catch (error) {
            outcomes.push(error instanceof DuplicateVocabularyError ? "duplicate" : "failed");
          }
        }
        expect(outcomes.filter((outcome) => outcome === "created")).toHaveLength(9);
        expect(outcomes[3]).toBe("duplicate");
        expect(countRows(database, "Word")).toBe(INITIAL_WORD_COUNT + 9);
      } finally {
        database.close();
      }
    });
  });

  it("lets the new word be drawn as a word without history", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath, OPENED_AT);
      try {
        await createWordFor(repositoryFor(database)).execute({
          english: "Pear",
          portuguese: "Pêra",
        });
        const keptActive = PRACTICE_WORD_COUNT - 1;
        deactivate(
          database,
          vocabularySeed.slice(keptActive).map(({ id }) => id),
        );
        const catalog = new SqliteWordCatalog(
          createBetterSqliteExecutor(database),
          firstPick,
          fixedClock(CREATED_AT),
        );

        const practice = await catalog.drawPracticeWords({ visitorId: VISITOR_ID });
        const challenge = await catalog.drawChallengeWords({
          visitorId: VISITOR_ID,
          limit: PRACTICE_WORD_COUNT,
        });

        expect(practice.map(({ id }) => id)).toContain(NEW_WORD_ID);
        expect(challenge.map(({ id }) => id)).toContain(NEW_WORD_ID);
        expect(practice.find(({ id }) => id === NEW_WORD_ID)).toMatchObject({
          english: "Pear",
          portuguese: "Pêra",
          active: true,
        });
        expect(countRows(database, "LearnerWordProgress")).toBe(0);
      } finally {
        database.close();
      }
    });
  });
});
