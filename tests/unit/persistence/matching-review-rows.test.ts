import { describe, expect, it } from "vitest";

import { GameSession } from "@/lib/domain/game/game-session";
import type { Clock } from "@/lib/domain/game/types";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { scheduleReview } from "@/lib/domain/learning/review-schedule";
import {
  type GameAnswerRow,
  type GameSessionRow,
  type GameSessionWordRow,
  type StoredGameSessionRows,
  scheduleMatchingAttempt,
  toGameSessionSnapshot,
} from "@/persistence/sqlite-game-session-repository";

const STARTED_AT = "2026-11-12T15:00:00.000Z";
const TIME_ZONE = "America/New_York";
const FAST_RESPONSE_MS = 400;
const ONE_SECOND_MS = 1_000;
const GRADED_WORD = 1;
const UNGRADED_WORD = 0;
const ACTIVE_WORD = 1;

class ManualClock implements Clock {
  private instant: Date;

  constructor(start: string) {
    this.instant = new Date(start);
  }

  now(): Date {
    return new Date(this.instant);
  }

  advance(milliseconds: number): void {
    this.instant = new Date(this.instant.getTime() + milliseconds);
  }
}

function sessionRow(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: "game-1",
    visitorId: "visitor-1",
    mode: "REVIEW",
    status: "ACTIVE",
    targetWords: 2,
    correctAnswers: 0,
    wrongAnswers: 0,
    startedAt: STARTED_AT,
    finishedAt: null,
    durationMs: null,
    ...overrides,
  };
}

function wordRow(
  wordId: string,
  sequence: number,
  graded: number,
): GameSessionWordRow {
  return {
    wordId,
    sequence,
    presentedAt: null,
    completedAt: null,
    graded,
    english: wordId,
    portuguese: wordId,
    exampleSentence: null,
    active: ACTIVE_WORD,
  };
}

function dueSchedule(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: new Date(STARTED_AT),
  };
}

function restore(rows: StoredGameSessionRows): GameSession {
  return GameSession.restore(toGameSessionSnapshot(rows));
}

describe("matching grade from session rows", () => {
  it("caps a fast graded match at good when pairs remain", () => {
    const session = restore({
      session: sessionRow(),
      words: [wordRow("river", 0, GRADED_WORD), wordRow("stone", 1, GRADED_WORD)],
      answers: [],
    });
    const clock = new ManualClock(STARTED_AT);
    clock.advance(ONE_SECOND_MS);
    const reviewedAt = clock.now();
    const result = session.recordAttempt(
      {
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );
    const current = dueSchedule();

    expect(
      scheduleMatchingAttempt({
        session,
        result,
        current,
        timeZone: TIME_ZONE,
      }),
    ).toEqual(scheduleReview(current, "GOOD", reviewedAt, TIME_ZONE));
  });

  it("caps the last pair at hard", () => {
    const session = restore({
      session: sessionRow({ targetWords: 1 }),
      words: [wordRow("river", 0, GRADED_WORD)],
      answers: [],
    });
    const clock = new ManualClock(STARTED_AT);
    clock.advance(ONE_SECOND_MS);
    const reviewedAt = clock.now();
    const result = session.recordAttempt(
      {
        attemptId: "attempt-last",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );
    const current = dueSchedule();

    expect(
      scheduleMatchingAttempt({
        session,
        result,
        current,
        timeZone: TIME_ZONE,
      }),
    ).toEqual(scheduleReview(current, "HARD", reviewedAt, TIME_ZONE));
  });

  it("grades only the word whose row is marked graded", () => {
    const session = restore({
      session: sessionRow(),
      words: [wordRow("river", 0, GRADED_WORD), wordRow("stone", 1, UNGRADED_WORD)],
      answers: [],
    });
    const clock = new ManualClock(STARTED_AT);
    clock.advance(ONE_SECOND_MS);
    const reviewedAt = clock.now();
    const graded = session.recordAttempt(
      {
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );
    clock.advance(ONE_SECOND_MS);
    const distractor = session.recordAttempt(
      {
        attemptId: "attempt-stone",
        promptWordId: "stone",
        selectedWordId: "stone",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );

    expect(
      scheduleMatchingAttempt({
        session,
        result: graded,
        current: null,
        timeZone: TIME_ZONE,
      }),
    ).toEqual(scheduleReview(null, "GOOD", reviewedAt, TIME_ZONE));
    expect(
      scheduleMatchingAttempt({
        session,
        result: distractor,
        current: null,
        timeZone: TIME_ZONE,
      }),
    ).toBeNull();
  });

  it("does not grade again after the first miss stored on the rows", () => {
    const miss: GameAnswerRow = {
      attemptId: "attempt-miss",
      sequence: 0,
      promptWordId: "river",
      selectedWordId: "stone",
      isCorrect: 0,
      responseTimeMs: ONE_SECOND_MS,
      createdAt: "2026-11-12T15:00:01.000Z",
    };
    const session = restore({
      session: sessionRow({ wrongAnswers: 1 }),
      words: [wordRow("river", 0, GRADED_WORD), wordRow("stone", 1, GRADED_WORD)],
      answers: [miss],
    });
    const clock = new ManualClock("2026-11-12T15:00:01.000Z");
    clock.advance(ONE_SECOND_MS);
    const result = session.recordAttempt(
      {
        attemptId: "attempt-hit",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );

    expect(
      scheduleMatchingAttempt({
        session,
        result,
        current: dueSchedule(),
        timeZone: TIME_ZONE,
      }),
    ).toBeNull();
  });

  it("does not grade a word that is not due", () => {
    const session = restore({
      session: sessionRow(),
      words: [wordRow("river", 0, GRADED_WORD), wordRow("stone", 1, GRADED_WORD)],
      answers: [],
    });
    const clock = new ManualClock(STARTED_AT);
    clock.advance(ONE_SECOND_MS);
    const result = session.recordAttempt(
      {
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );
    const later = new Date(clock.now().getTime() + 86_400_000);

    expect(
      scheduleMatchingAttempt({
        session,
        result,
        current: { ...dueSchedule(), nextReviewAt: later },
        timeZone: TIME_ZONE,
      }),
    ).toBeNull();
  });

  it("does not grade a free session", () => {
    const session = restore({
      session: sessionRow({ mode: "FREE", targetWords: 3 }),
      words: [
        wordRow("river", 0, UNGRADED_WORD),
        wordRow("stone", 1, UNGRADED_WORD),
        wordRow("cloud", 2, UNGRADED_WORD),
      ],
      answers: [],
    });
    const clock = new ManualClock(STARTED_AT);
    clock.advance(ONE_SECOND_MS);
    const result = session.recordAttempt(
      {
        attemptId: "attempt-river",
        promptWordId: "river",
        selectedWordId: "river",
        responseTimeMs: FAST_RESPONSE_MS,
      },
      clock,
    );

    expect(
      scheduleMatchingAttempt({
        session,
        result,
        current: null,
        timeZone: TIME_ZONE,
      }),
    ).toBeNull();
  });
});
