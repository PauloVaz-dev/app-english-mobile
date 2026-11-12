import type { SessionResultLists } from "@/lib/application/game/session-view";
import { classifyDifficulty } from "@/lib/domain/learning/difficulty-policy";
import { selectPraisePriority } from "@/lib/domain/learning/praise-priority";
import { selectReviewPriority } from "@/lib/domain/learning/review-priority";
import type { LearningProgressSnapshot } from "@/lib/domain/learning/types";

export interface SessionReviewWordFact {
  readonly wordId: string;
  readonly english: string;
  readonly portuguese: string;
}

export interface SessionReviewAttemptFact {
  readonly promptWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export interface BuildSessionReviewInput {
  readonly words: readonly SessionReviewWordFact[];
  readonly attempts: readonly SessionReviewAttemptFact[];
  readonly progressByWordId: ReadonlyMap<
    string,
    LearningProgressSnapshot | null | undefined
  >;
}

export function buildSessionReview(
  input: BuildSessionReviewInput,
): SessionResultLists {
  const candidates = input.words.map((word) => {
    const wordAttempts = input.attempts.filter(
      (attempt) => attempt.promptWordId === word.wordId,
    );
    const wrongAnswers = wordAttempts.filter(
      (attempt) => !attempt.isCorrect,
    ).length;
    const correctAttempt = wordAttempts.find((attempt) => attempt.isCorrect);
    const progress = input.progressByWordId.get(word.wordId) ?? null;
    return {
      wordId: word.wordId,
      english: word.english,
      portuguese: word.portuguese,
      wrongAnswers,
      timeToCorrectMs: correctAttempt?.responseTimeMs ?? null,
      difficulty: progress ? classifyDifficulty(progress) : null,
    };
  });
  return {
    reviewWords: selectReviewPriority(candidates),
    praiseWords: selectPraisePriority(candidates),
  };
}
