import Database from "better-sqlite3";
import type { SpeechOptions } from "expo-speech";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPracticeComposition,
  InsufficientPracticeCatalogError,
  PRACTICE_SPEECH_FAILED,
  recordPracticeSpeechFailure,
  type PracticeComposition,
  type PracticeEvent,
} from "@/composition/practice";
import { GameSession } from "@/lib/domain/game/game-session";
import type { Clock, RandomSource, Word } from "@/lib/domain/game/types";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { createDeviceSpeech } from "@/speech/device-speech";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const CREATED_AT = "2026-11-12T10:00:00.000Z";
const START = "2026-11-12T12:00:00.000Z";
const BOARD_SIZE = 5;
const WRONG_BEFORE_CORRECT = new Set([0, 3, 7, 12, 17]);

const deviceVoice = vi.hoisted(() => {
  return { spoken: [] as string[] };
});

vi.mock("expo-speech", () => {
  return {
    speak(text: string, options?: SpeechOptions) {
      deviceVoice.spoken.push(text);
      options?.onError?.(new Error("Speech engine died."));
    },
  };
});

class FakeClock implements Clock {
  private current = new Date(START);

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

function seededRandom(seed: number): RandomSource {
  let state = seed;
  return {
    next() {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    },
  };
}

async function createLearnerFile(filePath: string): Promise<void> {
  const database = new Database(filePath);
  try {
    await bootstrapEnglishDatabase({
      executor: createBetterSqliteExecutor(database),
      runInTransaction: runBetterSqliteTransaction(database),
      createVisitorId: () => VISITOR_ID,
      now: () => new Date(CREATED_AT),
    });
  } finally {
    database.close();
  }
}

interface Opened {
  readonly database: Database.Database;
  readonly clock: FakeClock;
  readonly repository: SqliteGameSessionRepository;
  readonly composition: PracticeComposition;
  readonly events: PracticeEvent[];
}

async function useComposition(filePath: string, work: (opened: Opened) => Promise<void>) {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const executor = createBetterSqliteExecutor(database);
    const clock = new FakeClock();
    const repository = new SqliteGameSessionRepository(
      executor,
      runBetterSqliteTransaction(database),
      clock,
    );
    const events: PracticeEvent[] = [];
    const recordEvent = (event: PracticeEvent) => events.push(event);
    const composition = createPracticeComposition({
      catalog: new SqliteWordCatalog(executor, seededRandom(11), clock),
      repository,
      clock,
      createId: () => "practice-1",
      recordEvent,
      speech: createDeviceSpeech(recordPracticeSpeechFailure(recordEvent)),
    });
    await work({ database, clock, repository, composition, events });
  } finally {
    database.close();
  }
}

/**
 * Plays like quick thumbs: every round fires its wrong attempt, its hit and
 * the next exposure without waiting, and the same steps run on an in-memory
 * session with the same clock.
 */
async function playTwenty(opened: Opened, words: readonly Word[]): Promise<GameSession> {
  const { clock, composition } = opened;
  const memory = GameSession.start(
    { id: "practice-1", visitorId: VISITOR_ID, words, mode: "FREE" },
    { now: () => new Date(START) },
  );
  const ids = words.map(({ id }) => id);
  clock.advance(300);
  await composition.expose("practice-1", ids.slice(0, BOARD_SIZE));
  memory.recordExposures(ids.slice(0, BOARD_SIZE), clock);
  for (let index = 0; index < ids.length; index += 1) {
    clock.advance(1_000 + index * 50);
    const promptWordId = ids[index] ?? "";
    const steps = [];
    if (WRONG_BEFORE_CORRECT.has(index)) {
      const wrong = {
        attemptId: `wrong-${index}`,
        promptWordId,
        selectedWordId: ids[index + 1] ?? ids[index - 1] ?? "",
        responseTimeMs: 700,
      };
      steps.push(composition.attempt({ sessionId: "practice-1", ...wrong }));
      memory.recordAttempt(wrong, clock);
    }
    const right = {
      attemptId: `right-${index}`,
      promptWordId,
      selectedWordId: promptWordId,
      responseTimeMs: 900 + index * 40,
    };
    steps.push(composition.attempt({ sessionId: "practice-1", ...right }));
    memory.recordAttempt(right, clock);
    const nextWordId = ids[index + BOARD_SIZE];
    if (nextWordId !== undefined) {
      steps.push(composition.expose("practice-1", [nextWordId]));
      memory.recordExposures([nextWordId], clock);
    }
    await Promise.all(steps);
  }
  return memory;
}

function readCounters(database: Database.Database) {
  return database
    .prepare(
      `SELECT SUM("timesShown") AS shown, SUM("correctCount") AS correct,
              SUM("wrongCount") AS wrong, COUNT(*) AS rows
       FROM "LearnerWordProgress" WHERE "visitorId" = ?`,
    )
    .get(VISITOR_ID);
}

describe("practice composition against the sqlite file", () => {
  beforeEach(() => {
    deviceVoice.spoken.length = 0;
  });

  it("stores a full match of twenty exactly as the in-memory session computes it", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      let expectedResult: unknown;
      await useComposition(filePath, async (opened) => {
        const opening = await opened.composition.start(VISITOR_ID);
        expect(opening.words).toHaveLength(20);
        expect(new Set(opening.words.map(({ id }) => id)).size).toBe(20);
        const memory = await playTwenty(opened, opening.words);

        const stored = await opened.repository.findById("practice-1");
        expect(stored?.toSnapshot()).toEqual(memory.toSnapshot());
        expect(stored?.status).toBe("COMPLETED");
        expect(opened.database.prepare(`SELECT COUNT(*) AS n FROM "GameAnswer"`).get()).toEqual({
          n: 25,
        });
        expect(readCounters(opened.database)).toEqual({
          shown: 20,
          correct: 20,
          wrong: 5,
          rows: 20,
        });

        const result = await opened.composition.result("practice-1");
        const memoryResult = memory.result;
        expect(result).toMatchObject({
          sessionId: "practice-1",
          status: "COMPLETED",
          targetWords: 20,
          completedWords: 20,
          correctAnswers: 20,
          wrongAnswers: 5,
          accuracy: memoryResult?.accuracy,
          averageResponseTimeMs: memoryResult?.averageResponseTimeMs,
          durationMs: memoryResult?.durationMs,
        });
        expect(result.accuracy).toBe(80);
        expect(result.reviewWords.length).toBeGreaterThan(0);
        expect(result.reviewWords.length).toBeLessThanOrEqual(3);
        expect(result.praiseWords.length).toBeLessThanOrEqual(3);
        expect(result).toMatchObject(await opened.repository.readResultLists("practice-1"));

        expect(deviceVoice.spoken).toEqual(opening.words.map(({ english }) => english));
        expect(opened.events).toEqual(Array(20).fill(PRACTICE_SPEECH_FAILED));
        expectedResult = result;
      });
      await useComposition(filePath, async (reopened) => {
        expect(await reopened.composition.result("practice-1")).toEqual(expectedResult);
      });
    });
  });

  it("abandons in the middle and keeps the attempts already stored", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useComposition(filePath, async (opened) => {
        const { composition, clock } = opened;
        const opening = await composition.start(VISITOR_ID);
        const ids = opening.words.map(({ id }) => id);
        await composition.expose("practice-1", ids.slice(0, BOARD_SIZE));
        clock.advance(1_000);
        const pending = [
          composition.attempt({
            sessionId: "practice-1",
            attemptId: "a-1",
            promptWordId: ids[0] ?? "",
            selectedWordId: ids[1] ?? "",
            responseTimeMs: 800,
          }),
          composition.attempt({
            sessionId: "practice-1",
            attemptId: "a-2",
            promptWordId: ids[0] ?? "",
            selectedWordId: ids[0] ?? "",
            responseTimeMs: 1_000,
          }),
        ];
        clock.advance(4_000);
        const leaving = composition.abandon("practice-1");
        await Promise.all([...pending, leaving]);

        const result = await composition.result("practice-1");
        expect(result).toMatchObject({
          status: "ABANDONED",
          correctAnswers: 1,
          wrongAnswers: 1,
          completedWords: 1,
          accuracy: 50,
          durationMs: 5_000,
        });
        expect(readCounters(opened.database)).toEqual({
          shown: BOARD_SIZE,
          correct: 1,
          wrong: 1,
          rows: BOARD_SIZE,
        });

        clock.advance(10_000);
        await composition.abandon("practice-1");
        expect(await composition.result("practice-1")).toEqual(result);
      });
    });
  });

  it("creates no session when fewer than twenty words are active", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const database = new Database(filePath);
      try {
        database.exec(
          `UPDATE "Word" SET "active" = 0
           WHERE "id" NOT IN (SELECT "id" FROM "Word" ORDER BY "id" LIMIT 19)`,
        );
      } finally {
        database.close();
      }
      await useComposition(filePath, async (opened) => {
        await expect(opened.composition.start(VISITOR_ID)).rejects.toBeInstanceOf(
          InsufficientPracticeCatalogError,
        );
        expect(opened.database.prepare(`SELECT COUNT(*) AS n FROM "GameSession"`).get()).toEqual({
          n: 0,
        });
        expect(opened.events).toEqual([]);
      });
    });
  });
});
