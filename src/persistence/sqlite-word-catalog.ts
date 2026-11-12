import { InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { type Clock, type RandomSource, type Word, createWord } from "@/lib/domain/game/types";
import { InvalidReviewScheduleError } from "@/lib/domain/learning/errors";
import { createLearningProgressSnapshot } from "@/lib/domain/learning/progress-metrics";
import {
  REVIEW_STATES,
  type ReviewSchedule,
  type ReviewState,
} from "@/lib/domain/learning/review-schedule";
import { selectWeightedWords } from "@/lib/domain/learning/selection-weights";
import type { LearningProgressSnapshot } from "@/lib/domain/learning/types";
import {
  FREE_PRACTICE_WORD_LIMIT,
  selectChallengeWords,
} from "@/lib/domain/learning/word-selection";
import type { SqlExecutor } from "@/persistence/sql-executor";

const ACTIVE_WORD = 1;

export const PRACTICE_WORD_COUNT = FREE_PRACTICE_WORD_LIMIT;

const ACTIVE_WORDS_WITH_PROGRESS = `
SELECT w."id", w."english", w."portuguese", w."exampleSentence",
       p."visitorId" AS "progressVisitorId", p."timesShown", p."correctCount",
       p."wrongCount", p."totalCorrectResponseTimeMs", p."nextReviewAt",
       p."reviewRepetitions", p."reviewLapses", p."reviewIntervalDays",
       p."reviewEaseFactor", p."reviewState"
FROM "Word" AS w
LEFT JOIN "LearnerWordProgress" AS p
  ON p."wordId" = w."id" AND p."visitorId" = ?
WHERE w."active" = ?
ORDER BY w."id" ASC
`;

export interface DrawChallengeWordsInput {
  readonly limit: number;
  readonly visitorId: string;
}

export interface DrawPracticeWordsInput {
  readonly visitorId: string;
}

export interface PracticeDrawContext {
  readonly words: readonly Word[];
  readonly progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  readonly random: RandomSource;
}

export interface StudiedDrawContext {
  readonly words: readonly Word[];
  readonly progressByWordId: ReadonlyMap<string, LearningProgressSnapshot>;
  readonly scheduleByWordId: ReadonlyMap<string, ReviewSchedule>;
  readonly random: RandomSource;
}

export class SqliteWordCatalog {
  private readonly executor: SqlExecutor;
  private readonly random: RandomSource;
  private readonly clock: Clock;

  constructor(executor: SqlExecutor, random: RandomSource, clock: Clock) {
    this.executor = executor;
    this.random = random;
    this.clock = clock;
  }

  async drawChallengeWords(input: DrawChallengeWordsInput): Promise<Word[]> {
    const loaded = await this.loadActiveWords(input.visitorId);
    return drawChallengeSelection({
      ...loaded,
      limit: input.limit,
      now: this.clock.now(),
      random: this.random,
    });
  }

  async drawPracticeWords(input: DrawPracticeWordsInput): Promise<Word[]> {
    const loaded = await this.loadActiveWords(input.visitorId);
    return drawPracticeSelection({ ...loaded, random: this.random });
  }

  private async loadActiveWords(visitorId: string): Promise<Omit<StudiedDrawContext, "random">> {
    const rows = await this.executor.getAll<ActiveWordRow>(ACTIVE_WORDS_WITH_PROGRESS, [
      visitorId,
      ACTIVE_WORD,
    ]);
    const progressByWordId = new Map<string, LearningProgressSnapshot>();
    const scheduleByWordId = new Map<string, ReviewSchedule>();
    const words = rows.map((row) => {
      const word = toWord(row);
      if (row.progressVisitorId !== null) {
        progressByWordId.set(word.id, toProgressSnapshot(row));
        const schedule = toReviewSchedule(row);
        if (schedule !== null) {
          scheduleByWordId.set(word.id, schedule);
        }
      }
      return word;
    });
    return { words, progressByWordId, scheduleByWordId };
  }
}

/**
 * The free practice draws over every active word, studied or not, weighted by
 * the learner's own difficulty (easy 1, normal 3, hard 6). Without history the
 * draw is uniform. It needs twenty active words and never draws fewer.
 */
export function drawPracticeSelection(context: PracticeDrawContext): Word[] {
  const active = context.words.filter((word) => word.active);
  if (active.length < PRACTICE_WORD_COUNT) {
    throw new InvalidWordCatalogError(
      `Catalog has ${active.length} active words, but ${PRACTICE_WORD_COUNT} are required.`,
    );
  }
  return [
    ...selectWeightedWords({
      words: active,
      progressByWordId: context.progressByWordId,
      limit: PRACTICE_WORD_COUNT,
      random: context.random,
    }),
  ];
}

/**
 * Studied words keep the site's challenge selection and come first. When they
 * do not fill the limit, unstudied active words complete the draw, so the
 * challenge works before the daily review has scheduled anything. It only
 * fails when no active word exists.
 */
export function drawChallengeSelection(
  context: StudiedDrawContext & {
    readonly limit: number;
    readonly now: Date;
  },
): Word[] {
  const limit = requirePositiveDrawLimit(context.limit);
  const active = context.words.filter((word) => word.active);
  if (active.length < 1) {
    throw new InvalidWordCatalogError(`Catalog has no active words, but ${limit} were requested.`);
  }
  const studiedCount = countStudiedWords(active, context.scheduleByWordId);
  const studied =
    studiedCount < 1
      ? []
      : selectChallengeWords({
          words: active,
          progressByWordId: context.progressByWordId,
          scheduleByWordId: context.scheduleByWordId,
          limit: Math.min(limit, studiedCount),
          now: context.now,
          random: context.random,
        });
  const unstudied = active.filter((word) => !context.scheduleByWordId.has(word.id));
  const fill = shuffleWords(unstudied, context.random).slice(0, limit - studied.length);
  return [...studied, ...fill];
}

function shuffleWords(words: readonly Word[], random: RandomSource): Word[] {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function countStudiedWords(
  words: readonly Word[],
  scheduleByWordId: ReadonlyMap<string, ReviewSchedule>,
): number {
  let studiedCount = 0;
  for (const word of words) {
    if (word.active && scheduleByWordId.has(word.id)) {
      studiedCount += 1;
    }
  }
  return studiedCount;
}

function requirePositiveDrawLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new InvalidWordCatalogError("Draw limit must be a positive integer.");
  }
  return limit;
}

interface ActiveWordRow {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  progressVisitorId: string | null;
  timesShown: number;
  correctCount: number;
  wrongCount: number;
  totalCorrectResponseTimeMs: number;
  nextReviewAt: string | null;
  reviewRepetitions: number;
  reviewLapses: number;
  reviewIntervalDays: number;
  reviewEaseFactor: number;
  reviewState: string;
}

function toWord(row: ActiveWordRow): Word {
  return createWord({
    id: row.id,
    english: row.english,
    portuguese: row.portuguese,
    exampleSentence: row.exampleSentence,
    active: true,
  });
}

function toProgressSnapshot(row: ActiveWordRow): LearningProgressSnapshot {
  return createLearningProgressSnapshot({
    timesShown: Number(row.timesShown),
    correctCount: Number(row.correctCount),
    wrongCount: Number(row.wrongCount),
    totalCorrectResponseTimeMs: Number(row.totalCorrectResponseTimeMs),
  });
}

function toReviewSchedule(row: ActiveWordRow): ReviewSchedule | null {
  if (row.nextReviewAt === null) {
    return null;
  }
  return Object.freeze({
    state: toReviewState(row.reviewState),
    repetitions: Number(row.reviewRepetitions),
    lapses: Number(row.reviewLapses),
    intervalDays: Number(row.reviewIntervalDays),
    easeFactor: Number(row.reviewEaseFactor),
    nextReviewAt: new Date(row.nextReviewAt),
  });
}

function toReviewState(value: string): ReviewState {
  const state = REVIEW_STATES.find((candidate) => candidate === value);
  if (state === undefined) {
    throw new InvalidReviewScheduleError(`Unknown review state: ${value}.`);
  }
  return state;
}
