import { describe, expect, it } from "vitest";

import { InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { createWord, type RandomSource, type Word } from "@/lib/domain/game/types";
import type { LearningProgressSnapshot } from "@/lib/domain/learning/types";
import { drawPracticeSelection, PRACTICE_WORD_COUNT } from "@/persistence/sqlite-word-catalog";

const EASY: LearningProgressSnapshot = Object.freeze({
  timesShown: 10,
  correctCount: 10,
  wrongCount: 0,
  totalCorrectResponseTimeMs: 10_000,
});

const NORMAL: LearningProgressSnapshot = Object.freeze({
  timesShown: 10,
  correctCount: 10,
  wrongCount: 1,
  totalCorrectResponseTimeMs: 30_000,
});

const HARD: LearningProgressSnapshot = Object.freeze({
  timesShown: 10,
  correctCount: 5,
  wrongCount: 5,
  totalCorrectResponseTimeMs: 5_000,
});

function seededRandom(seed: number): RandomSource {
  let state = seed;
  return {
    next() {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
  };
}

function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

function words(count: number, prefix: string, active = true): Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({
      id: `${prefix}-${index.toString().padStart(2, "0")}`,
      english: `${prefix} en ${index}`,
      portuguese: `${prefix} pt ${index}`,
      exampleSentence: null,
      active,
    }),
  );
}

function progressFor(
  entries: readonly (readonly [readonly Word[], LearningProgressSnapshot])[],
): Map<string, LearningProgressSnapshot> {
  const map = new Map<string, LearningProgressSnapshot>();
  for (const [group, snapshot] of entries) {
    for (const word of group) {
      map.set(word.id, snapshot);
    }
  }
  return map;
}

function ids(selection: readonly Word[]): string[] {
  return selection.map(({ id }) => id);
}

describe("practice draw over every active word", () => {
  it("draws twenty distinct active words", () => {
    const catalog = words(32, "word");
    const selection = drawPracticeSelection({
      words: catalog,
      progressByWordId: new Map(),
      random: seededRandom(7),
    });
    expect(PRACTICE_WORD_COUNT).toBe(20);
    expect(selection).toHaveLength(20);
    expect(new Set(ids(selection)).size).toBe(20);
    expect(ids(selection).every((id) => id.startsWith("word-"))).toBe(true);
  });

  it("leaves inactive words out of the draw", () => {
    const active = words(20, "active");
    const inactive = words(15, "inactive", false);
    const selection = drawPracticeSelection({
      words: [...inactive, ...active],
      progressByWordId: progressFor([[inactive, HARD]]),
      random: seededRandom(3),
    });
    expect(ids(selection).sort()).toEqual(ids(active));
  });

  it("fails with fewer than twenty active words", () => {
    const catalog = [...words(19, "active"), ...words(10, "inactive", false)];
    expect(() =>
      drawPracticeSelection({
        words: catalog,
        progressByWordId: new Map(),
        random: seededRandom(1),
      }),
    ).toThrow(InvalidWordCatalogError);
  });

  it("ranks hard before normal before easy when the random value is the same", () => {
    const easy = words(10, "easy");
    const normal = words(10, "normal");
    const hard = words(10, "hard");
    const selection = drawPracticeSelection({
      words: [...easy, ...normal, ...hard],
      progressByWordId: progressFor([
        [easy, EASY],
        [normal, NORMAL],
        [hard, HARD],
      ]),
      random: constantRandom(0.5),
    });
    expect(ids(selection).sort()).toEqual([...ids(hard), ...ids(normal)].sort());
  });

  it("treats words without progress as normal", () => {
    const easy = words(10, "easy");
    const unseen = words(10, "unseen");
    const normal = words(10, "normal");
    const selection = drawPracticeSelection({
      words: [...easy, ...unseen, ...normal],
      progressByWordId: progressFor([
        [easy, EASY],
        [normal, NORMAL],
      ]),
      random: constantRandom(0.5),
    });
    expect(ids(selection).sort()).toEqual([...ids(normal), ...ids(unseen)].sort());
  });

  it("draws hard words more often than easy ones over many sessions", () => {
    const easy = words(20, "easy");
    const hard = words(20, "hard");
    const random = seededRandom(11);
    let hardCount = 0;
    const runs = 200;
    for (let run = 0; run < runs; run += 1) {
      const selection = drawPracticeSelection({
        words: [...easy, ...hard],
        progressByWordId: progressFor([
          [easy, EASY],
          [hard, HARD],
        ]),
        random,
      });
      hardCount += selection.filter(({ id }) => id.startsWith("hard-")).length;
    }
    const hardShare = hardCount / (runs * PRACTICE_WORD_COUNT);
    expect(hardShare).toBeGreaterThan(0.75);
  });

  it("draws uniformly when the learner has no history", () => {
    const catalog = words(40, "word");
    const random = seededRandom(5);
    const counts = new Map<string, number>();
    const runs = 400;
    for (let run = 0; run < runs; run += 1) {
      for (const word of drawPracticeSelection({
        words: catalog,
        progressByWordId: new Map(),
        random,
      })) {
        counts.set(word.id, (counts.get(word.id) ?? 0) + 1);
      }
    }
    const expected = (runs * PRACTICE_WORD_COUNT) / catalog.length;
    for (const word of catalog) {
      const count = counts.get(word.id) ?? 0;
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.2);
    }
  });
});
