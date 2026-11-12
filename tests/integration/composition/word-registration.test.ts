import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  createWordRegistration,
  type RegisterWordOutcome,
  type WordRegistrationEvent,
} from "@/composition/word-registration";
import type { Clock } from "@/lib/domain/game/types";
import type { VocabularyTextInput } from "@/lib/domain/vocabulary";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteVocabularyRepository } from "@/persistence/sqlite-vocabulary-repository";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const OPENED_AT = "2026-11-12T10:00:00.000Z";
const CREATED_AT = "2026-11-12T11:30:00.000Z";
const INITIAL_WORD_COUNT = vocabularySeed.length;

const TEN_WORDS: readonly VocabularyTextInput[] = [
  { english: "pear", portuguese: "pera", exampleSentence: "A ripe pear fell from the tree." },
  { english: "grape", portuguese: "uva" },
  { english: "lemon", portuguese: "limão" },
  { english: " PEAR ", portuguese: "Pêra" },
  { english: "orange", portuguese: "laranja" },
  { english: "peach", portuguese: "pêssego" },
  { english: "plum", portuguese: "ameixa" },
  { english: "cherry", portuguese: "cereja" },
  { english: "melon", portuguese: "melão" },
  { english: "mango", portuguese: "manga" },
];

interface StoredWordRow {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  active: number;
}

const fixedClock: Clock = { now: () => new Date(CREATED_AT) };

function sequentialIds(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `registered-${String(sequence).padStart(2, "0")}`;
  };
}

async function openDatabase(filePath: string): Promise<Database.Database> {
  const database = new Database(filePath);
  await bootstrapEnglishDatabase({
    executor: createBetterSqliteExecutor(database),
    runInTransaction: runBetterSqliteTransaction(database),
    createVisitorId: () => VISITOR_ID,
    now: () => new Date(OPENED_AT),
  });
  return database;
}

function registrationFor(database: Database.Database, events: WordRegistrationEvent[]) {
  return createWordRegistration({
    repository: new SqliteVocabularyRepository(
      createBetterSqliteExecutor(database),
      runBetterSqliteTransaction(database),
      fixedClock,
    ),
    createId: sequentialIds(),
    recordEvent: (event) => {
      events.push(event);
    },
  });
}

function registeredWords(database: Database.Database): StoredWordRow[] {
  return database
    .prepare(
      `SELECT "id", "english", "portuguese", "exampleSentence", "active"
       FROM "Word" WHERE "id" LIKE 'registered-%' ORDER BY "id" ASC`,
    )
    .all() as StoredWordRow[];
}

function countWords(database: Database.Database): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "Word"`).get() as {
    total: number;
  };
  return row.total;
}

describe("word registration against SQLite", () => {
  it("registers ten words in sequence, with a sentence and a refused duplicate, and stores nine", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath);
      const events: WordRegistrationEvent[] = [];
      try {
        const registration = registrationFor(database, events);
        const outcomes: RegisterWordOutcome[] = [];
        for (const input of TEN_WORDS) {
          outcomes.push(await registration.register(input));
        }

        expect(outcomes.map((outcome) => outcome.kind)).toEqual([
          "created",
          "created",
          "created",
          "duplicate",
          "created",
          "created",
          "created",
          "created",
          "created",
          "created",
        ]);
        expect(outcomes[3]).toEqual({
          kind: "duplicate",
          existing: { english: "pear", portuguese: "pera" },
        });
        expect(countWords(database)).toBe(INITIAL_WORD_COUNT + 9);
        const stored = registeredWords(database);
        expect(stored).toHaveLength(9);
        expect(stored.every((row) => row.active === 1)).toBe(true);
        expect(stored[0]).toMatchObject({
          english: "pear",
          portuguese: "pera",
          exampleSentence: "A ripe pear fell from the tree.",
        });
        expect(events).toEqual([]);
      } finally {
        database.close();
      }
    });
  });

  it("keeps calls fired together from overlapping transactions", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = await openDatabase(filePath);
      const events: WordRegistrationEvent[] = [];
      try {
        const registration = registrationFor(database, events);

        const outcomes = await Promise.all(TEN_WORDS.map((input) => registration.register(input)));

        expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(9);
        expect(outcomes[3]?.kind).toBe("duplicate");
        expect(registeredWords(database)).toHaveLength(9);
        expect(events).toEqual([]);
      } finally {
        database.close();
      }
    });
  });
});
