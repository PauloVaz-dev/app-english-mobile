import { describe, expect, it } from "vitest";

import {
  InvalidVocabularyTextError,
  MAX_EXAMPLE_SENTENCE_LENGTH,
  MAX_VOCABULARY_TERM_LENGTH,
  parseVocabularyTexts,
} from "@/lib/domain/vocabulary";

function issuesOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidVocabularyTextError);
    return (error as InvalidVocabularyTextError).issues;
  }
  throw new Error("expected parseVocabularyTexts to fail");
}

describe("parseVocabularyTexts limits from the PRD", () => {
  it("uses 80 characters for terms and 240 for the sentence", () => {
    expect(MAX_VOCABULARY_TERM_LENGTH).toBe(80);
    expect(MAX_EXAMPLE_SENTENCE_LENGTH).toBe(240);
  });

  it("accepts English and Portuguese with exactly 80 characters", () => {
    const term = "a".repeat(80);
    const texts = parseVocabularyTexts({ english: term, portuguese: term });
    expect(texts.english).toBe(term);
    expect(texts.portuguese).toBe(term);
  });

  it("rejects English or Portuguese with 81 characters", () => {
    const term = "a".repeat(81);
    expect(issuesOf(() => parseVocabularyTexts({ english: term, portuguese: "maçã" }))).toEqual([
      { field: "english", reason: "too_long" },
    ]);
    expect(issuesOf(() => parseVocabularyTexts({ english: "apple", portuguese: term }))).toEqual([
      { field: "portuguese", reason: "too_long" },
    ]);
  });

  it("measures the limit after trimming and collapsing spaces", () => {
    const padded = `   ${"a".repeat(40)}      ${"b".repeat(39)}   `;
    const texts = parseVocabularyTexts({ english: padded, portuguese: "maçã" });
    expect(texts.english).toHaveLength(80);
    expect(texts.english).toBe(`${"a".repeat(40)} ${"b".repeat(39)}`);
  });

  it("accepts a sentence with 240 characters and rejects one with 241", () => {
    const sentence = "s".repeat(240);
    expect(
      parseVocabularyTexts({ english: "apple", portuguese: "maçã", exampleSentence: sentence })
        .exampleSentence,
    ).toBe(sentence);
    expect(
      issuesOf(() =>
        parseVocabularyTexts({
          english: "apple",
          portuguese: "maçã",
          exampleSentence: `${sentence}s`,
        }),
      ),
    ).toEqual([{ field: "exampleSentence", reason: "too_long" }]);
  });

  it("treats an empty, blank or missing sentence as absent, not as an error", () => {
    for (const exampleSentence of ["", "   ", "\t \n", null, undefined]) {
      expect(
        parseVocabularyTexts({ english: "apple", portuguese: "maçã", exampleSentence })
          .exampleSentence,
      ).toBeNull();
    }
  });

  it("rejects terms made only of whitespace", () => {
    expect(issuesOf(() => parseVocabularyTexts({ english: "\t \n", portuguese: "maçã" }))).toEqual([
      { field: "english", reason: "required" },
    ]);
  });

  it("reports both errors when English and Portuguese fail together", () => {
    expect(
      issuesOf(() => parseVocabularyTexts({ english: "  ", portuguese: "a".repeat(81) })),
    ).toEqual([
      { field: "english", reason: "required" },
      { field: "portuguese", reason: "too_long" },
    ]);
    expect(
      issuesOf(() =>
        parseVocabularyTexts({
          english: "a".repeat(81),
          portuguese: "",
          exampleSentence: "s".repeat(241),
        }),
      ),
    ).toEqual([
      { field: "english", reason: "too_long" },
      { field: "portuguese", reason: "required" },
      { field: "exampleSentence", reason: "too_long" },
    ]);
  });

  it("keeps accents and capitals in the stored text", () => {
    expect(
      parseVocabularyTexts({
        english: "  New   York ",
        portuguese: " Maçã  Verde ",
        exampleSentence: " Ela comeu a Maçã. ",
      }),
    ).toEqual({
      english: "New York",
      portuguese: "Maçã Verde",
      exampleSentence: "Ela comeu a Maçã.",
    });
  });
});
