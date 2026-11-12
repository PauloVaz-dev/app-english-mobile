import { describe, expect, it } from "vitest";

import { CreateWord } from "@/lib/application/vocabulary/create-word";
import type {
  VocabularyRepository,
  VocabularyStore,
} from "@/lib/application/vocabulary/ports/vocabulary-repository";
import {
  DuplicateVocabularyError,
  InvalidVocabularyTextError,
  VocabularyEntry,
} from "@/lib/domain/vocabulary";

const NEW_WORD_ID = "word-new";

class InMemoryVocabularyRepository implements VocabularyRepository {
  readonly entries: VocabularyEntry[];
  transactions = 0;

  constructor(entries: readonly VocabularyEntry[] = []) {
    this.entries = [...entries];
  }

  async transaction<T>(work: (store: VocabularyStore) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const staged = [...this.entries];
    const result = await work({
      listAll: async () => [...staged],
      insert: async (entry) => {
        staged.push(entry);
      },
    });
    this.entries.splice(0, this.entries.length, ...staged);
    return result;
  }
}

function storedEntry(input: {
  id: string;
  english: string;
  portuguese: string;
  active?: boolean;
}): VocabularyEntry {
  return VocabularyEntry.restore({
    id: input.id,
    active: input.active ?? true,
    texts: { english: input.english, portuguese: input.portuguese, exampleSentence: null },
  });
}

function createUseCase(repository: InMemoryVocabularyRepository): CreateWord {
  return new CreateWord({ repository, idGenerator: { generate: () => NEW_WORD_ID } });
}

describe("CreateWord", () => {
  it("rejects invalid text without opening a transaction", async () => {
    const repository = new InMemoryVocabularyRepository();
    const createWord = createUseCase(repository);

    await expect(createWord.execute({ english: "   ", portuguese: "" })).rejects.toBeInstanceOf(
      InvalidVocabularyTextError,
    );
    expect(repository.transactions).toBe(0);
    expect(repository.entries).toHaveLength(0);
  });

  it("reports every invalid field together", async () => {
    const repository = new InMemoryVocabularyRepository();
    const createWord = createUseCase(repository);

    await expect(
      createWord.execute({ english: "a".repeat(81), portuguese: " " }),
    ).rejects.toMatchObject({
      issues: [
        { field: "english", reason: "too_long" },
        { field: "portuguese", reason: "required" },
      ],
    });
  });

  it("returns the stored texts on a duplicate and inserts nothing", async () => {
    const existing = storedEntry({ id: "word-apple", english: "Apple", portuguese: "maçã" });
    const repository = new InMemoryVocabularyRepository([existing]);
    const createWord = createUseCase(repository);

    const failure = createWord.execute({ english: " apple ", portuguese: "MACA" });

    await expect(failure).rejects.toBeInstanceOf(DuplicateVocabularyError);
    await expect(failure).rejects.toMatchObject({
      existing: { id: "word-apple", english: "Apple", portuguese: "maçã" },
    });
    expect(repository.entries).toEqual([existing]);
  });

  it("treats an inactive word as a duplicate", async () => {
    const inactive = storedEntry({
      id: "word-york",
      english: "New York",
      portuguese: "Nova York",
      active: false,
    });
    const repository = new InMemoryVocabularyRepository([inactive]);
    const createWord = createUseCase(repository);

    await expect(
      createWord.execute({ english: "newyork", portuguese: "nova york" }),
    ).rejects.toMatchObject({ existing: { id: "word-york", english: "New York" } });
    expect(repository.entries).toEqual([inactive]);
  });

  it("inserts one active entry with the cleaned text", async () => {
    const repository = new InMemoryVocabularyRepository([
      storedEntry({ id: "word-apple", english: "apple", portuguese: "maçã" }),
    ]);
    const createWord = createUseCase(repository);

    const created = await createWord.execute({
      english: "  apple   pie ",
      portuguese: " Torta  de maçã ",
      exampleSentence: "   ",
    });

    expect(created).toEqual({
      id: NEW_WORD_ID,
      english: "apple pie",
      portuguese: "Torta de maçã",
      exampleSentence: null,
      active: true,
    });
    expect(repository.transactions).toBe(1);
    expect(repository.entries).toHaveLength(2);
    const inserted = repository.entries[1];
    expect(inserted?.id).toBe(NEW_WORD_ID);
    expect(inserted?.active).toBe(true);
    expect(inserted?.english).toBe("apple pie");
  });

  it("accepts the same English with a different Portuguese as a new word", async () => {
    const repository = new InMemoryVocabularyRepository([
      storedEntry({ id: "word-apple", english: "apple", portuguese: "maçã" }),
    ]);
    const createWord = createUseCase(repository);

    await expect(
      createWord.execute({ english: "apple", portuguese: "macieira" }),
    ).resolves.toMatchObject({ id: NEW_WORD_ID, portuguese: "macieira" });
    expect(repository.entries).toHaveLength(2);
  });
});
