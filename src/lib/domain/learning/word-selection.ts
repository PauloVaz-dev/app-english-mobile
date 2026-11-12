import type { RandomSource, Word } from "@/lib/domain/game/types";

import { InvalidWordSelectionError, NotEnoughStudiedWordsError } from "./errors";
import { isReviewDue, REVIEW_STATES, type ReviewSchedule } from "./review-schedule";
import { selectWeightedWords } from "./selection-weights";
import type { LearningProgressSnapshot } from "./types";

export const FREE_PRACTICE_WORD_LIMIT = 20;
export const FREE_PRACTICE_MINIMUM_WORDS = 3;
export const MATCHING_PAIR_MINIMUM = 3;

export interface ScheduledWordRef {
  readonly wordId: string;
  readonly schedule: ReviewSchedule;
}

export interface FreePracticeSelectionInput {
  readonly words: readonly Word[];
  readonly progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  readonly scheduleByWordId: ReadonlyMap<string, ReviewSchedule>;
  readonly random: RandomSource;
}

export interface ChallengeSelectionInput {
  readonly words: readonly Word[];
  readonly progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  readonly scheduleByWordId: ReadonlyMap<string, ReviewSchedule>;
  readonly limit: number;
  readonly now: Date;
  readonly random: RandomSource;
}

export interface DistractorSelectionInput {
  readonly matchingWordIds: readonly string[];
  readonly reservedWordIds: readonly string[];
  readonly studied: readonly ScheduledWordRef[];
  readonly now: Date;
}

interface StudiedPools {
  readonly notDue: readonly Word[];
  readonly due: readonly Word[];
}

export function selectFreePracticeWords(input: FreePracticeSelectionInput): readonly Word[] {
  const studied = sortWordsById(
    input.words.filter((word) => readActiveSchedule(word, input.scheduleByWordId) !== null),
  );
  if (studied.length < FREE_PRACTICE_MINIMUM_WORDS) {
    throw new NotEnoughStudiedWordsError(studied.length, FREE_PRACTICE_MINIMUM_WORDS);
  }
  const limit = Math.min(FREE_PRACTICE_WORD_LIMIT, studied.length);
  return drawWeighted({
    words: studied,
    progressByWordId: input.progressByWordId,
    random: input.random,
    limit,
  });
}

export function selectDistractorWordIds(input: DistractorSelectionInput): readonly string[] {
  const now = requireInstant(input.now);
  requireDistinctWordIds(input.matchingWordIds, "matching word");
  requireDistinctWordIds(input.reservedWordIds, "reserved word");
  requireDistinctWordIds(
    input.studied.map((item) => item.wordId),
    "studied word",
  );
  const matchingCount = input.matchingWordIds.length;
  if (matchingCount === 0 || matchingCount >= MATCHING_PAIR_MINIMUM) {
    return Object.freeze([]);
  }
  const reserved = new Set([...input.matchingWordIds, ...input.reservedWordIds]);
  const needed = MATCHING_PAIR_MINIMUM - matchingCount;
  const candidates = input.studied
    .filter((item) => !reserved.has(item.wordId) && isUpcoming(item, now))
    .sort(compareUpcoming);
  return Object.freeze(candidates.slice(0, needed).map((item) => item.wordId));
}

export function selectChallengeWords(input: ChallengeSelectionInput): readonly Word[] {
  const limit = requireDrawLimit(input.limit);
  const now = requireInstant(input.now);
  const pools = splitStudiedWords(input.words, input.scheduleByWordId, now);
  const studiedCount = pools.notDue.length + pools.due.length;
  if (studiedCount < limit) {
    throw new InvalidWordSelectionError(
      `Studied words available: ${studiedCount}; challenge requested ${limit}.`,
    );
  }
  if (pools.notDue.length >= limit) {
    return drawWeighted({
      words: pools.notDue,
      progressByWordId: input.progressByWordId,
      random: input.random,
      limit,
    });
  }
  const dueDraw = drawWeighted({
    words: pools.due,
    progressByWordId: input.progressByWordId,
    random: input.random,
    limit: limit - pools.notDue.length,
  });
  return Object.freeze([...pools.notDue, ...dueDraw]);
}

function splitStudiedWords(
  words: readonly Word[],
  scheduleByWordId: ReadonlyMap<string, ReviewSchedule>,
  now: Date,
): StudiedPools {
  const notDue: Word[] = [];
  const due: Word[] = [];
  for (const word of words) {
    const schedule = readActiveSchedule(word, scheduleByWordId);
    if (schedule === null) {
      continue;
    }
    if (isReviewDue(schedule, now)) {
      due.push(word);
      continue;
    }
    notDue.push(word);
  }
  return {
    notDue: sortWordsById(notDue),
    due: sortWordsById(due),
  };
}

function readActiveSchedule(
  word: Word,
  scheduleByWordId: ReadonlyMap<string, ReviewSchedule>,
): ReviewSchedule | null {
  if (!word.active) {
    return null;
  }
  const schedule = scheduleByWordId.get(word.id);
  if (schedule === undefined) {
    return null;
  }
  return requireSchedule(schedule, word.id);
}

function isUpcoming(item: ScheduledWordRef, now: Date): boolean {
  const schedule = requireSchedule(item.schedule, item.wordId);
  return !isReviewDue(schedule, now);
}

function drawWeighted(input: {
  readonly words: readonly Word[];
  readonly progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  readonly random: RandomSource;
  readonly limit: number;
}): readonly Word[] {
  return selectWeightedWords(input);
}

function compareUpcoming(left: ScheduledWordRef, right: ScheduledWordRef): number {
  const timeDelta = left.schedule.nextReviewAt.getTime() - right.schedule.nextReviewAt.getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }
  if (left.wordId < right.wordId) {
    return -1;
  }
  return left.wordId > right.wordId ? 1 : 0;
}

function sortWordsById(words: readonly Word[]): Word[] {
  return [...words].sort((left, right) => compareText(left.id, right.id));
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function requireSchedule(schedule: ReviewSchedule, wordId: string): ReviewSchedule {
  if (!REVIEW_STATES.includes(schedule.state)) {
    throw new InvalidWordSelectionError(`Word ${wordId} has an unknown review state.`);
  }
  if (!(schedule.nextReviewAt instanceof Date) || Number.isNaN(schedule.nextReviewAt.getTime())) {
    throw new InvalidWordSelectionError(`Word ${wordId} has an invalid review date.`);
  }
  return schedule;
}

function requireDistinctWordIds(wordIds: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const wordId of wordIds) {
    if (typeof wordId !== "string" || wordId.length === 0) {
      throw new InvalidWordSelectionError(`${label} must be a non-empty word id.`);
    }
    if (seen.has(wordId)) {
      throw new InvalidWordSelectionError(`Duplicate ${label}: ${wordId}.`);
    }
    seen.add(wordId);
  }
}

function requireDrawLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidWordSelectionError("Draw limit must be a positive integer.");
  }
  return value;
}

function requireInstant(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidWordSelectionError("Current instant must be a valid date.");
  }
  return value;
}
