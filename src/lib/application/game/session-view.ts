import type { GameSession } from "@/lib/domain/game/game-session";
import type { Clock, GameSessionStatus } from "@/lib/domain/game/types";
import type { Difficulty } from "@/lib/domain/learning/types";

export interface ReviewWordView {
  readonly wordId: string;
  readonly english: string;
  readonly portuguese: string;
  readonly wrongAnswers: number;
  readonly timeToCorrectMs: number | null;
  readonly difficulty: Difficulty | null;
}

export interface SessionResultLists {
  readonly reviewWords: readonly ReviewWordView[];
  readonly praiseWords: readonly ReviewWordView[];
}

export const EMPTY_SESSION_RESULT_LISTS: SessionResultLists = Object.freeze({
  reviewWords: [],
  praiseWords: [],
});

export interface SessionWordView {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
  readonly sequence: number;
  readonly completedAt: string | null;
  readonly exampleSentence: string | null;
}

export interface SessionView {
  readonly sessionId: string;
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly completedWords: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly averageResponseTimeMs: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly words: readonly SessionWordView[];
  readonly reviewWords: readonly ReviewWordView[];
  readonly praiseWords: readonly ReviewWordView[];
}

export function toSessionView(
  session: GameSession,
  clock: Clock,
  lists: SessionResultLists = EMPTY_SESSION_RESULT_LISTS,
): SessionView {
  const metrics = session.metrics(clock);
  return {
    sessionId: session.id,
    status: session.status,
    targetWords: session.targetWords,
    completedWords: metrics.completedWords,
    correctAnswers: metrics.correctAnswers,
    wrongAnswers: metrics.wrongAnswers,
    accuracy: metrics.accuracy,
    averageResponseTimeMs: metrics.averageResponseTimeMs,
    durationMs: metrics.durationMs,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
    words: session.words.map(({ word, sequence, completedAt }) => ({
      id: word.id,
      english: word.english,
      portuguese: word.portuguese,
      sequence,
      completedAt: completedAt?.toISOString() ?? null,
      exampleSentence: word.exampleSentence,
    })),
    reviewWords: lists.reviewWords,
    praiseWords: lists.praiseWords,
  };
}
