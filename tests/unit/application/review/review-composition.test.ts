import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ChallengePronunciation } from "@/composition/challenge";
import {
  createReviewComposition,
  NOTHING_TO_REVIEW_MESSAGE,
  REVIEW_PERSIST_FAILED,
  REVIEW_SPEECH_FAILED,
  ReviewWritesHaltedError,
  type ReviewEvent,
} from "@/composition/review";
import { createWord, type Word } from "@/lib/domain/game/types";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { ManualClock, ReviewMemory } from "../../../support/review-memory";

const VISITOR_ID = "visitor-1";
const NOW = new Date("2026-11-12T15:00:00.000Z");
const DUE_AT = new Date("2026-11-12T03:00:00.000Z");
const FUTURE_AT = new Date("2026-12-20T03:00:00.000Z");
const TIME_ZONE = "America/Sao_Paulo";
const GOOD_RESPONSE_MS = 3_000;
const MEASURED_RESPONSE_MS = 4_200;
const FAST_RESPONSE_MS = 400;
const SEVEN_DAYS_MS = 7 * 86_400_000;

class SpySpeech implements ChallengePronunciation {
  readonly spoken: string[] = [];

  constructor(
    private readonly log: string[] | null = null,
    private readonly failure: Error | null = null,
  ) {}

  pronounce(english: string): void {
    this.spoken.push(english);
    this.log?.push(`speak:${english}`);
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

function word(id: string, english = id, portuguese = id, exampleSentence: string | null = null): Word {
  return createWord({ id, english, portuguese, exampleSentence });
}

function dueSchedule(state: ReviewSchedule["state"]): ReviewSchedule {
  return {
    state,
    repetitions: state === "REVIEW" ? 2 : 0,
    lapses: 0,
    intervalDays: state === "REVIEW" ? 6 : 0,
    easeFactor: 2.5,
    nextReviewAt: DUE_AT,
  };
}

function futureSchedule(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: FUTURE_AT,
  };
}

function sequenceIds(prefix: string): () => string {
  let next = 1;
  return () => {
    const id = `${prefix}-${next}`;
    next += 1;
    return id;
  };
}

function harness(options: { readonly speechFailure?: Error } = {}) {
  const clock = new ManualClock(NOW);
  const memory = new ReviewMemory(clock);
  const speech = new SpySpeech(memory.log, options.speechFailure ?? null);
  const events: ReviewEvent[] = [];
  const composition = createReviewComposition({
    repository: memory.repository,
    reader: memory.reader,
    preferences: memory.preferences,
    board: memory.board,
    clock,
    createId: sequenceIds("id"),
    resolveTimeZone: async () => TIME_ZONE,
    recordEvent: (event) => events.push(event),
    speech,
  });
  return { clock, memory, speech, events, composition };
}

function seedDuePair(memory: ReviewMemory) {
  memory.addWord(word("apple", "apple", "maçã", "I eat an apple."));
  memory.addWord(word("book", "book", "livro"));
  memory.schedule(VISITOR_ID, "apple", dueSchedule("REVIEW"));
  memory.schedule(VISITOR_ID, "book", dueSchedule("REVIEW"));
}

describe("review composition with fake dependencies", () => {
  it("returns nothing to review when nothing is due and nothing is new", async () => {
    const { composition, memory, events } = harness();
    memory.addWord(word("later"));
    memory.schedule(VISITOR_ID, "later", futureSchedule());

    const opening = await composition.start(VISITOR_ID);

    expect(opening).toEqual({ kind: "nothing", message: NOTHING_TO_REVIEW_MESSAGE });
    expect(NOTHING_TO_REVIEW_MESSAGE).toBe("nada para revisar");
    expect(memory.storedSession("id-1")).toBeNull();
    expect(events).toEqual([]);
  });

  it("abandons the active session and builds another with what is still due", async () => {
    const { composition, memory } = harness();
    seedDuePair(memory);

    const first = await composition.start(VISITOR_ID);
    if (first.kind !== "opened") {
      throw new Error("Expected the first review to open.");
    }
    await composition.type({
      sessionId: first.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    const graded = memory.readSchedule(VISITOR_ID, "apple");

    const second = await composition.start(VISITOR_ID);
    if (second.kind !== "opened") {
      throw new Error("Expected the second review to open.");
    }

    expect(memory.storedSession(first.view.id)?.status).toBe("ABANDONED");
    expect(memory.storedSession(first.view.id)?.attempts[0]).toMatchObject({
      wordId: "apple",
      grade: "GOOD",
    });
    expect(second.view.typing.current?.wordId).toBe("book");
    expect(memory.storedSession(second.view.id)?.words.map((entry) => entry.word.id)).toEqual(["book"]);
    expect(memory.readSchedule(VISITOR_ID, "apple")).toEqual(graded);

    await composition.type({
      sessionId: second.view.id,
      attemptId: "attempt-book",
      wordId: "book",
      kind: "answer",
      typed: "book",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    const empty = await composition.start(VISITOR_ID);
    expect(empty).toEqual({ kind: "nothing", message: NOTHING_TO_REVIEW_MESSAGE });
  });

  it("fills a matching board of fewer than three scheduled words with distractors", async () => {
    const { composition, memory } = harness();
    memory.addWord(word("house", "house", "casa"));
    memory.addWord(word("apple", "apple", "maçã"));
    memory.addWord(word("water", "water", "água"));
    memory.schedule(VISITOR_ID, "house", dueSchedule("LEARNING"));
    memory.schedule(VISITOR_ID, "apple", futureSchedule());
    memory.schedule(VISITOR_ID, "water", futureSchedule());

    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened") {
      throw new Error("Expected a matching review.");
    }
    const gameId = opening.view.gameSessionId;
    if (gameId === null) {
      throw new Error("Expected a linked game.");
    }
    const game = await memory.repository.findLinkedGame(gameId);

    expect(opening).toMatchObject({ matchingCount: 1, distractorCount: 2, typingCount: 0 });
    expect(game?.words.map((entry) => [entry.word.id, entry.graded])).toEqual([
      ["house", true],
      ["apple", false],
      ["water", false],
    ]);
  });

  it("keeps the typed response time and brings a miss back once as reinforcement", async () => {
    const { composition, memory } = harness();
    memory.addWord(word("apple", "apple", "maçã", "I eat an apple."));
    memory.schedule(VISITOR_ID, "apple", dueSchedule("REVIEW"));
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened") {
      throw new Error("Expected a typing review.");
    }

    const missed = await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-miss",
      wordId: "apple",
      kind: "dont_know",
      typed: null,
      usedHint: false,
      responseTimeMs: MEASURED_RESPONSE_MS,
    });
    const scheduleAfterMiss = memory.readSchedule(VISITOR_ID, "apple");

    expect(missed).toMatchObject({
      outcome: "DONT_KNOW",
      expected: "apple",
      exampleSentence: "I eat an apple.",
      isReinforcement: false,
      typing: { current: { wordId: "apple" }, reinforcement: true, remaining: 1 },
    });
    expect(missed).not.toHaveProperty("grade");
    expect(memory.storedSession(opening.view.id)?.attempts[0]?.responseTimeMs).toBe(MEASURED_RESPONSE_MS);

    const reinforced = await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-again",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: FAST_RESPONSE_MS,
    });
    const attempts = memory.storedSession(opening.view.id)?.attempts;

    expect(reinforced.isReinforcement).toBe(true);
    expect(attempts?.map((attempt) => [attempt.grade, attempt.isReinforcement])).toEqual([
      ["AGAIN", false],
      [null, true],
    ]);
    expect(memory.readSchedule(VISITOR_ID, "apple")).toEqual(scheduleAfterMiss);
    expect(scheduleAfterMiss?.nextReviewAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("speaks the English after a stored typed answer and a stored matching hit, without waiting", async () => {
    const { composition, memory, speech } = harness();
    memory.addWord(word("apple", "apple", "maçã"));
    memory.addWord(word("house", "house", "casa"));
    memory.addWord(word("water", "water", "água"));
    memory.addWord(word("stone", "stone", "pedra"));
    memory.schedule(VISITOR_ID, "apple", dueSchedule("REVIEW"));
    memory.schedule(VISITOR_ID, "house", dueSchedule("LEARNING"));
    memory.schedule(VISITOR_ID, "water", futureSchedule());
    memory.schedule(VISITOR_ID, "stone", futureSchedule());
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened" || opening.view.gameSessionId === null) {
      throw new Error("Expected typing and matching.");
    }
    const gameId = opening.view.gameSessionId;
    memory.log.length = 0;

    const typed = await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    const speakAt = memory.log.indexOf("speak:apple");
    const typeEnd = memory.log.lastIndexOf("end:type");
    expect(typed.outcome).toBe("CORRECT");
    expect(speakAt).toBeGreaterThan(typeEnd);

    memory.log.length = 0;
    await composition.expose(gameId, ["house"]);
    await composition.match({
      sessionId: gameId,
      attemptId: "attempt-miss",
      promptWordId: "house",
      selectedWordId: "water",
      responseTimeMs: FAST_RESPONSE_MS,
    });
    expect(speech.spoken).toEqual(["apple"]);
    await composition.match({
      sessionId: gameId,
      attemptId: "attempt-hit",
      promptWordId: "house",
      selectedWordId: "house",
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    expect(speech.spoken).toEqual(["apple", "house"]);
    expect(memory.log.indexOf("speak:house")).toBeGreaterThan(memory.log.lastIndexOf("end:match"));

    await composition.match({
      sessionId: gameId,
      attemptId: "attempt-hit",
      promptWordId: "house",
      selectedWordId: "house",
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    expect(speech.spoken).toEqual(["apple", "house"]);
  });

  it("records review.speech_failed and still returns the stored answer when the voice throws", async () => {
    const { composition, memory, events } = harness({ speechFailure: new Error("No voice.") });
    memory.addWord(word("apple", "apple", "maçã"));
    memory.schedule(VISITOR_ID, "apple", dueSchedule("REVIEW"));
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened") {
      throw new Error("Expected a typing review.");
    }

    const typed = await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });

    expect(typed.outcome).toBe("CORRECT");
    expect(events).toEqual([REVIEW_SPEECH_FAILED]);
    expect(REVIEW_SPEECH_FAILED).toBe("review.speech_failed");
    expect(memory.storedSession(opening.view.id)?.attempts).toHaveLength(1);
  });

  it("records review.persist_failed, rejects, and accepts the same attempt id on retry", async () => {
    const { composition, memory, events, speech } = harness();
    memory.addWord(word("apple", "apple", "maçã"));
    memory.addWord(word("house", "house", "casa"));
    memory.schedule(VISITOR_ID, "apple", dueSchedule("REVIEW"));
    memory.schedule(VISITOR_ID, "house", dueSchedule("LEARNING"));
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened" || opening.view.gameSessionId === null) {
      throw new Error("Expected typing and matching.");
    }
    const failure = new Error("Disk is full.");
    memory.failures.set("type", failure);
    const failed = composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    const queued = composition.match({
      sessionId: opening.view.gameSessionId,
      attemptId: "attempt-house",
      promptWordId: "house",
      selectedWordId: "house",
      responseTimeMs: FAST_RESPONSE_MS,
    });

    await expect(failed).rejects.toBe(failure);
    await expect(queued).rejects.toBeInstanceOf(ReviewWritesHaltedError);
    expect(events).toEqual([REVIEW_PERSIST_FAILED]);
    expect(REVIEW_PERSIST_FAILED).toBe("review.persist_failed");
    expect(speech.spoken).toEqual([]);
    expect(memory.log).not.toContain("begin:match");
    expect(memory.storedSession(opening.view.id)?.attempts).toHaveLength(0);

    const retried = await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    expect(retried.outcome).toBe("CORRECT");
    expect(memory.storedSession(opening.view.id)?.attempts).toHaveLength(1);
    expect(speech.spoken).toEqual(["apple"]);
  });

  it("serializes every database call of the composition", async () => {
    const { composition, memory } = harness();
    seedDuePair(memory);
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened") {
      throw new Error("Expected a review.");
    }
    memory.log.length = 0;
    memory.maxActive = 0;
    const calls = [
      composition.type({
        sessionId: opening.view.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        kind: "answer",
        typed: "apple",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      }),
      composition.type({
        sessionId: opening.view.id,
        attemptId: "attempt-book",
        wordId: "book",
        kind: "answer",
        typed: "book",
        usedHint: false,
        responseTimeMs: GOOD_RESPONSE_MS,
      }),
      composition.finish(opening.view.id),
      composition.abandon(opening.view.id),
    ];

    await Promise.all(calls);

    expect(memory.maxActive).toBe(1);
    let depth = 0;
    for (const entry of memory.log) {
      if (entry.startsWith("begin:")) {
        depth += 1;
        expect(depth).toBe(1);
      } else if (entry.startsWith("end:")) {
        depth -= 1;
      }
    }
    expect(depth).toBe(0);
  });

  it("returns hits, misses, how many are still due today and the next review date", async () => {
    const { composition, memory } = harness();
    seedDuePair(memory);
    const opening = await composition.start(VISITOR_ID);
    if (opening.kind !== "opened") {
      throw new Error("Expected a review.");
    }
    await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-apple",
      wordId: "apple",
      kind: "answer",
      typed: "apple",
      usedHint: false,
      responseTimeMs: GOOD_RESPONSE_MS,
    });
    await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-book",
      wordId: "book",
      kind: "answer",
      typed: "zzzz",
      usedHint: false,
      responseTimeMs: MEASURED_RESPONSE_MS,
    });
    await composition.type({
      sessionId: opening.view.id,
      attemptId: "attempt-book-again",
      wordId: "book",
      kind: "answer",
      typed: "book",
      usedHint: false,
      responseTimeMs: FAST_RESPONSE_MS,
    });

    const result = await composition.finish(opening.view.id);
    const nextBook = memory.readSchedule(VISITOR_ID, "book")?.nextReviewAt.toISOString();
    const nextApple = memory.readSchedule(VISITOR_ID, "apple");

    expect(result).toMatchObject({
      status: "COMPLETED",
      correctAnswers: 1,
      wrongAnswers: 1,
      remainingDueToday: 0,
      nextReviewAt: nextBook,
    });
    expect(nextApple && nextApple.nextReviewAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(
      SEVEN_DAYS_MS,
    );
  });
});

describe("review composition boundary", () => {
  it("keeps Expo and React Native out of the pure composition", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../src/composition/review.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](expo[^"']*|react-native[^"']*)["']/);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/await\s+[^;\n]*pronounce/);
    expect(source).not.toMatch(/await\s+[^;\n]*speech/);
  });

  it("wires the device with static named imports only", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../src/composition/installed-review.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/import\s+\*\s+as/);
    expect(source).toMatch(/import\s*\{[^}]*randomUUID[^}]*\}\s*from\s*"expo-crypto"/);
    expect(source).toContain("applyInstalledTimeZone");
    expect(source).toContain("createDeviceSpeech");
    expect(source).toContain("logDeviceEvent");
    expect(source).toContain("connectEnglishDatabase");
  });
});
