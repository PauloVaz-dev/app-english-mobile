import { beforeEach, describe, expect, it } from "vitest";

import { NothingToReviewError } from "@/lib/application/review/errors";
import { FinishReviewSession } from "@/lib/application/review/finish-review-session";
import { RecordTypingAnswer } from "@/lib/application/review/record-typing-answer";
import { StartDailyReview } from "@/lib/application/review/start-daily-review";
import type { IdGenerator } from "@/lib/application/shared/id-generator";
import { createWord, type Word } from "@/lib/domain/game/types";
import { DAILY_NEW_WORD_LIMIT } from "@/lib/domain/learning/daily-review-plan";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { ReviewAttemptConflictError, ReviewSessionNotFoundError } from "@/lib/domain/review";
import { ManualClock, ReviewMemory } from "../../../support/review-memory";

const VISITOR_ID = "visitor-1";
const OTHER_VISITOR_ID = "visitor-2";
const NOW = new Date("2026-09-28T15:00:00.000Z");
const DUE_AT = new Date("2026-09-28T03:00:00.000Z");
const FUTURE_AT = new Date("2026-10-02T03:00:00.000Z");
const TOKYO_ZONE = "Asia/Tokyo";
const INVALID_ZONE = "Mars/Phobos";
const GOOD_RESPONSE_MS = 3_000;
const FAST_RESPONSE_MS = 500;
const MEASURED_RESPONSE_MS = 4_200;
const NEW_WORD_COUNT = 12;

describe("daily review use cases", () => {
  let clock: ManualClock;
  let memory: ReviewMemory;
  let invalidTimeZones: number;

  beforeEach(() => {
    clock = new ManualClock(NOW);
    memory = new ReviewMemory(clock);
    invalidTimeZones = 0;
  });

  it("starts a matching review with distractors and stores the client time zone", async () => {
    seedWord(memory, word("learning", "house", "casa"));
    seedWord(memory, word("upcoming-a", "apple", "maçã"));
    seedWord(memory, word("upcoming-b", "water", "água"));
    memory.schedule(VISITOR_ID, "learning", schedule("LEARNING", DUE_AT));
    memory.schedule(VISITOR_ID, "upcoming-a", schedule("REVIEW", FUTURE_AT));
    memory.schedule(VISITOR_ID, "upcoming-b", schedule("LEARNING", FUTURE_AT));

    const started = await startUseCase(["review-1", "game-1"]).execute({
      visitorId: VISITOR_ID,
      timeZone: TOKYO_ZONE,
    });

    expect(started.view).toMatchObject({
      id: "review-1",
      stage: "MATCHING",
      gameSessionId: "game-1",
      typing: { current: null, remaining: 0, reinforcement: false },
      result: null,
    });
    expect(started).toMatchObject({
      typingCount: 0,
      matchingCount: 1,
      newCount: 0,
      distractorCount: 2,
    });
    const stored = memory.storedSession("review-1");
    expect(stored?.localDate).toBe("2026-09-29");
    expect(stored?.words.map((entry) => [entry.word.id, entry.origin])).toEqual([
      ["learning", "DUE"],
      ["upcoming-a", "DISTRACTOR"],
      ["upcoming-b", "DISTRACTOR"],
    ]);
    const game = await memory.repository.findLinkedGame("game-1");
    expect(game?.mode).toBe("REVIEW");
    expect(game?.words.map((entry) => [entry.word.id, entry.graded])).toEqual([
      ["learning", true],
      ["upcoming-a", false],
      ["upcoming-b", false],
    ]);
    expect(await memory.preferences.getTimeZone(VISITOR_ID)).toBe(TOKYO_ZONE);
    expect(invalidTimeZones).toBe(0);
  });

  it("rejects an empty plan and keeps an invalid time zone from replacing the stored one", async () => {
    seedWord(memory, word("later"));
    memory.schedule(VISITOR_ID, "later", schedule("REVIEW", FUTURE_AT));

    await expect(
      startUseCase(["review-1"]).execute({ visitorId: VISITOR_ID, timeZone: INVALID_ZONE }),
    ).rejects.toBeInstanceOf(NothingToReviewError);
    expect(invalidTimeZones).toBe(1);
    expect(memory.storedSession("review-1")).toBeNull();
    expect(await memory.preferences.getTimeZone(VISITOR_ID)).toBeNull();
  });

  it("does not introduce more than ten new words in a second session on the same local day", async () => {
    for (let index = 0; index < NEW_WORD_COUNT; index += 1) {
      seedWord(memory, word(`new-${index + 1}`));
    }

    const first = await startUseCase(["review-1", "game-1"]).execute({ visitorId: VISITOR_ID });
    const introduced = memory.storedSession("review-1")?.words.filter((entry) => entry.origin === "NEW");

    expect(first.newCount).toBe(DAILY_NEW_WORD_LIMIT);
    expect(introduced).toHaveLength(DAILY_NEW_WORD_LIMIT);
    await expect(startUseCase(["review-2", "game-2"]).execute({ visitorId: VISITOR_ID })).rejects.toBeInstanceOf(
      NothingToReviewError,
    );
    expect(memory.storedSession("review-2")).toBeNull();
  });

  it("keeps the measured response time and returns a wrong answer once as reinforcement", async () => {
    seedTypingWord();
    await startUseCase(["review-1"]).execute({ visitorId: VISITOR_ID });
    const answer = {
      sessionId: "review-1",
      visitorId: VISITOR_ID,
      attemptId: "attempt-1",
      wordId: "typed",
      typedText: null,
      usedHint: false,
      responseTimeMs: MEASURED_RESPONSE_MS,
    };

    const first = await answerUseCase().execute(answer);
    const scheduleAfterFirst = memory.readSchedule(VISITOR_ID, "typed");
    const second = await answerUseCase().execute(answer);

    expect(first).toMatchObject({
      outcome: "DONT_KNOW",
      expected: "apple",
      exampleSentence: "I eat an apple.",
      grade: "AGAIN",
      isReinforcement: false,
    });
    expect(first.view.typing).toMatchObject({
      current: { wordId: "typed", portuguese: "maçã" },
      reinforcement: true,
      remaining: 1,
    });
    expect(memory.storedSession("review-1")?.attempts[0]?.responseTimeMs).toBe(MEASURED_RESPONSE_MS);
    expect(second.outcome).toBe(first.outcome);
    expect(second.grade).toBe(first.grade);
    expect(memory.storedSession("review-1")?.attempts).toHaveLength(1);
    expect(memory.readSchedule(VISITOR_ID, "typed")).toEqual(scheduleAfterFirst);
  });

  it("caps a hinted correct answer at hard and rejects a conflicting retry", async () => {
    seedTypingWord();
    await startUseCase(["review-1"]).execute({ visitorId: VISITOR_ID });
    const answer = {
      sessionId: "review-1",
      visitorId: VISITOR_ID,
      attemptId: "attempt-1",
      wordId: "typed",
      typedText: "APPLE",
      usedHint: true,
      responseTimeMs: FAST_RESPONSE_MS,
    };

    await expect(answerUseCase().execute(answer)).resolves.toMatchObject({
      outcome: "CORRECT",
      grade: "HARD",
    });
    await expect(answerUseCase().execute({ ...answer, typedText: "apple pie" })).rejects.toBeInstanceOf(
      ReviewAttemptConflictError,
    );
    expect(memory.storedSession("review-1")?.attempts).toHaveLength(1);
  });

  it("hides another visitor's review and finishes with the day's remaining dues", async () => {
    seedTypingWord();
    await startUseCase(["review-1"]).execute({ visitorId: VISITOR_ID });

    await expect(
      finishUseCase().execute({
        sessionId: "review-1",
        visitorId: OTHER_VISITOR_ID,
        reason: "abandoned",
      }),
    ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);

    const finished = await finishUseCase().execute({
      sessionId: "review-1",
      visitorId: VISITOR_ID,
      reason: "abandoned",
    });

    expect(finished).toMatchObject({
      id: "review-1",
      stage: "DONE",
      result: {
        status: "ABANDONED",
        remainingDueToday: 1,
        nextReviewAt: null,
      },
    });
    expect(memory.storedSession("review-1")?.status).toBe("ABANDONED");
  });

  it("returns the result after the typing stage completes", async () => {
    seedTypingWord();
    await startUseCase(["review-1"]).execute({ visitorId: VISITOR_ID });

    const answered = await answerUseCase().execute({
      sessionId: "review-1",
      visitorId: VISITOR_ID,
      attemptId: "attempt-1",
      wordId: "typed",
      typedText: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });

    expect(answered.view.result).toMatchObject({
      status: "COMPLETED",
      correctAnswers: 1,
      wrongAnswers: 0,
      reviewWords: [],
      remainingDueToday: 0,
      pendingReview: false,
    });
    expect(answered.view.result?.nextReviewAt).toEqual(expect.any(String));
    expect(answered.view.matchingSession).toBeNull();
    expect(answered.view.stage).toBe("DONE");
  });

  function startUseCase(ids: readonly string[]) {
    return new StartDailyReview({
      repository: memory.repository,
      reader: memory.reader,
      preferences: memory.preferences,
      clock,
      idGenerator: sequenceIds(ids),
      onInvalidTimeZone: () => {
        invalidTimeZones += 1;
      },
    });
  }

  function answerUseCase() {
    return new RecordTypingAnswer({
      repository: memory.repository,
      reader: memory.reader,
      preferences: memory.preferences,
      clock,
      onInvalidTimeZone: () => {
        invalidTimeZones += 1;
      },
    });
  }

  function finishUseCase() {
    return new FinishReviewSession({
      repository: memory.repository,
      reader: memory.reader,
      clock,
    });
  }

  function seedTypingWord() {
    seedWord(memory, word("typed", "apple", "maçã", "I eat an apple."));
    memory.schedule(VISITOR_ID, "typed", schedule("REVIEW", DUE_AT));
  }
});

function sequenceIds(ids: readonly string[]): IdGenerator {
  const pending = [...ids];
  return {
    generate() {
      const next = pending.shift();
      if (!next) {
        throw new Error("Test id sequence exhausted.");
      }
      return next;
    },
  };
}

function word(
  id: string,
  english = id,
  portuguese = id,
  exampleSentence: string | null = null,
): Word {
  return createWord({ id, english, portuguese, exampleSentence });
}

function seedWord(memory: ReviewMemory, entry: Word) {
  memory.addWord(entry);
}

function schedule(state: ReviewSchedule["state"], nextReviewAt: Date): ReviewSchedule {
  return {
    state,
    repetitions: state === "REVIEW" ? 2 : 0,
    lapses: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewAt,
  };
}
