import { describe, expect, it } from "vitest";

import { vocabularyKey } from "@/lib/domain/vocabulary/vocabulary-key";

describe("vocabularyKey", () => {
  it("treats case, accents and spaces as the same pair", () => {
    const original = vocabularyKey("  Café  ", "  maçã  ");
    expect(vocabularyKey("cafe", "maca")).toBe(original);
    expect(vocabularyKey("CAFÉ", "MAÇÃ")).toBe(original);
    expect(vocabularyKey("c a f é", "m a ç ã")).toBe(original);
  });

  it("keeps a different English or Portuguese term distinct", () => {
    const apple = vocabularyKey("apple", "maçã");
    expect(vocabularyKey("pear", "maçã")).not.toBe(apple);
    expect(vocabularyKey("apple", "pera")).not.toBe(apple);
  });

  it("ignores spaces inside a multi-word term", () => {
    expect(vocabularyKey("give up", "desistir")).toBe(
      vocabularyKey("giveup", "desistir"),
    );
  });
});
