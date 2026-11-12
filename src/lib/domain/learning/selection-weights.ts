import type { RandomSource, Word } from "@/lib/domain/game/types";

import { classifyDifficulty } from "./difficulty-policy";
import { InvalidWeightedSelectionError } from "./errors";
import { DIFFICULTIES, type Difficulty, type LearningProgressSnapshot } from "./types";

export const DIFFICULTY_WEIGHTS = { EASY: 1, NORMAL: 3, HARD: 6 } as const;
export const UNCLASSIFIED_WEIGHT = 3;
const MIN_RANDOM_UNIT = Number.MIN_VALUE;

interface SamplingRank {
  readonly word: Word;
  readonly key: number;
}

export function resolveSelectionWeight(difficulty: Difficulty | null): number {
  if (difficulty === null) {
    return UNCLASSIFIED_WEIGHT;
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new InvalidWeightedSelectionError("Invalid difficulty weight.");
  }
  return DIFFICULTY_WEIGHTS[difficulty];
}

export function selectWeightedWords(input: {
  words: readonly Word[];
  progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  limit: number;
  random: RandomSource;
}): readonly Word[] {
  const limit = requirePositiveInteger(input.limit);
  const words = requireDistinctWords(input.words);
  if (words.length < limit) {
    throw new InvalidWeightedSelectionError(
      `Catalog has ${words.length} words, but ${limit} were requested.`,
    );
  }
  const ranked = words
    .map((word) => rankSelectableWord(word, input.progressByWordId, input.random))
    .sort(compareSamplingRank);
  return Object.freeze(ranked.slice(0, limit).map(({ word }) => word));
}

function rankSelectableWord(
  word: Word,
  progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>,
  random: RandomSource,
): SamplingRank {
  const weight = resolveProgressWeight(progressByWordId.get(word.id));
  const unit = readUnitInterval(random);
  return { word, key: Math.log(unit) / weight };
}

function resolveProgressWeight(snapshot: LearningProgressSnapshot | undefined): number {
  if (snapshot === undefined) {
    return UNCLASSIFIED_WEIGHT;
  }
  return resolveSelectionWeight(classifyDifficulty(snapshot));
}

function readUnitInterval(random: RandomSource): number {
  const value = random.next();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new InvalidWeightedSelectionError(
      `Random source must return a value from 0 (inclusive) to 1 (exclusive); received ${value}.`,
    );
  }
  return value === 0 ? MIN_RANDOM_UNIT : value;
}

function compareSamplingRank(left: SamplingRank, right: SamplingRank): number {
  if (left.key !== right.key) {
    return right.key - left.key;
  }
  if (left.word.id < right.word.id) {
    return -1;
  }
  return left.word.id > right.word.id ? 1 : 0;
}

function requireDistinctWords(words: readonly Word[]): readonly Word[] {
  const ids = new Set<string>();
  for (const word of words) {
    if (ids.has(word.id)) {
      throw new InvalidWeightedSelectionError(`Duplicate catalog word: ${word.id}.`);
    }
    ids.add(word.id);
  }
  return words;
}

function requirePositiveInteger(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidWeightedSelectionError("Draw limit must be a positive integer.");
  }
  return value;
}
