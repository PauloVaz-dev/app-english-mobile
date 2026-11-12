import { InvalidWordError } from "./errors";

export const MIN_SESSION_WORDS = 3;
export const MAX_SESSION_WORDS = 20;
export const SESSION_TARGET_WORDS = MAX_SESSION_WORDS;
export const BOARD_PAIR_LIMIT = 5;
export const MAX_BOARD_PAIR_LIMIT = 6;
export const MAX_RESPONSE_TIME_MS = 3_600_000;
export const GAME_SESSION_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "ABANDONED",
] as const;

export type GameSessionStatus = (typeof GAME_SESSION_STATUSES)[number];
export type FinishedGameSessionStatus = Exclude<GameSessionStatus, "ACTIVE">;
export const GAME_SESSION_MODES = ["CLASSIC", "REVIEW", "FREE"] as const;
export type GameSessionMode = (typeof GAME_SESSION_MODES)[number];
export type StartableGameSessionMode = Exclude<GameSessionMode, "CLASSIC">;

export interface Clock {
  now(): Date;
}

export interface RandomSource {
  next(): number;
}

export interface Word {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence: string | null;
  readonly active: boolean;
}

export interface CreateWordInput {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence?: string | null;
  readonly active?: boolean;
}

export function createWord(input: CreateWordInput): Word {
  const id = requireText(input.id, "id");
  const english = requireText(input.english, "english");
  const portuguese = requireText(input.portuguese, "portuguese");
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new InvalidWordError("Word active flag must be a boolean.");
  }
  return Object.freeze({
    id,
    english,
    portuguese,
    exampleSentence: normalizeExampleSentence(input.exampleSentence),
    active: input.active ?? true,
  });
}

export interface SessionWord {
  readonly word: Word;
  readonly sequence: number;
  readonly presentedAt: Date | null;
  readonly completedAt: Date | null;
  readonly graded: boolean;
}

export interface LegacySessionWord {
  readonly word: Word;
  readonly sequence: number;
  readonly presentedAt: Date | null;
  readonly completedAt: Date | null;
  readonly graded?: boolean;
}

export interface GameAttempt {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
  readonly occurredAt: Date;
}

export interface RecordAttemptInput {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly responseTimeMs: number;
  readonly revealedWordId?: string;
}

export interface GameMetrics {
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly completedWords: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly averageResponseTimeMs: number;
  readonly durationMs: number;
}

export interface GameResult extends GameMetrics {
  readonly status: FinishedGameSessionStatus;
  readonly finishedAt: Date;
}

export interface RevealedExposureView {
  readonly wordId: string;
  readonly elapsedBeforeHydrationMs: number;
}

export interface AttemptResult {
  readonly attempt: GameAttempt;
  readonly isCorrect: boolean;
  readonly completedWordId: string | null;
  readonly revealedExposure: RevealedExposureView | null;
  readonly metrics: GameMetrics;
  readonly result: GameResult | null;
}

export interface SessionExposure {
  readonly wordId: string;
  readonly presentedAt: Date;
  readonly isNew: boolean;
}

export interface GameSessionSnapshot {
  readonly id: string;
  readonly visitorId: string;
  readonly mode: GameSessionMode;
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly words: readonly SessionWord[];
  readonly attempts: readonly GameAttempt[];
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface LegacyGameSessionSnapshot {
  readonly id: string;
  readonly visitorId: string;
  readonly mode?: GameSessionMode;
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly words: readonly LegacySessionWord[];
  readonly attempts: readonly GameAttempt[];
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidWordError(`Word ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeExampleSentence(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new InvalidWordError("Word example sentence must be a string or null.");
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
