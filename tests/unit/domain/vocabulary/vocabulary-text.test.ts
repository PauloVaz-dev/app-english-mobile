import { describe, expect, it } from "vitest";

import {
  MAX_EXAMPLE_SENTENCE_LENGTH,
  MAX_VOCABULARY_TERM_LENGTH,
  parseVocabularyTexts,
} from "@/lib/domain/vocabulary/vocabulary-text";

describe("parseVocabularyTexts", () => {
  it("trims terms, collapses spaces and drops a blank example", () => {
    expect(
      parseVocabularyTexts({
        english: "  give   up  ",
        portuguese: "  desistir  ",
        exampleSentence: "   ",
      }),
    ).toEqual({
      english: "give up",
      portuguese: "desistir",
      exampleSentence: null,
    });
  });

  it("keeps a trimmed example sentence", () => {
    expect(
      parseVocabularyTexts({
        english: "apple",
        portuguese: "maçã",
        exampleSentence: "  I eat an apple.  ",
      }).exampleSentence,
    ).toBe("I eat an apple.");
  });

  it("rejects an empty English or Portuguese term", () => {
    expect(() => parseVocabularyTexts({ english: "   ", portuguese: "maçã" })).toThrow(
      expect.objectContaining({ field: "english", reason: "required" }),
    );
    expect(() => parseVocabularyTexts({ english: "apple", portuguese: " " })).toThrow(
      expect.objectContaining({ field: "portuguese", reason: "required" }),
    );
  });

  it("reports every empty term in one failure", () => {
    expect(() => parseVocabularyTexts({ english: " ", portuguese: " " })).toThrow(
      expect.objectContaining({
        issues: [
          { field: "english", reason: "required" },
          { field: "portuguese", reason: "required" },
        ],
      }),
    );
  });

  it("rejects a term or example that is too long", () => {
    const longTerm = "a".repeat(MAX_VOCABULARY_TERM_LENGTH + 1);
    const longExample = "b".repeat(MAX_EXAMPLE_SENTENCE_LENGTH + 1);
    expect(() => parseVocabularyTexts({ english: longTerm, portuguese: "maçã" })).toThrow(
      expect.objectContaining({ field: "english", reason: "too_long" }),
    );
    expect(() =>
      parseVocabularyTexts({
        english: "apple",
        portuguese: "maçã",
        exampleSentence: longExample,
      }),
    ).toThrow(expect.objectContaining({ field: "exampleSentence", reason: "too_long" }));
  });
});
