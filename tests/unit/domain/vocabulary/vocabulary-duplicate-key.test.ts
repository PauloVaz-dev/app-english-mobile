import { describe, expect, it } from "vitest";

import { vocabularyKey } from "@/lib/domain/vocabulary";

describe("vocabularyKey pairs from the PRD", () => {
  it("treats maçã and maca as the same pair", () => {
    expect(vocabularyKey("apple", "maçã")).toBe(vocabularyKey("apple", "maca"));
  });

  it("treats New York and newyork as the same pair", () => {
    expect(vocabularyKey("New York", "Nova York")).toBe(vocabularyKey("newyork", "novayork"));
  });

  it("treats a difference only in capitals as the same pair", () => {
    expect(vocabularyKey("Apple", "MAÇÃ")).toBe(vocabularyKey("apple", "maçã"));
  });

  it("keeps the same English with another Portuguese as a new pair", () => {
    expect(vocabularyKey("bank", "banco")).not.toBe(vocabularyKey("bank", "margem"));
  });

  it("keeps the same Portuguese with another English as a new pair", () => {
    expect(vocabularyKey("bank", "banco")).not.toBe(vocabularyKey("bench", "banco"));
  });

  it("does not merge text across the English and Portuguese boundary", () => {
    expect(vocabularyKey("ab", "c")).not.toBe(vocabularyKey("a", "bc"));
  });
});
