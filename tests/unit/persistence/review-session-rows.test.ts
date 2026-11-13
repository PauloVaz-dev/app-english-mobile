import { describe, expect, it } from "vitest";

import { InvalidReviewSessionError, ReviewSession } from "@/lib/domain/review";
import { InvalidReviewScheduleError } from "@/lib/domain/learning/errors";
import { INITIAL_EASE_FACTOR } from "@/lib/domain/learning/review-schedule";
import {
  toReviewScheduleFromRow,
  toSchedulePersistence,
  type ReviewScheduleRow,
} from "@/persistence/sqlite-daily-review-reader";
import {
  toReviewSessionSnapshot,
  type ReviewSessionRow,
  type ReviewSessionWordRow,
  type StoredReviewSessionRows,
  type TypingAttemptRow,
} from "@/persistence/sqlite-review-session-repository";

const STARTED_AT = "2026-11-12T15:00:00.000Z";
const TIME_ZONE = "America/Sao_Paulo";
const LOCAL_DATE = "2026-11-12";
const NEXT_REVIEW_AT = "2026-11-13T03:00:00.000Z";
const STORED_REPETITIONS = 2;
const STORED_LAPSES = 1;
const STORED_INTERVAL_DAYS = 6;
const ACTIVE_WORD = 1;
const USED_HINT = 0;
const FIRST_ATTEMPT = 0;
const REINFORCEMENT_FLAG = 1;

describe("review session rows", () => {
  it("turns stored rows into an ordered session snapshot", () => {
    const snapshot = toReviewSessionSnapshot({
      session: sessionRow(),
      words: [wordRow("river", 1, "MATCHING", "NEW"), wordRow("apple", 0, "TYPING", "DUE")],
      attempts: [
        attemptRow({
          attemptId: "attempt-again",
          sequence: 1,
          outcome: "CORRECT",
          typedText: "apple",
          grade: null,
          isReinforcement: REINFORCEMENT_FLAG,
          createdAt: "2026-11-12T15:00:04.000Z",
        }),
        attemptRow({
          attemptId: "attempt-apple",
          sequence: 0,
          outcome: "DONT_KNOW",
          typedText: null,
          grade: "AGAIN",
          isReinforcement: FIRST_ATTEMPT,
          createdAt: "2026-11-12T15:00:02.000Z",
        }),
      ],
    });

    expect(snapshot.startedAt).toEqual(new Date(STARTED_AT));
    expect(snapshot.finishedAt).toBeNull();
    expect(snapshot.matchingFinished).toBe(false);
    expect(snapshot.words.map((entry) => [entry.word.id, entry.sequence, entry.stage, entry.origin])).toEqual([
      ["apple", 0, "TYPING", "DUE"],
      ["river", 1, "MATCHING", "NEW"],
    ]);
    expect(snapshot.words[0]?.word).toMatchObject({
      english: "apple",
      portuguese: "maçã",
      exampleSentence: "An apple.",
      active: true,
    });
    expect(snapshot.attempts.map((attempt) => attempt.attemptId)).toEqual([
      "attempt-apple",
      "attempt-again",
    ]);
    expect(snapshot.attempts[0]).toMatchObject({
      outcome: "DONT_KNOW",
      typedText: null,
      usedHint: false,
      grade: "AGAIN",
      isReinforcement: false,
      createdAt: new Date("2026-11-12T15:00:02.000Z"),
    });
    expect(snapshot.attempts[1]).toMatchObject({
      grade: null,
      isReinforcement: true,
      usedHint: false,
    });
    expect(ReviewSession.restore(snapshot).stage).toBe("MATCHING");
  });

  it("marks matching finished only when the linked game has left the active status", () => {
    const finished = toReviewSessionSnapshot(
      storedRows({ session: sessionRow({ gameStatus: "ABANDONED" }) }),
    );
    expect(finished.matchingFinished).toBe(true);
    expect(finished.gameSessionId).toBe("game-1");
  });

  it("refuses an unknown status, stage, origin, outcome, grade, or game status", () => {
    expect(() =>
      toReviewSessionSnapshot(
        storedRows({ session: sessionRow({ status: "PAUSED", gameSessionId: null, gameStatus: null }) }),
      ),
    ).toThrow(InvalidReviewSessionError);
    expect(() =>
      toReviewSessionSnapshot(storedRows({ words: [wordRow("apple", 0, "SPEAKING", "DUE")] })),
    ).toThrow(InvalidReviewSessionError);
    expect(() =>
      toReviewSessionSnapshot(storedRows({ words: [wordRow("apple", 0, "TYPING", "FRESH")] })),
    ).toThrow(InvalidReviewSessionError);
    expect(() =>
      toReviewSessionSnapshot(
        storedRows({
          attempts: [attemptRow({ outcome: "CLOSE" })],
        }),
      ),
    ).toThrow(InvalidReviewSessionError);
    expect(() =>
      toReviewSessionSnapshot(
        storedRows({
          attempts: [attemptRow({ grade: "PERFECT" })],
        }),
      ),
    ).toThrow(InvalidReviewSessionError);
    expect(() =>
      toReviewSessionSnapshot(storedRows({ session: sessionRow({ gameStatus: "PAUSED" }) })),
    ).toThrow(InvalidReviewSessionError);
  });
});

describe("review schedule rows", () => {
  it("turns a progress row into a schedule and back into stored columns", () => {
    const row = scheduleRow();
    const schedule = toReviewScheduleFromRow(row);
    expect(schedule).toEqual({
      state: "REVIEW",
      repetitions: STORED_REPETITIONS,
      lapses: STORED_LAPSES,
      intervalDays: STORED_INTERVAL_DAYS,
      easeFactor: INITIAL_EASE_FACTOR,
      nextReviewAt: new Date(NEXT_REVIEW_AT),
    });
    expect(schedule && toSchedulePersistence(schedule)).toEqual({
      nextReviewAt: NEXT_REVIEW_AT,
      reviewRepetitions: STORED_REPETITIONS,
      reviewLapses: STORED_LAPSES,
      reviewIntervalDays: STORED_INTERVAL_DAYS,
      reviewEaseFactor: INITIAL_EASE_FACTOR,
      reviewState: "REVIEW",
    });
  });

  it("treats a missing next review as no schedule and refuses an unknown state", () => {
    expect(toReviewScheduleFromRow(scheduleRow({ nextReviewAt: null }))).toBeNull();
    expect(() => toReviewScheduleFromRow(scheduleRow({ reviewState: "NEW" }))).toThrow(
      InvalidReviewScheduleError,
    );
    expect(() => toReviewScheduleFromRow(scheduleRow({ nextReviewAt: "not-a-date" }))).toThrow(
      InvalidReviewScheduleError,
    );
  });
});

function storedRows(overrides: {
  readonly session?: ReviewSessionRow;
  readonly words?: readonly ReviewSessionWordRow[];
  readonly attempts?: readonly TypingAttemptRow[];
} = {}): StoredReviewSessionRows {
  return {
    session: overrides.session ?? sessionRow({ gameSessionId: null, gameStatus: null }),
    words: overrides.words ?? [wordRow("apple", 0, "TYPING", "DUE")],
    attempts: overrides.attempts ?? [],
  };
}

function sessionRow(overrides: Partial<ReviewSessionRow> = {}): ReviewSessionRow {
  return {
    id: "review-1",
    visitorId: "visitor-1",
    localDate: LOCAL_DATE,
    timeZone: TIME_ZONE,
    status: "ACTIVE",
    gameSessionId: "game-1",
    startedAt: STARTED_AT,
    finishedAt: null,
    gameStatus: "ACTIVE",
    ...overrides,
  };
}

function wordRow(
  wordId: string,
  sequence: number,
  stage: string,
  origin: string,
): ReviewSessionWordRow {
  return {
    wordId,
    sequence,
    stage,
    origin,
    english: wordId,
    portuguese: wordId === "apple" ? "maçã" : `pt-${wordId}`,
    exampleSentence: wordId === "apple" ? "An apple." : null,
    active: ACTIVE_WORD,
  };
}

function attemptRow(overrides: Partial<TypingAttemptRow> = {}): TypingAttemptRow {
  return {
    attemptId: "attempt-apple",
    sequence: 0,
    wordId: "apple",
    outcome: "CORRECT",
    typedText: "apple",
    usedHint: USED_HINT,
    responseTimeMs: 3_000,
    grade: "GOOD",
    isReinforcement: FIRST_ATTEMPT,
    createdAt: "2026-11-12T15:00:02.000Z",
    ...overrides,
  };
}

function scheduleRow(overrides: Partial<ReviewScheduleRow> = {}): ReviewScheduleRow {
  return {
    reviewState: "REVIEW",
    reviewRepetitions: STORED_REPETITIONS,
    reviewLapses: STORED_LAPSES,
    reviewIntervalDays: STORED_INTERVAL_DAYS,
    reviewEaseFactor: INITIAL_EASE_FACTOR,
    nextReviewAt: NEXT_REVIEW_AT,
    ...overrides,
  };
}
