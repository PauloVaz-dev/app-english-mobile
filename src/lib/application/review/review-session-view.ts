import { toSessionView, type SessionView } from "@/lib/application/game/session-view";
import type { DailyReviewSummary } from "@/lib/application/review/ports/daily-review-reader";
import type { GameSession } from "@/lib/domain/game/game-session";
import type { ReviewSession, ReviewStage } from "@/lib/domain/review";

import { buildReviewResult } from "./build-review-result";

export interface ReviewTypingPrompt {
  readonly wordId: string;
  readonly portuguese: string;
  readonly firstLetter: string;
}

export function firstLetterOf(english: string): string {
  const [letter] = Array.from(english.trim());
  return letter ?? "";
}

export interface ReviewResultWordView {
  readonly wordId: string;
  readonly english: string;
  readonly portuguese: string;
}

export interface ReviewSessionResultView {
  readonly status: "COMPLETED" | "ABANDONED";
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly reviewWords: readonly ReviewResultWordView[];
  readonly remainingDueToday: number;
  readonly nextReviewAt: string | null;
  readonly pendingReview: boolean;
  readonly timeZone: string;
}

export interface ReviewSessionView {
  readonly id: string;
  readonly stage: ReviewStage;
  readonly typing: {
    readonly current: ReviewTypingPrompt | null;
    readonly remaining: number;
    readonly reinforcement: boolean;
  };
  readonly gameSessionId: string | null;
  readonly matchingSession: SessionView | null;
  readonly result: ReviewSessionResultView | null;
}

export function toReviewSessionView(
  session: ReviewSession,
  summary: DailyReviewSummary | null,
  game: GameSession | null = null,
  now: Date = new Date(),
): ReviewSessionView {
  const finished = session.status !== "ACTIVE";
  const prompt = finished ? null : session.currentTyping;
  const currentWord = prompt
    ? session.words.find((entry) => entry.word.id === prompt.wordId)
    : undefined;
  const stage = finished ? "DONE" : session.stage;
  const result =
    finished && summary ? buildReviewResult({ session, summary, game }) : null;
  const matchingSession =
    stage === "MATCHING" && game ? toSessionView(game, { now: () => now }) : null;
  return {
    id: session.id,
    stage,
    typing: {
      current:
        prompt && currentWord
          ? {
              wordId: prompt.wordId,
              portuguese: currentWord.word.portuguese,
              firstLetter: firstLetterOf(currentWord.word.english),
            }
          : null,
      remaining: finished ? 0 : session.typingRemaining,
      reinforcement: prompt?.reinforcement ?? false,
    },
    gameSessionId: session.gameSessionId,
    matchingSession,
    result,
  };
}
