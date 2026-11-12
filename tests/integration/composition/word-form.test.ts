import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createWordRegistration, type WordRegistrationEvent } from "@/composition/word-registration";
import type { Clock } from "@/lib/domain/game/types";
import {
  WORD_FORM_FAILED_MESSAGE,
  WordFormController,
  wordFormView,
} from "@/lib/presentation/vocabulary/word-form";
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
const fixedClock: Clock = { now: () => new Date("2026-11-12T11:30:00.000Z") };

/** Fails the next transaction, like a full disk, then works again. */
class FlakyVocabularyRepository extends SqliteVocabularyRepository {
  failNext = false;

  override async transaction<T>(
    work: Parameters<SqliteVocabularyRepository["transaction"]>[0],
  ): Promise<T> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("disk is full");
    }
    return super.transaction(work) as Promise<T>;
  }
}

interface FormRig {
  readonly controller: WordFormController;
  readonly repository: FlakyVocabularyRepository;
  readonly database: Database.Database;
  readonly events: WordRegistrationEvent[];
  readonly announcements: string[];
}

async function withForm(work: (rig: FormRig) => Promise<void>): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      const runInTransaction = runBetterSqliteTransaction(database);
      await bootstrapEnglishDatabase({
        executor,
        runInTransaction,
        createVisitorId: () => VISITOR_ID,
        now: () => new Date(OPENED_AT),
      });
      const repository = new FlakyVocabularyRepository(executor, runInTransaction, fixedClock);
      const events: WordRegistrationEvent[] = [];
      const announcements: string[] = [];
      let sequence = 0;
      const controller = new WordFormController({
        registration: createWordRegistration({
          repository,
          createId: () => `registered-${++sequence}`,
          recordEvent: (event) => events.push(event),
        }),
        onChange: () => undefined,
        focus: () => undefined,
        announce: (message) => announcements.push(message),
      });
      await work({ controller, repository, database, events, announcements });
    } finally {
      database.close();
    }
  });
}

function countWords(database: Database.Database): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "Word"`).get() as { total: number };
  return row.total;
}

async function type(controller: WordFormController, english: string, portuguese: string, sentence = "") {
  controller.change("english", english);
  controller.change("portuguese", portuguese);
  controller.change("exampleSentence", sentence);
  await controller.submit();
}

describe("word form against SQLite", () => {
  it("registers a word, refuses the duplicate with the stored text and clears only on success", async () => {
    await withForm(async ({ controller, database, announcements }) => {
      await type(controller, "  Window ", "janela", "Open the   window.");

      expect(controller.state.values).toEqual({ english: "", portuguese: "", exampleSentence: "" });
      expect(wordFormView(controller.state).notice?.message).toBe(
        "Palavra adicionada: Window — janela.",
      );
      const stored = database
        .prepare(`SELECT "english", "portuguese", "exampleSentence", "active" FROM "Word" WHERE "id" = ?`)
        .get("registered-1");
      expect(stored).toEqual({
        english: "Window",
        portuguese: "janela",
        exampleSentence: "Open the window.",
        active: 1,
      });

      const before = countWords(database);
      await type(controller, "WINDOW", "Janéla");

      expect(countWords(database)).toBe(before);
      expect(controller.state.values).toMatchObject({ english: "WINDOW", portuguese: "Janéla" });
      const view = wordFormView(controller.state);
      expect(view.fields[0]?.error).toBe("Já cadastrada: Window — janela.");
      expect(view.fields[1]?.error).toBe("Já cadastrada: Window — janela.");
      expect(announcements.at(-1)).toBe("Esta palavra já está cadastrada: Window — janela.");
    });
  });

  it("keeps the typed text when the save fails and saves it on the retry", async () => {
    await withForm(async ({ controller, repository, database, events }) => {
      const before = countWords(database);
      repository.failNext = true;

      await type(controller, "lamp", "luminária", "Turn on the lamp.");

      expect(countWords(database)).toBe(before);
      expect(events).toEqual(["words.create_failed"]);
      expect(controller.state.values).toEqual({
        english: "lamp",
        portuguese: "luminária",
        exampleSentence: "Turn on the lamp.",
      });
      expect(wordFormView(controller.state).notice?.message).toBe(WORD_FORM_FAILED_MESSAGE);

      await controller.submit();

      expect(countWords(database)).toBe(before + 1);
      expect(controller.state.values.english).toBe("");
    });
  });

  it("registers ten words in sequence with a sentence and a refused duplicate, storing nine", async () => {
    await withForm(async ({ controller, database }) => {
      const words: readonly [string, string, string?][] = [
        ["pear", "pera", "A ripe pear."],
        ["grape", "uva"],
        ["lemon", "limão"],
        [" PEAR ", "Pêra"],
        ["peach", "pêssego"],
        ["plum", "ameixa"],
        ["cherry", "cereja"],
        ["melon", "melão"],
        ["mango", "manga"],
        ["kiwi fruit", "quiuí"],
      ];
      for (const [english, portuguese, sentence] of words) {
        await type(controller, english, portuguese, sentence);
        if (english === " PEAR ") {
          controller.change("english", "");
          controller.change("portuguese", "");
        }
      }

      expect(countWords(database)).toBe(vocabularySeed.length + 9);
    });
  });
});
