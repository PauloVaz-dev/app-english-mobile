import { describe, expect, it } from "vitest";

import {
  AttemptConflictError,
  InvalidAttemptError,
  InvalidGameSessionError,
  SessionEndedError,
  WordAlreadyCompletedError,
  WordNotInSessionError,
} from "@/lib/domain/game/errors";
import { GameSession } from "@/lib/domain/game/game-session";
import { type GameSessionSnapshot, MAX_RESPONSE_TIME_MS } from "@/lib/domain/game/types";

import { FakeClock, makeWords } from "./fixtures";

function startSession(clock = new FakeClock(new Date("2026-08-22T12:00:00Z"))) {
  return {
    clock,
    session: GameSession.start(
      {
        id: "session-1",
        visitorId: "visitor-1",
        words: makeWords(),
      },
      clock,
    ),
  };
}

describe("GameSession", () => {
  it("starts an active session with exactly 20 distinct words", () => {
    const { session } = startSession();

    expect(session.status).toBe("ACTIVE");
    expect(session.targetWords).toBe(20);
    expect(session.words).toHaveLength(20);
    expect(new Set(session.words.map(({ word }) => word.id))).toHaveLength(20);
    expect(session.correctAnswers).toBe(0);
    expect(session.wrongAnswers).toBe(0);
  });

  it.each([3, 7, 20])("starts a review session whose target equals %i words", (count) => {
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));
    const session = GameSession.start(
      {
        id: "session-1",
        visitorId: "visitor-1",
        mode: "REVIEW",
        words: makeWords(count),
      },
      clock,
    );

    expect(session.mode).toBe("REVIEW");
    expect(session.targetWords).toBe(count);
    expect(session.words).toHaveLength(count);
    expect(session.words.every((entry) => entry.graded)).toBe(true);
    expect(session.gradesWord("word-1")).toBe(true);

    for (let index = 1; index <= count; index += 1) {
      session.recordAttempt(
        {
          attemptId: `attempt-${index}`,
          promptWordId: `word-${index}`,
          selectedWordId: `word-${index}`,
          responseTimeMs: 100,
        },
        clock,
      );
    }

    expect(session.status).toBe("COMPLETED");
    expect(session.result).toMatchObject({
      status: "COMPLETED",
      targetWords: count,
      completedWords: count,
    });
  });

  it.each([
    { mode: "FREE" as const, words: makeWords(2) },
    { mode: "FREE" as const, words: makeWords(21) },
    { mode: "REVIEW" as const, words: makeWords(21) },
  ])("rejects a session outside its allowed word range", ({ mode, words }) => {
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));

    expect(() =>
      GameSession.start({ id: "session-1", visitorId: "visitor-1", mode, words }, clock),
    ).toThrow(InvalidGameSessionError);
  });

  it("opens a review board with one or two matching words", () => {
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));
    const one = GameSession.start(
      {
        id: "session-1",
        visitorId: "visitor-1",
        mode: "REVIEW",
        words: makeWords(1),
      },
      clock,
    );
    const two = GameSession.start(
      {
        id: "session-2",
        visitorId: "visitor-1",
        mode: "REVIEW",
        words: makeWords(2),
      },
      clock,
    );

    expect(one.targetWords).toBe(1);
    expect(two.targetWords).toBe(2);
    expect(GameSession.restore(one.toSnapshot()).targetWords).toBe(1);
    expect(() =>
      GameSession.start(
        {
          id: "session-free",
          visitorId: "visitor-1",
          mode: "FREE",
          words: makeWords(2),
        },
        clock,
      ),
    ).toThrow(InvalidGameSessionError);
  });

  it("grades no words in free practice and rejects a new classic session", () => {
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));
    const session = GameSession.start(
      {
        id: "session-free",
        visitorId: "visitor-1",
        mode: "FREE",
        words: makeWords(3),
      },
      clock,
    );

    expect(session.mode).toBe("FREE");
    expect(session.targetWords).toBe(3);
    expect(session.words.every((entry) => entry.graded)).toBe(false);
    expect(session.gradesWord("word-1")).toBe(false);
    expect(() =>
      GameSession.start(
        {
          id: "session-classic",
          visitorId: "visitor-1",
          mode: "CLASSIC" as "FREE",
          words: makeWords(3),
        },
        clock,
      ),
    ).toThrow(InvalidGameSessionError);
  });

  it("leaves distractors ungraded inside a review session", () => {
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));
    const session = GameSession.start(
      {
        id: "session-review",
        visitorId: "visitor-1",
        mode: "REVIEW",
        words: makeWords(3),
        ungradedWordIds: ["word-2"],
      },
      clock,
    );

    expect(session.words.find((entry) => entry.word.id === "word-2")?.graded).toBe(false);
    expect(session.gradesWord("word-1")).toBe(true);
    expect(session.gradesWord("word-2")).toBe(false);
  });

  it("restores a legacy classic snapshot and still shows its result", () => {
    const { session, clock } = startSession();
    clock.advance(2_000);
    for (let index = 1; index <= 20; index += 1) {
      session.recordAttempt(
        {
          attemptId: `attempt-${index}`,
          promptWordId: `word-${index}`,
          selectedWordId: `word-${index}`,
          responseTimeMs: 100,
        },
        clock,
      );
    }
    const modern = session.toSnapshot();
    const legacy = {
      id: modern.id,
      visitorId: modern.visitorId,
      status: modern.status,
      targetWords: modern.targetWords,
      words: modern.words.map(({ word, sequence, presentedAt, completedAt }) => ({
        word,
        sequence,
        presentedAt,
        completedAt,
      })),
      attempts: modern.attempts,
      startedAt: modern.startedAt,
      finishedAt: modern.finishedAt,
    };

    const restored = GameSession.restore(legacy);

    expect(restored.mode).toBe("CLASSIC");
    expect(restored.targetWords).toBe(20);
    expect(restored.words.every((entry) => entry.graded)).toBe(true);
    expect(restored.gradesWord("word-1")).toBe(false);
    expect(restored.result).toMatchObject({
      status: "COMPLETED",
      targetWords: 20,
      completedWords: 20,
    });
  });

  it("rejects duplicate words", () => {
    const words = makeWords();
    words[19] = words[0];
    const clock = new FakeClock(new Date("2026-08-22T12:00:00Z"));

    expect(() =>
      GameSession.start({ id: "session-1", visitorId: "visitor-1", words }, clock),
    ).toThrow(InvalidGameSessionError);
  });

  it("records incorrect attempts without completing or removing a word", () => {
    const { session, clock } = startSession();
    clock.advance(1_000);

    const result = session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-2",
        responseTimeMs: 850,
      },
      clock,
    );

    expect(result.isCorrect).toBe(false);
    expect(session.correctAnswers).toBe(0);
    expect(session.wrongAnswers).toBe(1);
    expect(session.completedWords).toBe(0);
    expect(session.status).toBe("ACTIVE");
    expect(session.words.find(({ word }) => word.id === "word-1")?.completedAt).toBeNull();
  });

  it("records correct attempts and prevents completing the same word twice", () => {
    const { session, clock } = startSession();

    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 600,
      },
      clock,
    );

    expect(session.correctAnswers).toBe(1);
    expect(session.completedWords).toBe(1);
    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-2",
          promptWordId: "word-1",
          selectedWordId: "word-1",
          responseTimeMs: 400,
        },
        clock,
      ),
    ).toThrow(WordAlreadyCompletedError);
  });

  it("returns the original result for an idempotent retry", () => {
    const { session, clock } = startSession();
    const input = {
      attemptId: "attempt-1",
      promptWordId: "word-1",
      selectedWordId: "word-2",
      responseTimeMs: 500,
    };

    const first = session.recordAttempt(input, clock);
    clock.advance(5_000);
    const retry = session.recordAttempt(input, clock);

    expect(retry).toEqual(first);
    expect(session.attempts).toHaveLength(1);
    expect(session.wrongAnswers).toBe(1);
  });

  it("rejects reuse of an attempt id with different data", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-2",
        responseTimeMs: 500,
      },
      clock,
    );

    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-1",
          promptWordId: "word-1",
          selectedWordId: "word-3",
          responseTimeMs: 500,
        },
        clock,
      ),
    ).toThrow(AttemptConflictError);
  });

  it("validates word membership and response time", () => {
    const { session, clock } = startSession();

    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-1",
          promptWordId: "missing",
          selectedWordId: "word-1",
          responseTimeMs: 100,
        },
        clock,
      ),
    ).toThrow(WordNotInSessionError);

    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-2",
          promptWordId: "word-1",
          selectedWordId: "word-1",
          responseTimeMs: -1,
        },
        clock,
      ),
    ).toThrow(InvalidAttemptError);

    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-3",
          promptWordId: "word-1",
          selectedWordId: "word-1",
          responseTimeMs: MAX_RESPONSE_TIME_MS + 1,
        },
        clock,
      ),
    ).toThrow(InvalidAttemptError);
  });

  it("calculates precision and average response time from every attempt", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-2",
        responseTimeMs: 1_000,
      },
      clock,
    );
    session.recordAttempt(
      {
        attemptId: "attempt-2",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 3_000,
      },
      clock,
    );

    expect(session.metrics(clock)).toMatchObject({
      correctAnswers: 1,
      wrongAnswers: 1,
      accuracy: 50,
      averageResponseTimeMs: 2_000,
    });
  });

  it("completes automatically at the twentieth distinct correct match", () => {
    const { session, clock } = startSession();
    clock.advance(2_000);

    for (let index = 1; index <= 20; index += 1) {
      session.recordAttempt(
        {
          attemptId: `attempt-${index}`,
          promptWordId: `word-${index}`,
          selectedWordId: `word-${index}`,
          responseTimeMs: 100,
        },
        clock,
      );
    }

    expect(session.status).toBe("COMPLETED");
    expect(session.finishedAt).toEqual(new Date("2026-08-22T12:00:02Z"));
    expect(session.result).toMatchObject({
      durationMs: 2_000,
      completedWords: 20,
      correctAnswers: 20,
      wrongAnswers: 0,
      accuracy: 100,
      averageResponseTimeMs: 100,
    });
    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-21",
          promptWordId: "word-1",
          selectedWordId: "word-1",
          responseTimeMs: 100,
        },
        clock,
      ),
    ).toThrow(SessionEndedError);
  });

  it("abandons an active session, stops its duration and rejects mutations", () => {
    const { session, clock } = startSession();
    clock.advance(2_500);

    session.abandon(clock);
    clock.advance(7_500);

    expect(session.status).toBe("ABANDONED");
    expect(session.metrics(clock).durationMs).toBe(2_500);
    expect(() => session.abandon(clock)).toThrow(SessionEndedError);
    expect(() =>
      session.recordAttempt(
        {
          attemptId: "attempt-1",
          promptWordId: "word-1",
          selectedWordId: "word-1",
          responseTimeMs: 100,
        },
        clock,
      ),
    ).toThrow(SessionEndedError);
  });

  it("round-trips through a persistence snapshot without sharing mutable state", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 100,
      },
      clock,
    );

    const restored = GameSession.restore(session.toSnapshot());

    expect(restored.toSnapshot()).toEqual(session.toSnapshot());
    restored.recordAttempt(
      {
        attemptId: "attempt-2",
        promptWordId: "word-2",
        selectedWordId: "word-2",
        responseTimeMs: 100,
      },
      clock,
    );
    expect(session.completedWords).toBe(1);
    expect(restored.completedWords).toBe(2);
  });

  it("rejects an unknown status while restoring a snapshot", () => {
    const { session } = startSession();
    const invalidSnapshot = {
      ...session.toSnapshot(),
      status: "CORRUPTED",
      finishedAt: new Date("2026-08-22T12:00:01Z"),
    } as unknown as GameSessionSnapshot;

    expect(() => GameSession.restore(invalidSnapshot)).toThrow(InvalidGameSessionError);
  });

  it("rejects non-canonical aggregate and attempt identifiers", () => {
    const { session } = startSession();
    const snapshot = session.toSnapshot();
    const paddedSessionId: GameSessionSnapshot = {
      ...snapshot,
      id: " session-1 ",
    };
    const duplicateNormalizedAttempts: GameSessionSnapshot = {
      ...snapshot,
      attempts: [
        {
          attemptId: "attempt-1",
          promptWordId: "word-1",
          selectedWordId: "word-2",
          isCorrect: false,
          responseTimeMs: 100,
          occurredAt: snapshot.startedAt,
        },
        {
          attemptId: " attempt-1 ",
          promptWordId: "word-1",
          selectedWordId: "word-2",
          isCorrect: false,
          responseTimeMs: 100,
          occurredAt: snapshot.startedAt,
        },
      ],
    };

    expect(() => GameSession.restore(paddedSessionId)).toThrow(InvalidGameSessionError);
    expect(() => GameSession.restore(duplicateNormalizedAttempts)).toThrow(InvalidGameSessionError);
  });

  it("rejects a completed word that differs from the correct attempt", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 100,
      },
      clock,
    );
    const snapshot = session.toSnapshot();
    const invalidSnapshot: GameSessionSnapshot = {
      ...snapshot,
      words: snapshot.words.map((entry) => ({
        ...entry,
        completedAt:
          entry.word.id === "word-1"
            ? null
            : entry.word.id === "word-2"
              ? new Date("2026-08-22T12:00:00Z")
              : entry.completedAt,
      })),
    };

    expect(() => GameSession.restore(invalidSnapshot)).toThrow(InvalidGameSessionError);
  });

  it("rejects attempts and completions outside the session timeline", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 100,
      },
      clock,
    );
    const snapshot = session.toSnapshot();
    const beforeStart = new Date("2026-08-22T11:59:59Z");
    const attemptBeforeStart: GameSessionSnapshot = {
      ...snapshot,
      attempts: snapshot.attempts.map((attempt) => ({
        ...attempt,
        occurredAt: beforeStart,
      })),
    };
    const completionBeforeStart: GameSessionSnapshot = {
      ...snapshot,
      words: snapshot.words.map((entry) =>
        entry.word.id === "word-1" ? { ...entry, completedAt: beforeStart } : entry,
      ),
    };

    expect(() => GameSession.restore(attemptBeforeStart)).toThrow(InvalidGameSessionError);
    expect(() => GameSession.restore(completionBeforeStart)).toThrow(InvalidGameSessionError);
  });

  it("rejects events after an ended session and invalid word sequences", () => {
    const { session, clock } = startSession();
    session.recordAttempt(
      {
        attemptId: "attempt-1",
        promptWordId: "word-1",
        selectedWordId: "word-1",
        responseTimeMs: 100,
      },
      clock,
    );
    clock.advance(1_000);
    session.abandon(clock);
    const snapshot = session.toSnapshot();
    const afterFinish = new Date("2026-08-22T12:00:02Z");
    const lateAttempt: GameSessionSnapshot = {
      ...snapshot,
      attempts: snapshot.attempts.map((attempt) => ({
        ...attempt,
        occurredAt: afterFinish,
      })),
    };
    const lateCompletion: GameSessionSnapshot = {
      ...snapshot,
      words: snapshot.words.map((entry) =>
        entry.word.id === "word-1" ? { ...entry, completedAt: afterFinish } : entry,
      ),
    };
    const invalidSequence: GameSessionSnapshot = {
      ...snapshot,
      words: snapshot.words.map((entry) => ({
        ...entry,
        sequence: entry.sequence + 1,
      })),
    };

    expect(() => GameSession.restore(lateAttempt)).toThrow(InvalidGameSessionError);
    expect(() => GameSession.restore(lateCompletion)).toThrow(InvalidGameSessionError);
    expect(() => GameSession.restore(invalidSequence)).toThrow(InvalidGameSessionError);
  });
});
