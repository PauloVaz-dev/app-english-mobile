import { describe, expect, it } from "vitest";

import { evaluateTypedAnswer } from "@/lib/domain/learning/typing-answer";

describe("evaluateTypedAnswer normalization", () => {
  it.each([
    { expected: "cat", typed: "CAT" },
    { expected: "Apple", typed: "apple" },
    { expected: "apple", typed: "APPLE" },
    { expected: "café", typed: "cafe" },
    { expected: "cafe", typed: "café" },
    { expected: "ação", typed: "acao" },
    { expected: "  apple  ", typed: "apple" },
    { expected: "give   up", typed: "give up" },
    { expected: "  AÇÃO   RÁPIDA  ", typed: "acao rapida" },
  ])("treats $typed as the same word as $expected", ({ expected, typed }) => {
    expect(evaluateTypedAnswer(expected, typed)).toBe("CORRECT");
  });

  it("compares a multi-word expression as one answer", () => {
    expect(evaluateTypedAnswer("give up", "Give Up")).toBe("CORRECT");
    expect(evaluateTypedAnswer("give up", "up give")).toBe("WRONG");
    expect(evaluateTypedAnswer("give up", "take up")).toBe("WRONG");
  });
});

describe("evaluateTypedAnswer", () => {
  it.each([
    { expected: "word", typed: "ward", outcome: "ALMOST" },
    { expected: "word", typed: "wod", outcome: "ALMOST" },
    { expected: "word", typed: "words", outcome: "ALMOST" },
    { expected: "book", typed: "boak", outcome: "ALMOST" },
    { expected: "book", typed: "bok", outcome: "ALMOST" },
    { expected: "book", typed: "books", outcome: "ALMOST" },
    { expected: "give up", typed: "giveup", outcome: "ALMOST" },
  ])(
    "accepts one edit on a word of 4 or more letters: $expected vs $typed",
    ({ expected, typed, outcome }) => {
      expect(evaluateTypedAnswer(expected, typed)).toBe(outcome);
    },
  );

  it.each([
    { expected: "cat", typed: "car" },
    { expected: "cat", typed: "ca" },
    { expected: "cat", typed: "cats" },
    { expected: "tea", typed: "tee" },
  ])(
    "rejects one edit on a 3-letter word: $expected vs $typed",
    ({ expected, typed }) => {
      expect(evaluateTypedAnswer(expected, typed)).toBe("WRONG");
    },
  );

  it.each([
    { expected: "form", typed: "from" },
    { expected: "stop", typed: "spot" },
    { expected: "beautiful", typed: "beuatiful" },
    { expected: "word", typed: "wardx" },
  ])("rejects a transposition or any other difference: $expected vs $typed", ({
    expected,
    typed,
  }) => {
    expect(evaluateTypedAnswer(expected, typed)).toBe("WRONG");
  });

  it("rejects a blank answer", () => {
    expect(evaluateTypedAnswer("apple", "   ")).toBe("WRONG");
  });
});
