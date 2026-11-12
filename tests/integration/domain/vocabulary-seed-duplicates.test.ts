import { describe, expect, it } from "vitest";

import { vocabularySeed } from "../../../prisma/seed-data";
import {
  findDuplicateEntry,
  parseVocabularyTexts,
  VocabularyEntry,
  vocabularyKey,
  type VocabularyTextInput,
} from "@/lib/domain/vocabulary";

function seedCatalog(): VocabularyEntry[] {
  return vocabularySeed.map((seed) =>
    VocabularyEntry.restore({
      id: seed.id,
      texts: parseVocabularyTexts(seed),
      active: true,
    }),
  );
}

function accept(catalog: VocabularyEntry[], input: VocabularyTextInput, id: string): boolean {
  const texts = parseVocabularyTexts(input);
  if (findDuplicateEntry(catalog, vocabularyKey(texts.english, texts.portuguese))) {
    return false;
  }
  catalog.push(VocabularyEntry.create({ id, texts }));
  return true;
}

describe("in-memory catalog with the initial vocabulary", () => {
  it("has no duplicate keys in the initial vocabulary", () => {
    const keys = seedCatalog().map((entry) => entry.key());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses case, accent and space variations of an existing word", () => {
    const catalog = seedCatalog();
    const size = catalog.length;
    const apple = vocabularySeed.find((seed) => seed.english === "apple");
    expect(apple?.portuguese).toBe("maçã");
    for (const variation of [
      { english: "Apple", portuguese: "Maçã" },
      { english: "APPLE", portuguese: "MAÇÃ" },
      { english: "apple", portuguese: "maca" },
      { english: "  ap ple ", portuguese: " ma çã " },
    ]) {
      expect(accept(catalog, variation, "new")).toBe(false);
    }
    expect(catalog).toHaveLength(size);
  });

  it("accepts a pair where only one side matches an existing word", () => {
    const catalog = seedCatalog();
    const size = catalog.length;
    expect(accept(catalog, { english: "apple", portuguese: "maçã verde" }, "w1")).toBe(true);
    expect(accept(catalog, { english: "green apple", portuguese: "maçã" }, "w2")).toBe(true);
    expect(catalog).toHaveLength(size + 2);
    expect(catalog.at(-1)?.english).toBe("green apple");
  });

  it("refuses a variation of a word just added", () => {
    const catalog = seedCatalog();
    expect(accept(catalog, { english: "New York", portuguese: "Nova Iórque" }, "w1")).toBe(true);
    expect(accept(catalog, { english: "newyork", portuguese: "nova iorque" }, "w2")).toBe(false);
  });
});
