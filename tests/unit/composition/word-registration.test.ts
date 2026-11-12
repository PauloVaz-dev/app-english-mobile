import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createPreparedWordRegistration,
  createWordRegistration,
  WORDS_CREATE_FAILED,
  type WordRegistration,
  type WordRegistrationEvent,
} from "@/composition/word-registration";
import type {
  VocabularyRepository,
  VocabularyStore,
} from "@/lib/application/vocabulary/ports/vocabulary-repository";
import { VocabularyEntry } from "@/lib/domain/vocabulary";

const TYPED_ENGLISH = "Secret Pear";
const TYPED_PORTUGUESE = "Pêra Secreta";
const TYPED_SENTENCE = "Only the learner should read this sentence.";

class MemoryVocabulary implements VocabularyRepository {
  readonly entries: VocabularyEntry[] = [];
  readonly trace: string[] = [];
  transactions = 0;
  failNextInsert: Error | null = null;
  private open = 0;

  async transaction<T>(work: (store: VocabularyStore) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const label = this.transactions;
    this.open += 1;
    if (this.open > 1) {
      this.trace.push("overlap");
    }
    this.trace.push(`begin:${label}`);
    const staged: VocabularyEntry[] = [];
    try {
      const store: VocabularyStore = {
        listAll: async () => {
          await Promise.resolve();
          return [...this.entries];
        },
        insert: async (entry) => {
          await Promise.resolve();
          if (this.failNextInsert !== null) {
            const failure = this.failNextInsert;
            this.failNextInsert = null;
            throw failure;
          }
          staged.push(entry);
        },
      };
      const value = await work(store);
      this.entries.push(...staged);
      return value;
    } finally {
      this.trace.push(`end:${label}`);
      this.open -= 1;
    }
  }

  seed(english: string, portuguese: string, active = true): void {
    const entry = VocabularyEntry.restore({
      id: `stored-${this.entries.length + 1}`,
      active,
      texts: { english, portuguese, exampleSentence: null },
    });
    this.entries.push(entry);
  }
}

function sequentialIds(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `word-${sequence}`;
  };
}

interface Setup {
  readonly registration: WordRegistration;
  readonly repository: MemoryVocabulary;
  readonly events: unknown[][];
}

function setup(): Setup {
  const repository = new MemoryVocabulary();
  const events: unknown[][] = [];
  const registration = createWordRegistration({
    repository,
    createId: sequentialIds(),
    recordEvent: (...args: [WordRegistrationEvent]) => {
      events.push(args);
    },
  });
  return { registration, repository, events };
}

describe("word registration with a fake repository", () => {
  it("returns created with the stored id and the cleaned text", async () => {
    const { registration, repository, events } = setup();

    const outcome = await registration.register({
      english: "  Green   Apple ",
      portuguese: "Maçã  Verde",
      exampleSentence: "  ",
    });

    expect(outcome).toEqual({
      kind: "created",
      word: { id: "word-1", english: "Green Apple", portuguese: "Maçã Verde" },
    });
    expect(repository.entries.map((entry) => entry.id)).toEqual(["word-1"]);
    expect(events).toEqual([]);
  });

  it("returns invalid with every field error and never opens a transaction", async () => {
    const { registration, repository, events } = setup();

    const outcome = await registration.register({
      english: "   ",
      portuguese: "",
      exampleSentence: "x".repeat(241),
    });

    expect(outcome).toEqual({
      kind: "invalid",
      issues: [
        { field: "english", reason: "required" },
        { field: "portuguese", reason: "required" },
        { field: "exampleSentence", reason: "too_long" },
      ],
    });
    expect(repository.transactions).toBe(0);
    expect(events).toEqual([]);
  });

  it("returns duplicate with the stored text, inserts nothing and logs nothing", async () => {
    const { registration, repository, events } = setup();
    repository.seed("New York", "Nova Iorque", false);

    const outcome = await registration.register({
      english: "newyork",
      portuguese: "nova  iorque",
    });

    expect(outcome).toEqual({
      kind: "duplicate",
      existing: { english: "New York", portuguese: "Nova Iorque" },
    });
    expect(repository.entries).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it("records words.create_failed without the typed text and rejects with the cause", async () => {
    const { registration, repository, events } = setup();
    const failure = new Error("disk I/O error");
    repository.failNextInsert = failure;

    await expect(
      registration.register({
        english: TYPED_ENGLISH,
        portuguese: TYPED_PORTUGUESE,
        exampleSentence: TYPED_SENTENCE,
      }),
    ).rejects.toBe(failure);

    expect(events).toEqual([[WORDS_CREATE_FAILED]]);
    const logged = JSON.stringify(events);
    for (const typed of [TYPED_ENGLISH, TYPED_PORTUGUESE, TYPED_SENTENCE]) {
      expect(logged).not.toContain(typed);
    }
    expect(repository.entries).toEqual([]);
  });

  it("lets the same text be retried after a failure", async () => {
    const { registration, repository } = setup();
    repository.failNextInsert = new Error("database is locked");
    const input = { english: TYPED_ENGLISH, portuguese: TYPED_PORTUGUESE };

    await expect(registration.register(input)).rejects.toThrow("database is locked");
    const retried = await registration.register(input);

    expect(retried.kind).toBe("created");
    expect(repository.entries).toHaveLength(1);
  });

  it("keeps the rejection when the event log itself throws", async () => {
    const repository = new MemoryVocabulary();
    const failure = new Error("disk full");
    repository.failNextInsert = failure;
    const registration = createWordRegistration({
      repository,
      createId: sequentialIds(),
      recordEvent: () => {
        throw new Error("console unavailable");
      },
    });

    await expect(
      registration.register({ english: "pear", portuguese: "pera" }),
    ).rejects.toBe(failure);
  });

  it("runs calls one transaction at a time, in call order", async () => {
    const { registration, repository } = setup();
    repository.failNextInsert = new Error("busy");

    const outcomes = await Promise.allSettled([
      registration.register({ english: "pear", portuguese: "pera" }),
      registration.register({ english: "grape", portuguese: "uva" }),
      registration.register({ english: "PEAR", portuguese: "Pêra" }),
      registration.register({ english: "lemon", portuguese: "limão" }),
    ]);

    expect(repository.trace).toEqual([
      "begin:1",
      "end:1",
      "begin:2",
      "end:2",
      "begin:3",
      "end:3",
      "begin:4",
      "end:4",
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    expect(repository.entries.map((entry) => entry.english)).toEqual(["grape", "PEAR", "lemon"]);
  });
});

describe("prepared word registration", () => {
  it("prepares once and delegates every call in order", async () => {
    const { registration, repository } = setup();
    let preparations = 0;
    const prepared = createPreparedWordRegistration({
      prepare: async () => {
        preparations += 1;
        return registration;
      },
      recordEvent: () => undefined,
    });

    const outcomes = await Promise.all([
      prepared.register({ english: "pear", portuguese: "pera" }),
      prepared.register({ english: "Pear", portuguese: "Pêra" }),
    ]);

    expect(preparations).toBe(1);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["created", "duplicate"]);
    expect(repository.trace).toEqual(["begin:1", "end:1", "begin:2", "end:2"]);
  });

  it("records words.create_failed when the database cannot be prepared and retries later", async () => {
    const { registration } = setup();
    const events: WordRegistrationEvent[] = [];
    const failure = new Error("cannot open english.db");
    let attempts = 0;
    const prepared = createPreparedWordRegistration({
      prepare: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw failure;
        }
        return registration;
      },
      recordEvent: (event) => {
        events.push(event);
      },
    });

    await expect(
      prepared.register({ english: TYPED_ENGLISH, portuguese: TYPED_PORTUGUESE }),
    ).rejects.toBe(failure);
    const retried = await prepared.register({
      english: TYPED_ENGLISH,
      portuguese: TYPED_PORTUGUESE,
    });

    expect(events).toEqual([WORDS_CREATE_FAILED]);
    expect(retried.kind).toBe("created");
    expect(attempts).toBe(2);
  });
});

describe("word registration boundary", () => {
  const read = (path: string) =>
    readFileSync(fileURLToPath(new URL(`../../../src/composition/${path}`, import.meta.url)), "utf8");

  it("keeps Expo and React Native out of the pure composition", () => {
    const source = read("word-registration.ts");
    expect(source).not.toMatch(/from\s+["'](expo[^"']*|@expo\/[^"']*|react-native[^"']*)["']/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("wires the device with static named imports only", () => {
    const source = read("installed-word-registration.ts");
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/import\s+\*\s+as/);
    expect(source).toMatch(/import\s*\{[^}]*randomUUID[^}]*\}\s*from\s*"expo-crypto"/);
    expect(source).toMatch(/import\s*\{[^}]*logDeviceEvent[^}]*\}\s*from/);
    expect(source).toContain("connectEnglishDatabase");
    expect(source).toContain("createEnglishDatabaseSession");
    expect(source).toContain("prepareHomeStudy");
    expect(source).toContain("SqliteVocabularyRepository");
  });
});
