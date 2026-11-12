import { describe, expect, it } from "vitest";

import {
  DuplicateVocabularyError,
  findDuplicateEntry,
  InvalidVocabularyEntryError,
  parseVocabularyTexts,
  VocabularyEntry,
  vocabularyKey,
} from "@/lib/domain/vocabulary";

function entry(id: string, english: string, portuguese: string, active = true): VocabularyEntry {
  return VocabularyEntry.restore({
    id,
    texts: parseVocabularyTexts({ english, portuguese }),
    active,
  });
}

describe("VocabularyEntry", () => {
  it("creates an active entry that keeps accents and capitals", () => {
    const created = VocabularyEntry.create({
      id: " word-1 ",
      texts: parseVocabularyTexts({
        english: " New  York ",
        portuguese: " Nova  Iórque ",
        exampleSentence: "  ",
      }),
    });
    expect(created.id).toBe("word-1");
    expect(created.active).toBe(true);
    expect(created.english).toBe("New York");
    expect(created.portuguese).toBe("Nova Iórque");
    expect(created.exampleSentence).toBeNull();
    expect(created.key()).toBe(vocabularyKey("newyork", "nova iorque"));
    expect(created.identity()).toEqual({
      id: "word-1",
      english: "New York",
      portuguese: "Nova Iórque",
    });
  });

  it("requires an id", () => {
    expect(() =>
      VocabularyEntry.create({
        id: "  ",
        texts: parseVocabularyTexts({ english: "apple", portuguese: "maçã" }),
      }),
    ).toThrow(InvalidVocabularyEntryError);
  });

  it("restores an inactive entry", () => {
    expect(entry("w", "apple", "maçã", false).active).toBe(false);
  });
});

describe("findDuplicateEntry", () => {
  const catalog = [
    entry("apple", "Apple", "Maçã"),
    entry("ny", "New York", "Nova York"),
    entry("old", "bank", "banco", false),
  ];

  it("finds the stored entry for a case, accent or space variation", () => {
    expect(findDuplicateEntry(catalog, vocabularyKey("apple", "maca"))?.id).toBe("apple");
    expect(findDuplicateEntry(catalog, vocabularyKey("APPLE", "MAÇÃ"))?.id).toBe("apple");
    expect(findDuplicateEntry(catalog, vocabularyKey("newyork", "novayork"))?.id).toBe("ny");
  });

  it("finds a duplicate among inactive entries", () => {
    const duplicate = findDuplicateEntry(catalog, vocabularyKey("Bank", "Banco"));
    expect(duplicate?.id).toBe("old");
    expect(duplicate?.active).toBe(false);
  });

  it("returns nothing when only one side matches", () => {
    expect(findDuplicateEntry(catalog, vocabularyKey("apple", "pera"))).toBeUndefined();
    expect(findDuplicateEntry(catalog, vocabularyKey("pear", "maçã"))).toBeUndefined();
  });

  it("ignores the entry being edited", () => {
    expect(findDuplicateEntry(catalog, vocabularyKey("apple", "maçã"), "apple")).toBeUndefined();
  });

  it("names the stored text, not the typed text, in the duplicate error", () => {
    const duplicate = findDuplicateEntry(catalog, vocabularyKey(" apple ", "maca"));
    expect(duplicate).toBeDefined();
    const error = new DuplicateVocabularyError(duplicate!.identity());
    expect(error.code).toBe("DUPLICATE_VOCABULARY");
    expect(error.existing).toEqual({ id: "apple", english: "Apple", portuguese: "Maçã" });
  });
});
