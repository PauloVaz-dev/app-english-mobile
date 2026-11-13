import type { DailyReviewSummary } from "@/lib/application/review/ports/daily-review-reader";
import type { GameSession } from "@/lib/domain/game/game-session";
import { SLOW_REVIEW_RESPONSE_TIME_MS } from "@/lib/domain/learning/review-priority";
import type { ReviewSession } from "@/lib/domain/review";

import type { ReviewResultWordView, ReviewSessionResultView } from "./review-session-view";

export function buildReviewResult(input: {
  readonly session: ReviewSession;
  readonly summary: DailyReviewSummary;
  readonly game: GameSession | null;
}): ReviewSessionResultView {
  const typing = scoreTyping(input.session);
  const matching = scoreMatching(input.session, input.game);
  return {
    status: input.session.status === "ABANDONED" ? "ABANDONED" : "COMPLETED",
    correctAnswers: typing.correctAnswers + matching.correctAnswers,
    wrongAnswers: typing.wrongAnswers + matching.wrongAnswers,
    reviewWords: mergeWords([...typing.reviewWords, ...matching.reviewWords]),
    remainingDueToday: input.summary.dueCount,
    nextReviewAt: input.summary.nextReviewAt?.toISOString() ?? null,
    pendingReview: input.summary.dueCount > 0 || input.summary.newAvailable > 0,
    timeZone: input.session.timeZone,
  };
}

function scoreTyping(session: ReviewSession): Score {
  let correctAnswers = 0;
  let wrongAnswers = 0;
  const reviewWords: ReviewResultWordView[] = [];
  for (const attempt of session.attempts) {
    if (attempt.isReinforcement) continue;
    if (attempt.outcome === "CORRECT" || attempt.outcome === "ALMOST") {
      correctAnswers += 1;
    } else {
      wrongAnswers += 1;
    }
    if (attempt.grade !== "AGAIN") continue;
    const entry = session.words.find((word) => word.word.id === attempt.wordId);
    if (!entry) continue;
    reviewWords.push(wordView(entry.word.id, entry.word.english, entry.word.portuguese));
  }
  return { correctAnswers, wrongAnswers, reviewWords };
}

function scoreMatching(session: ReviewSession, game: GameSession | null): Score {
  if (!game) return { correctAnswers: 0, wrongAnswers: 0, reviewWords: [] };
  const reviewWords: ReviewResultWordView[] = [];
  for (const entry of game.words) {
    if (!entry.graded) continue;
    if (isDistractor(session, entry.word.id)) continue;
    const attempts = game.attempts.filter((attempt) => attempt.promptWordId === entry.word.id);
    const misses = attempts.filter((attempt) => !attempt.isCorrect).length;
    const correct = attempts.find((attempt) => attempt.isCorrect);
    const slow =
      correct !== undefined && correct.responseTimeMs > SLOW_REVIEW_RESPONSE_TIME_MS;
    if (misses === 0 && !slow) continue;
    reviewWords.push(wordView(entry.word.id, entry.word.english, entry.word.portuguese));
  }
  return {
    correctAnswers: game.correctAnswers,
    wrongAnswers: game.wrongAnswers,
    reviewWords,
  };
}

function isDistractor(session: ReviewSession, wordId: string): boolean {
  return session.words.some((entry) => entry.word.id === wordId && entry.origin === "DISTRACTOR");
}

function mergeWords(words: readonly ReviewResultWordView[]): readonly ReviewResultWordView[] {
  const seen = new Set<string>();
  const merged: ReviewResultWordView[] = [];
  for (const word of words) {
    if (seen.has(word.wordId)) continue;
    seen.add(word.wordId);
    merged.push(word);
  }
  return merged;
}

function wordView(wordId: string, english: string, portuguese: string): ReviewResultWordView {
  return { wordId, english, portuguese };
}

interface Score {
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly reviewWords: readonly ReviewResultWordView[];
}
