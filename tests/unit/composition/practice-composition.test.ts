import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ChallengePronunciation } from "@/composition/challenge";
import {
  createPracticeComposition,
  InsufficientPracticeCatalogError,
  PRACTICE_PERSIST_FAILED,
  PRACTICE_SPEECH_FAILED,
  PracticeWritesHaltedError,
  type PracticeEvent,
  type PracticeStore,
  type PracticeWordSource,
} from "@/composition/practice";
import {
  EMPTY_SESSION_RESULT_LISTS,
  type SessionResultLists,
} from "@/lib/application/game/session-view";
import { GameSessionNotFoundError, InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { GameSession } from "@/lib/domain/game/game-session";
import {
  type AttemptResult,
  type Clock,
  createWord,
  type SessionExposure,
  type Word,
} from "@/lib/domain/game/types";
import type {
  RecordGameAttemptInput,
  RecordGameExposuresInput,
} from "@/persistence/sqlite-game-session-repository";

const VISITOR_ID = "visitor-local";
const STARTED_AT = new Date("2026-11-12T12:00:00.000Z");

type StoreOperation = "create" | "find" | "expose" | "attempt" | "abandon" | "lists";

class FakeClock implements Clock {
  private current = new Date(STARTED_AT);

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class FakeCatalog implements PracticeWordSource {
  readonly calls: { visitorId: string }[] = [];

  constructor(private readonly draw: () => readonly Word[]) {}

  async drawPracticeWords(input: { visitorId: string }): Promise<readonly Word[]> {
    this.calls.push(input);
    return this.draw();
  }
}

/**
 * Keeps the session in memory with the copied rules. Every call waits a
 * little, longer for the earlier calls, so overlapping calls would finish out
 * of order and raise `maxActive` above one.
 */
class MemoryStore implements PracticeStore {
  readonly sessions = new Map<string, GameSession>();
  readonly log: string[] = [];
  readonly failures = new Map<StoreOperation, Error>();
  maxActive = 0;
  private active = 0;
  private calls = 0;

  constructor(private readonly clock: Clock) {}

  async create(session: GameSession): Promise<void> {
    await this.track("create", () => {
      this.sessions.set(session.id, GameSession.restore(session.toSnapshot()));
    });
  }

  async findById(sessionId: string): Promise<GameSession | null> {
    return this.track("find", () => this.sessions.get(sessionId) ?? null);
  }

  async recordExposures(input: RecordGameExposuresInput): Promise<readonly SessionExposure[]> {
    return this.track(`expose:${input.wordIds.join(",")}`, () =>
      this.require(input.sessionId).recordExposures(input.wordIds, this.clock),
    );
  }

  async recordAttempt(input: RecordGameAttemptInput): Promise<AttemptResult> {
    return this.track(`attempt:${input.attemptId}`, () =>
      this.require(input.sessionId).recordAttempt(input, this.clock),
    );
  }

  async abandon(sessionId: string): Promise<GameSession> {
    return this.track("abandon", () => {
      const session = this.require(sessionId);
      if (session.status === "ACTIVE") {
        session.abandon(this.clock);
      }
      return session;
    });
  }

  async readResultLists(sessionId: string): Promise<SessionResultLists> {
    return this.track("lists", () => {
      this.require(sessionId);
      return EMPTY_SESSION_RESULT_LISTS;
    });
  }

  private require(sessionId: string): GameSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new GameSessionNotFoundError(sessionId);
    }
    return session;
  }

  private async track<T>(label: string, work: () => T): Promise<T> {
    const operation = toOperation(label);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.log.push(`begin:${label}`);
    const delay = Math.max(0, 12 - this.calls * 3);
    this.calls += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const failure = this.failures.get(operation);
      if (failure !== undefined) {
        this.failures.delete(operation);
        throw failure;
      }
      return work();
    } finally {
      this.log.push(`end:${label}`);
      this.active -= 1;
    }
  }
}

function toOperation(label: string): StoreOperation {
  return label.split(":")[0] as StoreOperation;
}

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

function sampleWords(count: number): Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({
      id: `word-${String(index + 1).padStart(2, "0")}`,
      english: `english ${index + 1}`,
      portuguese: `portugues ${index + 1}`,
    }),
  );
}

interface Harness {
  readonly clock: FakeClock;
  readonly catalog: FakeCatalog;
  readonly store: MemoryStore;
  readonly speech: SpySpeech;
  readonly events: PracticeEvent[];
  readonly composition: ReturnType<typeof createPracticeComposition>;
}

function harness(
  options: {
    readonly draw?: () => readonly Word[];
    readonly speechFailure?: Error;
  } = {},
): Harness {
  const clock = new FakeClock();
  const store = new MemoryStore(clock);
  const catalog = new FakeCatalog(options.draw ?? (() => sampleWords(20)));
  const speech = new SpySpeech(store.log, options.speechFailure ?? null);
  const events: PracticeEvent[] = [];
  const composition = createPracticeComposition({
    catalog,
    repository: store,
    clock,
    createId: () => "session-1",
    recordEvent: (event) => events.push(event),
    speech,
  });
  return { clock, catalog, store, speech, events, composition };
}

function attemptOf(attemptId: string, promptWordId: string, selectedWordId: string = promptWordId) {
  return { sessionId: "session-1", attemptId, promptWordId, selectedWordId, responseTimeMs: 1_200 };
}

describe("practice composition with fake catalog, store and voice", () => {
  it("fails with the insufficient catalog state and creates no session", async () => {
    const refused = harness({
      draw: () => {
        throw new InvalidWordCatalogError("Catalog has 19 active words, but 20 are required.");
      },
    });
    const opening = refused.composition.start(VISITOR_ID);
    await expect(opening).rejects.toBeInstanceOf(InsufficientPracticeCatalogError);
    await expect(opening).rejects.toMatchObject({ state: "INSUFFICIENT_CATALOG" });
    expect(refused.store.sessions.size).toBe(0);
    expect(refused.events).toEqual([]);

    const short = harness({ draw: () => sampleWords(19) });
    await expect(short.composition.start(VISITOR_ID)).rejects.toBeInstanceOf(
      InsufficientPracticeCatalogError,
    );
    expect(short.store.sessions.size).toBe(0);
  });

  it("draws for the learner and creates a FREE session of twenty", async () => {
    const { composition, catalog, store } = harness();
    const opening = await composition.start(VISITOR_ID);
    expect(catalog.calls).toEqual([{ visitorId: VISITOR_ID }]);
    expect(opening.sessionId).toBe("session-1");
    expect(opening.targetWords).toBe(20);
    expect(opening.words.map(({ id }) => id)).toEqual(sampleWords(20).map(({ id }) => id));
    const stored = store.sessions.get("session-1");
    expect(stored?.mode).toBe("FREE");
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.words.every(({ graded }) => !graded)).toBe(true);
  });

  it("records the pairs that enter the board", async () => {
    const { composition, store } = harness();
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    await composition.expose("session-1", ["word-01"]);
    const presented = store.sessions.get("session-1")?.words.filter((entry) => entry.presentedAt);
    expect(presented?.map(({ word }) => word.id)).toEqual(["word-01", "word-02"]);
  });

  it("serializes every database call of the session in call order", async () => {
    const { composition, store } = harness();
    await composition.start(VISITOR_ID);
    store.log.length = 0;
    const calls = [
      composition.expose("session-1", ["word-01", "word-02", "word-03"]),
      composition.attempt(attemptOf("a-1", "word-01", "word-02")),
      composition.attempt(attemptOf("a-2", "word-01")),
      composition.expose("session-1", ["word-04"]),
      composition.attempt(attemptOf("a-3", "word-02")),
      composition.result("session-1"),
      composition.abandon("session-1"),
    ];
    await Promise.all(calls);
    expect(store.maxActive).toBe(1);
    const begins = store.log.filter((entry) => entry.startsWith("begin:"));
    expect(begins).toEqual([
      "begin:expose:word-01,word-02,word-03",
      "begin:attempt:a-1",
      "begin:attempt:a-2",
      "begin:expose:word-04",
      "begin:attempt:a-3",
      "begin:find",
      "begin:lists",
      "begin:abandon",
    ]);
    const attempts = store.sessions.get("session-1")?.attempts.map(({ attemptId }) => attemptId);
    expect(attempts).toEqual(["a-1", "a-2", "a-3"]);
  });

  it("does not count a repeated attemptId twice", async () => {
    const { composition, store, speech } = harness();
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    const first = await composition.attempt(attemptOf("a-1", "word-01"));
    const again = await composition.attempt(attemptOf("a-1", "word-01"));
    expect(again).toEqual(first);
    expect(again).toMatchObject({ correctAnswers: 1, wrongAnswers: 0, completedWords: 1 });
    expect(store.sessions.get("session-1")?.attempts).toHaveLength(1);
    expect(speech.spoken).toEqual(["english 1"]);
  });

  it("speaks the English only after a new correct attempt is stored", async () => {
    const { composition, store, speech } = harness();
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    store.log.length = 0;
    const wrong = await composition.attempt(attemptOf("a-1", "word-01", "word-02"));
    expect(wrong).toMatchObject({ isCorrect: false, completedWordId: null, wrongAnswers: 1 });
    expect(speech.spoken).toEqual([]);
    const right = await composition.attempt(attemptOf("a-2", "word-01"));
    expect(right).toMatchObject({ isCorrect: true, completedWordId: "word-01", correctAnswers: 1 });
    expect(speech.spoken).toEqual(["english 1"]);
    expect(store.log).toEqual([
      "begin:attempt:a-1",
      "end:attempt:a-1",
      "begin:attempt:a-2",
      "end:attempt:a-2",
      "speak:english 1",
    ]);
  });

  it("keeps the hit, the record and the next pair when the voice fails", async () => {
    const { composition, store, events } = harness({
      speechFailure: new Error("No voice."),
    });
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    const hit = await composition.attempt(attemptOf("a-1", "word-01"));
    expect(hit).toMatchObject({ isCorrect: true, completedWordId: "word-01", correctAnswers: 1 });
    expect(events).toEqual([PRACTICE_SPEECH_FAILED]);
    await composition.expose("session-1", ["word-03"]);
    const session = store.sessions.get("session-1");
    expect(session?.attempts.map(({ attemptId }) => attemptId)).toEqual(["a-1"]);
    expect(session?.words.find(({ word }) => word.id === "word-03")?.presentedAt).not.toBeNull();
  });

  it("records practice.persist_failed, rethrows and lets the same attempt be retried", async () => {
    const { composition, store, events, speech } = harness();
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    const failure = new Error("Disk is full.");
    store.failures.set("attempt", failure);
    const failed = composition.attempt(attemptOf("a-1", "word-01"));
    const queuedBehind = composition.attempt(attemptOf("a-2", "word-02"));
    await expect(failed).rejects.toBe(failure);
    await expect(queuedBehind).rejects.toBeInstanceOf(PracticeWritesHaltedError);
    expect(events).toEqual([PRACTICE_PERSIST_FAILED]);
    expect(speech.spoken).toEqual([]);
    expect(store.log).not.toContain("begin:attempt:a-2");

    const retried = await composition.attempt(attemptOf("a-1", "word-01"));
    const next = await composition.attempt(attemptOf("a-2", "word-02"));
    expect(retried).toMatchObject({ isCorrect: true, correctAnswers: 1 });
    expect(next).toMatchObject({ isCorrect: true, correctAnswers: 2 });
    expect(store.sessions.get("session-1")?.attempts.map(({ attemptId }) => attemptId)).toEqual([
      "a-1",
      "a-2",
    ]);
    expect(speech.spoken).toEqual(["english 1", "english 2"]);
  });

  it("records practice.persist_failed when the session cannot be created", async () => {
    const { composition, store, events } = harness();
    const failure = new Error("Database is locked.");
    store.failures.set("create", failure);
    await expect(composition.start(VISITOR_ID)).rejects.toBe(failure);
    expect(events).toEqual([PRACTICE_PERSIST_FAILED]);
  });

  it("abandons an active session and leaves an ended one as it was", async () => {
    const { composition, store, clock } = harness();
    await composition.start(VISITOR_ID);
    clock.advance(5_000);
    await composition.abandon("session-1");
    const abandoned = store.sessions.get("session-1");
    expect(abandoned?.status).toBe("ABANDONED");
    const finishedAt = abandoned?.finishedAt;
    clock.advance(5_000);
    await composition.abandon("session-1");
    expect(store.sessions.get("session-1")?.finishedAt).toEqual(finishedAt);
  });

  it("returns the metrics and both lists read from the store", async () => {
    const { composition, clock } = harness();
    await composition.start(VISITOR_ID);
    await composition.expose("session-1", ["word-01", "word-02"]);
    clock.advance(1_000);
    await composition.attempt(attemptOf("a-1", "word-01", "word-02"));
    clock.advance(1_000);
    await composition.attempt({ ...attemptOf("a-2", "word-01"), responseTimeMs: 2_000 });
    clock.advance(1_000);
    await composition.abandon("session-1");
    const result = await composition.result("session-1");
    expect(result).toEqual({
      sessionId: "session-1",
      status: "ABANDONED",
      targetWords: 20,
      completedWords: 1,
      correctAnswers: 1,
      wrongAnswers: 1,
      accuracy: 50,
      averageResponseTimeMs: 1_600,
      durationMs: 3_000,
      reviewWords: [],
      praiseWords: [],
    });
  });

  it("fails the result of an unknown session", async () => {
    const { composition } = harness();
    await expect(composition.result("missing")).rejects.toBeInstanceOf(GameSessionNotFoundError);
  });
});

describe("practice composition boundary", () => {
  it("keeps Expo and React Native out of the pure composition", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/composition/practice.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](expo[^"']*|react-native[^"']*)["']/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("wires the device with static named imports only", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../src/composition/installed-practice.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/import\s+\*\s+as/);
    expect(source).toMatch(/import\s*\{[^}]*randomUUID[^}]*\}\s*from\s*"expo-crypto"/);
    expect(source).toContain("createDeviceSpeech");
    expect(source).toContain("connectEnglishDatabase");
    expect(source).toContain("prepareHomeStudy");
    expect(source).toContain("Math.random");
  });
});
