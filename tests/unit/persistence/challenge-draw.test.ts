import { describe, expect, it } from "vitest";

import { InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { createWord, type RandomSource, type Word } from "@/lib/domain/game/types";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { drawChallengeSelection } from "@/persistence/sqlite-word-catalog";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const NOT_DUE_AT = new Date("2026-11-20T12:00:00.000Z");

function fixedRandom(): RandomSource {
  let state = 7;
  return {
    next() {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
  };
}

function words(count: number, prefix: string): Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({
      id: `${prefix}-${index}`,
      english: `${prefix} en ${index}`,
      portuguese: `${prefix} pt ${index}`,
      exampleSentence: null,
      active: true,
    }),
  );
}

function schedules(studied: readonly Word[]): Map<string, ReviewSchedule> {
  return new Map(
    studied.map((word) => [
      word.id,
      Object.freeze({
        state: "REVIEW",
        repetitions: 2,
        lapses: 0,
        intervalDays: 6,
        easeFactor: 2.5,
        nextReviewAt: NOT_DUE_AT,
      }) as ReviewSchedule,
    ]),
  );
}

function draw(all: readonly Word[], studied: readonly Word[], limit: number): Word[] {
  return drawChallengeSelection({
    words: all,
    progressByWordId: new Map(),
    scheduleByWordId: schedules(studied),
    random: fixedRandom(),
    limit,
    now: NOW,
  });
}

describe("challenge draw over active words", () => {
  it("draws unstudied active words when nothing was studied yet", () => {
    const fresh = words(10, "fresh");
    const drawn = draw(fresh, [], 4);
    expect(drawn).toHaveLength(4);
    expect(new Set(drawn.map(({ id }) => id)).size).toBe(4);
    for (const word of drawn) {
      expect(fresh.map(({ id }) => id)).toContain(word.id);
    }
  });

  it("puts every studied word first and fills the rest with unstudied words", () => {
    const studied = words(3, "studied");
    const fresh = words(10, "fresh");
    const drawn = draw([...fresh, ...studied], studied, 6);
    expect(drawn).toHaveLength(6);
    expect(
      drawn
        .slice(0, 3)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(studied.map(({ id }) => id).sort());
    for (const word of drawn.slice(3)) {
      expect(word.id.startsWith("fresh-")).toBe(true);
    }
    expect(new Set(drawn.map(({ id }) => id)).size).toBe(6);
  });

  it("uses only studied words when they already fill the limit", () => {
    const studied = words(8, "studied");
    const fresh = words(5, "fresh");
    const drawn = draw([...fresh, ...studied], studied, 5);
    expect(drawn).toHaveLength(5);
    for (const word of drawn) {
      expect(word.id.startsWith("studied-")).toBe(true);
    }
  });

  it("returns every active word when the catalog is smaller than the limit", () => {
    const studied = words(2, "studied");
    const fresh = words(3, "fresh");
    expect(draw([...fresh, ...studied], studied, 40)).toHaveLength(5);
  });

  it("fails only when there is no active word", () => {
    expect(() => draw([], [], 40)).toThrow(InvalidWordCatalogError);
  });
});
