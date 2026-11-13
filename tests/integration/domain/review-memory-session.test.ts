import { describe, expect, it } from "vitest";

import { GameSession } from "@/lib/domain/game/game-session";
import { createWord, type AttemptResult } from "@/lib/domain/game/types";
import { startOfLocalDay } from "@/lib/domain/learning/local-day";
import { applyMatchingReview } from "@/lib/domain/learning/matching-review";
import {
  scheduleReview,
  type ReviewGrade,
  type ReviewSchedule,
} from "@/lib/domain/learning/review-schedule";
import {
  ReviewSession,
  type TypingAttemptOutcome,
} from "@/lib/domain/review";
import { FakeClock } from "../../unit/domain/game/fixtures";

const at = new Date("2026-09-28T15:00:00.000Z");
const timeZone = "America/Sao_Paulo";

interface TypingInput {
  readonly attemptId: string;
  readonly wordId: string;
  readonly typedText: string | null;
  readonly usedHint?: boolean;
  readonly responseTimeMs?: number;
}

interface PlayedReview {
  readonly session: ReviewSession;
  readonly game: GameSession;
  readonly dontKnow: TypingAttemptOutcome;
  readonly missed: TypingAttemptOutcome;
  readonly hinted: TypingAttemptOutcome;
  readonly appleAgain: TypingAttemptOutcome;
  readonly castleAgain: TypingAttemptOutcome;
  readonly field: AttemptResult;
  readonly riverMiss: AttemptResult;
  readonly riverAgain: AttemptResult;
  readonly stone: AttemptResult;
  readonly cloud: AttemptResult;
  readonly market: AttemptResult;
}

function word(id: string, english = id) {
  return createWord({
    id,
    english,
    portuguese: `pt-${id}`,
    exampleSentence: `${english} in a sentence.`,
  });
}

function dueLearning(): ReviewSchedule {
  return {
    state: "LEARNING",
    repetitions: 1,
    lapses: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewAt: at,
  };
}

function reviewDue(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: at,
  };
}

function notDue(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 3,
    lapses: 0,
    intervalDays: 15,
    easeFactor: 2.5,
    nextReviewAt: startOfLocalDay(at, timeZone, 1),
  };
}

describe("in-memory review session", () => {
  it("schedules the first typing grade and the capped matching grade", () => {
    const played = playReview();

    expectTypingGrades(played);
    expectTypingSchedules(played);
    expectMatchingSchedules(played);
  });
});

function playReview(): PlayedReview {
  const clock = new FakeClock(at);
  const matching = [
    word("field", "field"),
    word("river", "river"),
    word("market", "market"),
    word("stone", "stone"),
    word("cloud", "cloud"),
  ];
  const session = startSession(matching, clock);
  const game = startGame(matching, clock);
  session.assertLinkedGame(game);
  const typing = playTyping(session, clock);
  const pairs = playMatching(game, clock);
  return { session, game, ...typing, ...pairs };
}

function startSession(matching: readonly ReturnType<typeof word>[], clock: FakeClock) {
  return ReviewSession.start(
    {
      id: "review-1",
      visitorId: "visitor-1",
      timeZone,
      gameSessionId: "game-1",
      words: [
        { word: word("apple", "apple"), stage: "TYPING", origin: "DUE" },
        { word: word("castle", "castle"), stage: "TYPING", origin: "DUE" },
        { word: word("bridge", "bridge"), stage: "TYPING", origin: "DUE" },
        { word: matching[0], stage: "MATCHING", origin: "NEW" },
        { word: matching[1], stage: "MATCHING", origin: "NEW" },
        { word: matching[2], stage: "MATCHING", origin: "DUE" },
        { word: matching[3], stage: "MATCHING", origin: "DISTRACTOR" },
        { word: matching[4], stage: "MATCHING", origin: "DISTRACTOR" },
      ],
    },
    clock,
  );
}

function startGame(matching: readonly ReturnType<typeof word>[], clock: FakeClock) {
  return GameSession.start(
    {
      id: "game-1",
      visitorId: "visitor-1",
      mode: "REVIEW",
      words: matching,
      ungradedWordIds: ["stone", "cloud"],
    },
    clock,
  );
}

function playTyping(session: ReviewSession, clock: FakeClock) {
  const dontKnow = typeWord(session, clock, {
    attemptId: "attempt-apple",
    wordId: "apple",
    typedText: null,
    responseTimeMs: 800,
  });
  const missed = typeWord(session, clock, {
    attemptId: "attempt-castle",
    wordId: "castle",
    typedText: "zzzz",
    responseTimeMs: 1_500,
  });
  const hinted = typeWord(session, clock, {
    attemptId: "attempt-bridge",
    wordId: "bridge",
    typedText: "bridge",
    usedHint: true,
    responseTimeMs: 100,
  });
  const appleAgain = typeWord(session, clock, {
    attemptId: "attempt-apple-again",
    wordId: "apple",
    typedText: "apple",
    responseTimeMs: 100,
  });
  const castleAgain = typeWord(session, clock, {
    attemptId: "attempt-castle-again",
    wordId: "castle",
    typedText: "castle",
    responseTimeMs: 100,
  });
  return { dontKnow, missed, hinted, appleAgain, castleAgain };
}

function playMatching(game: GameSession, clock: FakeClock) {
  return {
    field: recordMatch(game, clock, { promptWordId: "field", selectedWordId: "field", responseTimeMs: 400 }),
    riverMiss: recordMatch(game, clock, { promptWordId: "river", selectedWordId: "stone", responseTimeMs: 1_000 }),
    riverAgain: recordMatch(game, clock, { promptWordId: "river", selectedWordId: "river", responseTimeMs: 400 }),
    stone: recordMatch(game, clock, { promptWordId: "stone", selectedWordId: "stone", responseTimeMs: 400 }),
    cloud: recordMatch(game, clock, { promptWordId: "cloud", selectedWordId: "cloud", responseTimeMs: 400 }),
    market: recordMatch(game, clock, { promptWordId: "market", selectedWordId: "market", responseTimeMs: 400 }),
  };
}

function expectTypingGrades(played: PlayedReview): void {
  expect(played.dontKnow).toMatchObject({
    outcome: "DONT_KNOW",
    grade: "AGAIN",
    isReinforcement: false,
  });
  expect(played.missed).toMatchObject({ outcome: "WRONG", grade: "AGAIN", isReinforcement: false });
  expect(played.hinted).toMatchObject({ outcome: "CORRECT", grade: "HARD", isReinforcement: false });
  expect(played.appleAgain.grade).toBeNull();
  expect(played.castleAgain.grade).toBeNull();
  expect(played.session.stage).toBe("MATCHING");
  expect(played.session.attempts.map((attempt) => attempt.grade)).toEqual([
    "AGAIN",
    "AGAIN",
    "HARD",
    null,
    null,
  ]);
}

function expectTypingSchedules(played: PlayedReview): void {
  expect(scheduleFirstGrade(dueLearning(), played.dontKnow.grade, gradedAt(played.session, "apple"))).toEqual({
    state: "LEARNING",
    repetitions: 0,
    lapses: 0,
    intervalDays: 1,
    easeFactor: 2.3,
    nextReviewAt: startOfLocalDay(at, timeZone, 1),
  });
  expect(scheduleFirstGrade(dueLearning(), played.missed.grade, gradedAt(played.session, "castle"))).toEqual({
    state: "LEARNING",
    repetitions: 0,
    lapses: 0,
    intervalDays: 1,
    easeFactor: 2.3,
    nextReviewAt: startOfLocalDay(at, timeZone, 1),
  });
  expect(scheduleFirstGrade(dueLearning(), played.hinted.grade, gradedAt(played.session, "bridge"))).toEqual({
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.35,
    nextReviewAt: startOfLocalDay(at, timeZone, 6),
  });
}

function expectMatchingSchedules(played: PlayedReview): void {
  const { game } = played;
  expect(gradeMatching(null, played.field, game)).toEqual(
    scheduleReview(null, "GOOD", played.field.attempt.occurredAt, timeZone),
  );
  expect(gradeMatching(null, played.field, game)).not.toEqual(
    scheduleReview(null, "EASY", played.field.attempt.occurredAt, timeZone),
  );
  expect(gradeMatching(null, played.riverMiss, game)).toEqual(
    scheduleReview(null, "AGAIN", played.riverMiss.attempt.occurredAt, timeZone),
  );
  expect(gradeMatching(null, played.riverAgain, game)).toBeNull();
  expect(gradeMatching(notDue(), played.stone, game)).toBeNull();
  expect(gradeMatching(notDue(), played.cloud, game)).toBeNull();
  const marketBefore = reviewDue();
  expect(gradeMatching(marketBefore, played.market, game)).toEqual(
    scheduleReview(marketBefore, "HARD", played.market.attempt.occurredAt, timeZone),
  );
  expect(gradeMatching(marketBefore, played.market, game)).not.toEqual(
    scheduleReview(marketBefore, "EASY", played.market.attempt.occurredAt, timeZone),
  );
  expect(gradeMatching(marketBefore, played.market, game)).toMatchObject({
    state: "REVIEW",
    repetitions: 3,
    intervalDays: 7,
    easeFactor: 2.35,
  });
}

function typeWord(session: ReviewSession, clock: FakeClock, input: TypingInput) {
  return session.recordTypingAttempt(
    {
      attemptId: input.attemptId,
      wordId: input.wordId,
      typedText: input.typedText,
      usedHint: input.usedHint ?? false,
      responseTimeMs: input.responseTimeMs ?? 1_000,
    },
    clock,
  );
}

function recordMatch(
  game: GameSession,
  clock: FakeClock,
  input: { readonly promptWordId: string; readonly selectedWordId: string; readonly responseTimeMs: number },
): AttemptResult {
  return game.recordAttempt(
    {
      attemptId: `match-${input.promptWordId}-${input.selectedWordId}-${game.attempts.length}`,
      promptWordId: input.promptWordId,
      selectedWordId: input.selectedWordId,
      responseTimeMs: input.responseTimeMs,
    },
    clock,
  );
}

function scheduleFirstGrade(
  current: ReviewSchedule,
  grade: ReviewGrade | null,
  reviewedAt: Date,
): ReviewSchedule {
  if (grade === null) {
    throw new Error("Reinforcement must not schedule a review.");
  }
  return scheduleReview(current, grade, reviewedAt, timeZone);
}

function gradedAt(session: ReviewSession, wordId: string): Date {
  const attempt = session.attempts.find(
    (entry) => entry.wordId === wordId && !entry.isReinforcement,
  );
  if (!attempt) {
    throw new Error(`Missing graded attempt for ${wordId}.`);
  }
  return attempt.createdAt;
}

function gradeMatching(
  current: ReviewSchedule | null,
  result: AttemptResult,
  game: GameSession,
): ReviewSchedule | null {
  return applyMatchingReview({
    current,
    previousAttempts: game.attempts.filter(
      (attempt) => attempt.attemptId !== result.attempt.attemptId,
    ),
    result,
    timeZone,
  });
}
