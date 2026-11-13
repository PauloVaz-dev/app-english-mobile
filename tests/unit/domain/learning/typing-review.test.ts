import { describe, expect, it } from "vitest";

import { gradeTypingAnswer } from "@/lib/domain/learning/typing-review";

describe("gradeTypingAnswer", () => {
  it.each([
    { outcome: "WRONG" as const, usedHint: false, responseTimeMs: 500 },
    { outcome: "WRONG" as const, usedHint: true, responseTimeMs: 1_000 },
    { outcome: "DONT_KNOW" as const, usedHint: false, responseTimeMs: 800 },
    { outcome: "DONT_KNOW" as const, usedHint: true, responseTimeMs: 8_000 },
  ])(
    "grades $outcome as AGAIN",
    ({ outcome, usedHint, responseTimeMs }) => {
      expect(
        gradeTypingAnswer({ outcome, usedHint, responseTimeMs }),
      ).toBe("AGAIN");
    },
  );

  it.each([
    { usedHint: false, responseTimeMs: 400 },
    { usedHint: true, responseTimeMs: 400 },
    { usedHint: false, responseTimeMs: 6_000 },
  ])("grades ALMOST as HARD", ({ usedHint, responseTimeMs }) => {
    expect(
      gradeTypingAnswer({ outcome: "ALMOST", usedHint, responseTimeMs }),
    ).toBe("HARD");
  });

  it.each([
    { responseTimeMs: 1_999, expected: "EASY" },
    { responseTimeMs: 2_000, expected: "GOOD" },
    { responseTimeMs: 5_000, expected: "GOOD" },
    { responseTimeMs: 5_001, expected: "HARD" },
  ])(
    "grades a correct answer in $responseTimeMs ms as $expected",
    ({ responseTimeMs, expected }) => {
      expect(
        gradeTypingAnswer({
          outcome: "CORRECT",
          usedHint: false,
          responseTimeMs,
        }),
      ).toBe(expected);
    },
  );

  it.each([1_999, 2_000, 5_000, 5_001])(
    "caps a correct answer after a hint at HARD (%s ms)",
    (responseTimeMs) => {
      expect(
        gradeTypingAnswer({
          outcome: "CORRECT",
          usedHint: true,
          responseTimeMs,
        }),
      ).toBe("HARD");
    },
  );
});
