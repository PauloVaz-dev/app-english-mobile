import { describe, expect, it } from "vitest";

import { GameSession } from "@/lib/domain/game/game-session";
import { createWord } from "@/lib/domain/game/types";
import {
  InvalidReviewSessionError,
  ReviewAttemptConflictError,
  ReviewSession,
  ReviewSessionEndedError,
  UnexpectedTypingWordError,
} from "@/lib/domain/review";
import { FakeClock } from "../game/fixtures";

const at = new Date("2026-09-28T15:00:00.000Z");
const timeZone = "America/Sao_Paulo";

function word(id: string, english = id) {
  return createWord({
    id,
    english,
    portuguese: `pt-${id}`,
    exampleSentence: `${english} in a sentence.`,
  });
}

function startTyping(clock = new FakeClock(at)) {
  const session = ReviewSession.start(
    {
      id: "review-1",
      visitorId: "visitor-1",
      timeZone,
      gameSessionId: null,
      words: [
        { word: word("apple", "apple"), stage: "TYPING", origin: "DUE" },
        { word: word("grape", "grape"), stage: "TYPING", origin: "DUE" },
      ],
    },
    clock,
  );
  return { clock, session };
}

function answer(
  session: ReviewSession,
  clock: FakeClock,
  input: {
    attemptId: string;
    wordId: string;
    typedText: string | null;
    usedHint?: boolean;
    responseTimeMs?: number;
  },
) {
  return session.recordTypingAttempt(
    {
      attemptId: input.attemptId,
      wordId: input.wordId,
      typedText: input.typedText,
      usedHint: input.usedHint ?? false,
      responseTimeMs: input.responseTimeMs ?? 3_000,
    },
    clock,
  );
}

describe("ReviewSession", () => {
  it("skips an empty typing stage and starts on matching", () => {
    const clock = new FakeClock(at);
    const session = ReviewSession.start(
      {
        id: "review-1",
        visitorId: "visitor-1",
        timeZone,
        gameSessionId: "game-1",
        words: [
          { word: word("new-1", "river"), stage: "MATCHING", origin: "NEW" },
          { word: word("due-1", "bridge"), stage: "MATCHING", origin: "DUE" },
          { word: word("pad-1", "stone"), stage: "MATCHING", origin: "DISTRACTOR" },
        ],
      },
      clock,
    );

    expect(session.stage).toBe("MATCHING");
    expect(session.localDate).toBe("2026-09-28");
    expect(session.currentTyping).toBeNull();
    expect(session.typingRemaining).toBe(0);
  });

  it("skips an empty matching stage once typing is finished", () => {
    const { clock, session } = startTyping();

    expect(session.stage).toBe("TYPING");
    answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "apple",
    });
    answer(session, clock, {
      attemptId: "attempt-grape",
      wordId: "grape",
      typedText: "grape",
    });

    expect(session.stage).toBe("DONE");
    expect(session.gameSessionId).toBeNull();
    session.complete(clock);
    expect(session.status).toBe("COMPLETED");
  });

  it("moves from typing to matching and then to done when the game finishes", () => {
    const clock = new FakeClock(at);
    const session = ReviewSession.start(
      {
        id: "review-1",
        visitorId: "visitor-1",
        timeZone,
        gameSessionId: "game-1",
        words: [
          { word: word("apple", "apple"), stage: "TYPING", origin: "DUE" },
          { word: word("new-1", "river"), stage: "MATCHING", origin: "NEW" },
          { word: word("pad-1", "stone"), stage: "MATCHING", origin: "DISTRACTOR" },
          { word: word("pad-2", "cloud"), stage: "MATCHING", origin: "DISTRACTOR" },
        ],
      },
      clock,
    );

    expect(session.stage).toBe("TYPING");
    answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "apple",
    });
    expect(session.stage).toBe("MATCHING");

    const finished = ReviewSession.restore({
      ...session.toSnapshot(),
      matchingFinished: true,
    });
    expect(finished.stage).toBe("DONE");
    finished.complete(clock);
    expect(finished.status).toBe("COMPLETED");
  });

  it("returns each AGAIN word once at the end of typing and does not grade it", () => {
    const { clock, session } = startTyping();

    const first = answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: null,
    });
    expect(first).toMatchObject({
      outcome: "DONT_KNOW",
      grade: "AGAIN",
      isReinforcement: false,
      expected: "apple",
      exampleSentence: "apple in a sentence.",
    });
    expect(session.currentTyping).toEqual({ wordId: "grape", reinforcement: false });

    answer(session, clock, {
      attemptId: "attempt-grape",
      wordId: "grape",
      typedText: "grappe",
      responseTimeMs: 100,
    });
    expect(session.currentTyping).toEqual({ wordId: "apple", reinforcement: true });
    expect(session.typingRemaining).toBe(1);

    const reinforcement = answer(session, clock, {
      attemptId: "attempt-apple-again",
      wordId: "apple",
      typedText: "nope",
    });
    expect(reinforcement).toMatchObject({
      outcome: "WRONG",
      grade: null,
      isReinforcement: true,
    });
    expect(session.stage).toBe("DONE");
    expect(session.attempts.map((attempt) => attempt.grade)).toEqual(["AGAIN", "HARD", null]);
    expect(session.attempts.filter((attempt) => attempt.wordId === "apple")).toHaveLength(2);
  });

  it("caps a hinted correct answer at HARD and does not schedule reinforcement", () => {
    const { clock, session } = startTyping();

    const hinted = answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "APPLE",
      usedHint: true,
      responseTimeMs: 100,
    });

    expect(hinted.grade).toBe("HARD");
    expect(session.currentTyping).toEqual({ wordId: "grape", reinforcement: false });
  });

  it("replays the same attempt id and rejects a different payload", () => {
    const { clock, session } = startTyping();
    const input = {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "apple",
      usedHint: false,
      responseTimeMs: 3_000,
    };

    const first = session.recordTypingAttempt(input, clock);
    const replay = session.recordTypingAttempt(input, clock);

    expect(replay).toEqual(first);
    expect(session.attempts).toHaveLength(1);
    expect(() =>
      session.recordTypingAttempt({ ...input, typedText: "appl" }, clock),
    ).toThrow(ReviewAttemptConflictError);
    expect(session.attempts).toHaveLength(1);
  });

  it("keeps recorded grades when the review is abandoned", () => {
    const { clock, session } = startTyping();
    answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "apple",
      responseTimeMs: 100,
    });

    session.abandon(clock);

    expect(session.status).toBe("ABANDONED");
    expect(session.attempts).toEqual([
      expect.objectContaining({
        attemptId: "attempt-apple",
        wordId: "apple",
        grade: "EASY",
        isReinforcement: false,
      }),
    ]);
    expect(() =>
      answer(session, clock, {
        attemptId: "attempt-grape",
        wordId: "grape",
        typedText: "grape",
      }),
    ).toThrow(ReviewSessionEndedError);
    expect(
      session.recordTypingAttempt(
        {
          attemptId: "attempt-apple",
          wordId: "apple",
          typedText: "apple",
          usedHint: false,
          responseTimeMs: 100,
        },
        clock,
      ).grade,
    ).toBe("EASY");
  });

  it("rejects a word that is not the current prompt and completion before the end", () => {
    const { clock, session } = startTyping();

    expect(() =>
      answer(session, clock, {
        attemptId: "attempt-grape",
        wordId: "grape",
        typedText: "grape",
      }),
    ).toThrow(UnexpectedTypingWordError);
    expect(() => session.complete(clock)).toThrow(InvalidReviewSessionError);
    expect(session.status).toBe("ACTIVE");
    expect(session.attempts).toHaveLength(0);
  });

  it("accepts a review game with ungraded distractors and rejects a mismatched game", () => {
    const clock = new FakeClock(at);
    const matching = [
      word("new-1", "river"),
      word("pad-1", "stone"),
      word("pad-2", "cloud"),
    ];
    const session = ReviewSession.start(
      {
        id: "review-1",
        visitorId: "visitor-1",
        timeZone,
        gameSessionId: "game-1",
        words: [
          { word: matching[0], stage: "MATCHING", origin: "NEW" },
          { word: matching[1], stage: "MATCHING", origin: "DISTRACTOR" },
          { word: matching[2], stage: "MATCHING", origin: "DISTRACTOR" },
        ],
      },
      clock,
    );
    const game = GameSession.start(
      {
        id: "game-1",
        visitorId: "visitor-1",
        mode: "REVIEW",
        words: matching,
        ungradedWordIds: ["pad-1", "pad-2"],
      },
      clock,
    );

    expect(() => session.assertLinkedGame(game)).not.toThrow();
    expect(() => session.assertLinkedGame(null)).toThrow(InvalidReviewSessionError);
    const free = GameSession.start(
      {
        id: "game-1",
        visitorId: "visitor-1",
        mode: "FREE",
        words: matching,
      },
      clock,
    );
    expect(() => session.assertLinkedGame(free)).toThrow(InvalidReviewSessionError);
  });

  it("restores a snapshot without dropping attempts", () => {
    const { clock, session } = startTyping();
    answer(session, clock, {
      attemptId: "attempt-apple",
      wordId: "apple",
      typedText: "appl",
    });

    const restored = ReviewSession.restore(session.toSnapshot());

    expect(restored.attempts).toEqual(session.attempts);
    expect(restored.currentTyping).toEqual({ wordId: "grape", reinforcement: false });
    expect(restored.stage).toBe("TYPING");
  });
});
