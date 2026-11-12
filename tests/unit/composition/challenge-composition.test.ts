import { describe, expect, it } from "vitest";

import {
  CHALLENGE_PERSIST_FAILED,
  CHALLENGE_WORD_LIMIT,
  createChallengeComposition,
  InsufficientChallengeCatalogError,
  type ChallengeEvent,
  type ChallengeStore,
  type ChallengeWordSource,
  type DrawChallengeWordsInput,
} from "@/composition/challenge";
import type { FixedChallenge } from "@/lib/domain/challenge/fixed-challenge";
import { InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { createWord, type Word } from "@/lib/domain/game/types";
import type {
  ChallengeRecordView,
  StoredChallenge,
} from "@/persistence/sqlite-challenge-repository";

const VISITOR_ID = "visitor-local";
const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");

class FakeCatalog implements ChallengeWordSource {
  readonly calls: DrawChallengeWordsInput[] = [];

  constructor(private readonly draw: () => readonly Word[]) {}

  async drawChallengeWords(input: DrawChallengeWordsInput): Promise<readonly Word[]> {
    this.calls.push(input);
    return this.draw();
  }
}

class SpyStore implements ChallengeStore {
  readonly created: { challenge: FixedChallenge; wordIds: readonly string[] }[] = [];
  readonly saved: FixedChallenge[] = [];

  constructor(private readonly failure: Error | null = null) {}

  async create(challenge: FixedChallenge, wordIds: readonly string[]): Promise<void> {
    if (this.failure !== null) {
      throw this.failure;
    }
    this.created.push({ challenge, wordIds });
  }

  async save(challenge: FixedChallenge): Promise<void> {
    this.saved.push(challenge);
  }

  async find(): Promise<StoredChallenge | null> {
    return null;
  }

  async recordFor(): Promise<ChallengeRecordView> {
    throw new Error("Not used by these tests.");
  }
}

function compose(catalog: ChallengeWordSource, store: ChallengeStore, events: ChallengeEvent[]) {
  return createChallengeComposition({
    catalog,
    repository: store,
    clock: { now: () => new Date(OPENED_AT) },
    createId: () => "challenge-1",
    recordEvent: (event) => events.push(event),
  });
}

function sampleWords(count: number): Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({ id: `word-${index + 1}`, english: `en ${index}`, portuguese: `pt ${index}` }),
  );
}

describe("challenge composition with a fake catalog", () => {
  it("does not create a session when the catalog has no words", async () => {
    const catalog = new FakeCatalog(() => []);
    const store = new SpyStore();
    const events: ChallengeEvent[] = [];
    const composition = compose(catalog, store, events);
    const opening = composition.start(VISITOR_ID);
    await expect(opening).rejects.toBeInstanceOf(InsufficientChallengeCatalogError);
    await expect(opening).rejects.toMatchObject({ state: "INSUFFICIENT_CATALOG" });
    expect(catalog.calls).toEqual([{ visitorId: VISITOR_ID, limit: CHALLENGE_WORD_LIMIT }]);
    expect(store.created).toEqual([]);
    expect(store.saved).toEqual([]);
    expect(events).toEqual([]);
  });

  it("does not create a session when the copied draw refuses an empty catalog", async () => {
    const catalog = new FakeCatalog(() => {
      throw new InvalidWordCatalogError("Catalog has 0 studied words, but 40 were requested.");
    });
    const store = new SpyStore();
    const composition = compose(catalog, store, []);
    await expect(composition.start(VISITOR_ID)).rejects.toBeInstanceOf(
      InsufficientChallengeCatalogError,
    );
    expect(store.created).toEqual([]);
  });

  it("asks for 40 words and stores each drawn id once", async () => {
    const words = sampleWords(3);
    const store = new SpyStore();
    const composition = compose(new FakeCatalog(() => words), store, []);
    const round = await composition.start(VISITOR_ID);
    expect(CHALLENGE_WORD_LIMIT).toBe(40);
    expect(round.challengeId).toBe("challenge-1");
    expect(round.status).toBe("ACTIVE");
    expect(round.startedAt).toBeNull();
    expect(round.deadline).toBeNull();
    expect(round.words).toEqual(words);
    expect(round.wordIds).toEqual(["word-1", "word-2", "word-3"]);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]?.wordIds).toEqual(["word-1", "word-2", "word-3"]);
    expect(store.created[0]?.challenge.createdAt).toEqual(OPENED_AT);
  });

  it("refuses a draw that repeats a word and stores nothing", async () => {
    const [first, second] = sampleWords(2);
    if (first === undefined || second === undefined) {
      throw new Error("Sample words are missing.");
    }
    const store = new SpyStore();
    const composition = compose(new FakeCatalog(() => [first, second, first]), store, []);
    await expect(composition.start(VISITOR_ID)).rejects.toBeInstanceOf(InvalidWordCatalogError);
    expect(store.created).toEqual([]);
  });

  it("records challenge.persist_failed when the session cannot be stored", async () => {
    const failure = new Error("disk full");
    const events: ChallengeEvent[] = [];
    const composition = compose(new FakeCatalog(() => sampleWords(2)), new SpyStore(failure), events);
    await expect(composition.start(VISITOR_ID)).rejects.toBe(failure);
    expect(CHALLENGE_PERSIST_FAILED).toBe("challenge.persist_failed");
    expect(events).toEqual([CHALLENGE_PERSIST_FAILED]);
  });
});
