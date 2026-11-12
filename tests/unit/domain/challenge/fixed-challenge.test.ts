import { describe, expect, it } from "vitest";

import {
  CHALLENGE_DURATION_MS,
  ChallengeNotStartedError,
  ChallengeStillRunningError,
  ChallengeTimeExpiredError,
  FixedChallenge,
  bestCompletedScore,
  compareWithRecord,
} from "@/lib/domain/challenge/fixed-challenge";
import {
  pointsForStreak,
  scoreOutcomes,
} from "@/lib/domain/challenge/scoring";
import {
  AttemptConflictError,
  InvalidGameSessionError,
  SessionEndedError,
} from "@/lib/domain/game/errors";
import type { Clock } from "@/lib/domain/game/types";

const START = new Date("2026-11-12T12:00:00.000Z");

class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

function setup() {
  const clock = new FakeClock(START);
  const challenge = FixedChallenge.create(
    { id: "challenge-1", visitorId: "visitor-1" },
    clock,
  );
  return { clock, challenge };
}

function started() {
  const context = setup();
  context.challenge.begin(context.clock);
  return context;
}

let attemptSequence = 0;

function answer(
  challenge: FixedChallenge,
  clock: Clock,
  isCorrect: boolean,
  attemptId = `attempt-${++attemptSequence}`,
) {
  return challenge.recordAttempt(
    {
      attemptId,
      promptWordId: "word-a",
      selectedWordId: isCorrect ? "word-a" : "word-b",
    },
    clock,
  );
}

describe("challenge scoring copied from the site", () => {
  it.each([
    { streak: 1, points: 100 },
    { streak: 2, points: 110 },
    { streak: 3, points: 120 },
    { streak: 6, points: 150 },
    { streak: 12, points: 150 },
  ])("awards $points points at streak $streak", ({ streak, points }) => {
    expect(pointsForStreak(streak)).toBe(points);
  });

  it("resets the streak on a miss without taking points away", () => {
    expect(scoreOutcomes([true, true, false, true])).toEqual({
      score: 100 + 110 + 100,
      streak: 1,
      bestStreak: 2,
      correctAnswers: 3,
      wrongAnswers: 1,
    });
  });

  it("is deterministic for the same sequence", () => {
    const outcomes = [true, false, true, true, true, false, true];

    expect(scoreOutcomes(outcomes)).toEqual(scoreOutcomes([...outcomes]));
  });

  it("never goes negative", () => {
    expect(scoreOutcomes([false, false]).score).toBe(0);
  });
});

describe("FixedChallenge", () => {
  it("has no level in the session", () => {
    const { challenge } = setup();

    expect(challenge).not.toHaveProperty("level");
    expect(challenge.status).toBe("ACTIVE");
    expect(challenge.deadline).toBeNull();
  });

  it("scores 100, 110, 120 and caps at 150 from the sixth correct match", () => {
    const { clock, challenge } = started();
    const totals: number[] = [];

    for (let index = 0; index < 7; index += 1) {
      answer(challenge, clock, true);
      totals.push(challenge.score.score);
    }

    expect(totals).toEqual([100, 210, 330, 460, 600, 750, 900]);
    expect(challenge.score.bestStreak).toBe(7);
  });

  it("resets the streak on a miss and never goes negative", () => {
    const { clock, challenge } = started();

    answer(challenge, clock, false);
    expect(challenge.score.score).toBe(0);
    answer(challenge, clock, true);
    answer(challenge, clock, true);
    answer(challenge, clock, false);
    answer(challenge, clock, true);

    expect(challenge.score).toEqual({
      score: 100 + 110 + 100,
      streak: 1,
      bestStreak: 2,
      correctAnswers: 3,
      wrongAnswers: 2,
    });
  });

  it("sets the deadline to startedAt plus 60 seconds", () => {
    const { clock, challenge } = setup();
    clock.advance(1_500);

    challenge.begin(clock);

    expect(CHALLENGE_DURATION_MS).toBe(60_000);
    expect(challenge.startedAt).toEqual(new Date(START.getTime() + 1_500));
    expect(challenge.deadline).toEqual(new Date(START.getTime() + 61_500));
  });

  it("rejects an attempt before the countdown starts", () => {
    const { clock, challenge } = setup();

    expect(() => answer(challenge, clock, true)).toThrow(ChallengeNotStartedError);
  });

  it("accepts an attempt at the exact deadline", () => {
    const { clock, challenge } = started();
    clock.advance(CHALLENGE_DURATION_MS);

    answer(challenge, clock, true);

    expect(challenge.score.score).toBe(100);
  });

  it("rejects an attempt 1 ms after the deadline without changing the score", () => {
    const { clock, challenge } = started();
    answer(challenge, clock, true);
    clock.advance(CHALLENGE_DURATION_MS + 1);

    expect(() => answer(challenge, clock, true)).toThrow(ChallengeTimeExpiredError);
    expect(challenge.score.score).toBe(100);
    expect(challenge.attempts).toHaveLength(1);
  });

  it("replays the same attempt id without scoring twice", () => {
    const { clock, challenge } = started();

    const first = answer(challenge, clock, true, "same");
    const replay = answer(challenge, clock, true, "same");

    expect(replay).toEqual(first);
    expect(challenge.score.score).toBe(100);
    expect(() => answer(challenge, clock, false, "same")).toThrow(
      AttemptConflictError,
    );
  });

  it("completes when expired at the exact deadline", () => {
    const { clock, challenge } = started();
    clock.advance(CHALLENGE_DURATION_MS);

    challenge.expire(clock);

    expect(challenge.status).toBe("COMPLETED");
    expect(challenge.finishedAt).toEqual(challenge.deadline);
    expect(() => answer(challenge, clock, true)).toThrow(SessionEndedError);
  });

  it("fails to expire 1 ms before the deadline", () => {
    const { clock, challenge } = started();
    clock.advance(CHALLENGE_DURATION_MS - 1);

    expect(() => challenge.expire(clock)).toThrow(ChallengeStillRunningError);
    expect(challenge.status).toBe("ACTIVE");
  });

  it("fails to expire before the countdown starts", () => {
    const { clock, challenge } = setup();

    expect(() => challenge.expire(clock)).toThrow(ChallengeNotStartedError);
  });

  it("marks an abandoned challenge and blocks further attempts", () => {
    const { clock, challenge } = started();
    answer(challenge, clock, true);
    clock.advance(10_000);

    challenge.abandon(clock);

    expect(challenge.status).toBe("ABANDONED");
    expect(challenge.finishedAt).toEqual(new Date(START.getTime() + 10_000));
    expect(() => answer(challenge, clock, true)).toThrow(SessionEndedError);
    expect(() => challenge.expire(clock)).toThrow(SessionEndedError);
  });

  it("caps the abandon time at the deadline", () => {
    const { clock, challenge } = started();
    clock.advance(CHALLENGE_DURATION_MS + 5_000);

    challenge.abandon(clock);

    expect(challenge.finishedAt).toEqual(challenge.deadline);
  });

  it("keeps the same deadline when the clock jumps after a background pause", () => {
    const { clock, challenge } = started();
    const deadline = challenge.deadline;
    clock.advance(20_000);
    answer(challenge, clock, true);

    clock.advance(30_000);
    challenge.begin(clock);

    expect(challenge.deadline).toEqual(deadline);
    expect(challenge.startedAt).toEqual(START);
    expect(challenge.remainingMs(clock)).toBe(10_000);

    clock.advance(10_001);
    expect(challenge.remainingMs(clock)).toBe(0);
    expect(() => answer(challenge, clock, true)).toThrow(ChallengeTimeExpiredError);
    expect(challenge.score.score).toBe(100);
  });
});

describe("in-memory challenge round", () => {
  it("returns the same total as scoreOutcomes for the accepted attempts", () => {
    const { clock, challenge } = setup();
    clock.advance(800);
    challenge.begin(clock);
    const outcomes = [
      true, true, false, true, true, true, true, true, true, true, false, true,
    ];

    for (const isCorrect of outcomes) {
      clock.advance(4_000);
      answer(challenge, clock, isCorrect);
    }
    clock.advance(CHALLENGE_DURATION_MS - 4_000 * outcomes.length);
    expect(() => answer(challenge, clock, true)).not.toThrow();
    clock.advance(1);
    expect(() => answer(challenge, clock, true)).toThrow(ChallengeTimeExpiredError);
    challenge.expire(clock);

    const accepted = [...outcomes, true];
    expect(challenge.status).toBe("COMPLETED");
    expect(challenge.attempts.map(({ isCorrect }) => isCorrect)).toEqual(accepted);
    expect(challenge.score).toEqual(scoreOutcomes(accepted));
  });
});

describe("personal record comparison", () => {
  it("makes the first completed challenge the record", () => {
    expect(compareWithRecord({ status: "COMPLETED", score: 0 }, null)).toEqual({
      previousBest: null,
      isNewRecord: true,
    });
    expect(compareWithRecord({ status: "COMPLETED", score: 320 }, null)).toEqual({
      previousBest: null,
      isNewRecord: true,
    });
  });

  it("does not announce a tie with the previous record as a new record", () => {
    expect(compareWithRecord({ status: "COMPLETED", score: 430 }, 430)).toEqual({
      previousBest: 430,
      isNewRecord: false,
    });
  });

  it("announces a new record only above the previous record", () => {
    expect(compareWithRecord({ status: "COMPLETED", score: 440 }, 430).isNewRecord).toBe(true);
    expect(compareWithRecord({ status: "COMPLETED", score: 420 }, 430).isNewRecord).toBe(false);
  });

  it("never makes an abandoned or active challenge a record", () => {
    expect(compareWithRecord({ status: "ABANDONED", score: 900 }, null).isNewRecord).toBe(false);
    expect(compareWithRecord({ status: "ABANDONED", score: 900 }, 430).isNewRecord).toBe(false);
    expect(compareWithRecord({ status: "ACTIVE", score: 900 }, 430).isNewRecord).toBe(false);
  });

  it("takes the highest completed score and leaves abandoned sessions out", () => {
    expect(bestCompletedScore([])).toBeNull();
    expect(bestCompletedScore([{ status: "ABANDONED", score: 900 }])).toBeNull();
    expect(
      bestCompletedScore([
        { status: "COMPLETED", score: 320 },
        { status: "ABANDONED", score: 900 },
        { status: "ACTIVE", score: 800 },
        { status: "COMPLETED", score: 430 },
        { status: "COMPLETED", score: 110 },
      ]),
    ).toBe(430);
  });
});

describe("restoring a stored challenge", () => {
  function completedSnapshot() {
    const { clock, challenge } = started();
    clock.advance(1_000);
    answer(challenge, clock, true, "restore-1");
    clock.advance(1_000);
    answer(challenge, clock, false, "restore-2");
    clock.advance(CHALLENGE_DURATION_MS);
    challenge.expire(clock);
    return { challenge, snapshot: challenge.toSnapshot() };
  }

  it("rebuilds the same deadline, attempts and score", () => {
    const { challenge, snapshot } = completedSnapshot();
    const restored = FixedChallenge.restore(snapshot);
    expect(restored.status).toBe("COMPLETED");
    expect(restored.deadline).toEqual(challenge.deadline);
    expect(restored.finishedAt).toEqual(challenge.deadline);
    expect(restored.attempts).toEqual(challenge.attempts);
    expect(restored.score).toEqual(challenge.score);
    expect(restored.toSnapshot()).toEqual(snapshot);
  });

  it("keeps an active restored challenge playable until the same deadline", () => {
    const { clock, challenge } = started();
    clock.advance(10_000);
    const restored = FixedChallenge.restore(challenge.toSnapshot());
    expect(restored.remainingMs(clock)).toBe(50_000);
    clock.advance(50_001);
    expect(() => answer(restored, clock, true)).toThrow(ChallengeTimeExpiredError);
  });

  it("rejects a snapshot that breaks the session rules", () => {
    const { snapshot } = completedSnapshot();
    const lastAttempt = snapshot.attempts[1];
    if (lastAttempt === undefined) {
      throw new Error("Snapshot is missing an attempt.");
    }
    const deadline = new Date(START.getTime() + CHALLENGE_DURATION_MS);
    const invalid = [
      { ...snapshot, status: "PAUSED" as never },
      { ...snapshot, finishedAt: null },
      { ...snapshot, finishedAt: new Date(deadline.getTime() - 1) },
      { ...snapshot, startedAt: null },
      {
        ...snapshot,
        attempts: [{ ...lastAttempt, occurredAt: new Date(deadline.getTime() + 1) }],
      },
      { ...snapshot, attempts: [{ ...lastAttempt, isCorrect: true }] },
      { ...snapshot, attempts: [lastAttempt, lastAttempt] },
    ];
    for (const candidate of invalid) {
      expect(() => FixedChallenge.restore(candidate)).toThrow(InvalidGameSessionError);
    }
  });
});
