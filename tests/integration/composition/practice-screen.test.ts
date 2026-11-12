import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

import { createPracticeComposition, createPracticeScreenPort } from "@/composition/practice";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import {
  PracticeScreenController,
  practiceResultView,
  type PracticeBoardAttempt,
  type PracticeScreenPort,
} from "@/lib/presentation/game/practice-screen";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

vi.mock("expo-speech", () => {
  return {
    speak() {
      throw new Error("No voice on this device.");
    },
  };
});

const VISITOR_ID = "visitor-local";
const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");
const BOARD_SIZE = 5;
const MISSED_BEFORE_HIT = new Set([1, 6, 13]);

interface StoredSession {
  readonly status: string;
  readonly durationMs: number | null;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
}

interface ScreenRig {
  readonly controller: PracticeScreenController;
  readonly port: PracticeScreenPort;
  readonly clock: { now: Date };
  readonly database: Database.Database;
  readonly repository: FlakyRepository;
  readonly events: string[];
}

function at(offsetMs: number): Date {
  return new Date(OPENED_AT.getTime() + offsetMs);
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
      now: () => new Date(OPENED_AT),
    });
  } finally {
    database.close();
  }
}

/** Fails the attempt writes named in `failing` once each, like a full disk. */
class FlakyRepository extends SqliteGameSessionRepository {
  readonly failing = new Set<string>();

  override async recordAttempt(input: Parameters<SqliteGameSessionRepository["recordAttempt"]>[0]) {
    if (this.failing.delete(input.attemptId)) {
      throw new Error("disk is full");
    }
    return super.recordAttempt(input);
  }
}

async function withScreen(filePath: string, work: (rig: ScreenRig) => Promise<void>) {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const executor = createBetterSqliteExecutor(database);
    const clock = { now: OPENED_AT };
    const domainClock: Clock = { now: () => new Date(clock.now) };
    let nextId = 1;
    const repository = new FlakyRepository(
      executor,
      runBetterSqliteTransaction(database),
      domainClock,
    );
    const events: string[] = [];
    const composition = createPracticeComposition({
      catalog: new SqliteWordCatalog(executor, seededRandom(7), domainClock),
      repository,
      clock: domainClock,
      createId: () => `practice-${nextId++}`,
      recordEvent: (event) => events.push(event),
    });
    const port = createPracticeScreenPort({
      prepare: async () => ({ composition, visitorId: VISITOR_ID }),
    });
    const controller = new PracticeScreenController({
      port,
      now: () => new Date(clock.now),
      onChange: () => undefined,
    });
    await work({ controller, port, clock, database, repository, events });
  } finally {
    database.close();
  }
}

function currentMatch(controller: PracticeScreenController) {
  const state = controller.state;
  if (state.kind !== "match") {
    throw new Error(`Expected a match, got ${state.kind}.`);
  }
  return state.match;
}

function readSession(database: Database.Database, id: string): StoredSession {
  return database
    .prepare(
      `SELECT "status", "durationMs", "correctAnswers", "wrongAnswers" FROM "GameSession" WHERE "id" = ?`,
    )
    .get(id) as StoredSession;
}

/** Plays like the board: the first five cards, a replacement after every hit. */
async function play(rig: ScreenRig, hits: number): Promise<void> {
  const ids = currentMatch(rig.controller).words.map(({ id }) => id);
  rig.clock.now = at(500);
  await rig.controller.cardsReady(ids.slice(0, BOARD_SIZE));
  for (let index = 0; index < hits; index += 1) {
    const wordId = ids[index] ?? "";
    rig.clock.now = at(1_000 + index * 1_500);
    const taps: Promise<void>[] = [];
    if (MISSED_BEFORE_HIT.has(index)) {
      taps.push(rig.controller.attempt(tap(`miss-${index}`, wordId, ids[index + 1] ?? "", 1_800)));
    }
    taps.push(rig.controller.attempt(tap(`hit-${index}`, wordId, wordId, 900 + index * 40)));
    const next = ids[index + BOARD_SIZE];
    if (next !== undefined) {
      taps.push(rig.controller.pairsEntered([next]));
    }
    await Promise.all(taps);
  }
}

function tap(
  attemptId: string,
  promptWordId: string,
  selectedWordId: string,
  responseTimeMs: number,
): PracticeBoardAttempt {
  return {
    attemptId,
    promptWordId,
    selectedWordId,
    isCorrect: promptWordId === selectedWordId,
    responseTimeMs,
  };
}

describe("practice screen on better-sqlite3", () => {
  it("stores ABANDONED with the attempts already made when the route is left mid match", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        const { sessionId } = currentMatch(rig.controller);
        await play(rig, 3);

        rig.clock.now = at(30_000);
        await rig.controller.leave();

        expect(readSession(rig.database, sessionId)).toEqual({
          status: "ABANDONED",
          durationMs: 30_000,
          correctAnswers: 3,
          wrongAnswers: 1,
        });
        expect(rig.controller.state).toEqual({ kind: "intro" });
      });
    });
  });

  it("shows the same result of a completed match after the database is reopened", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      let sessionId = "";
      let shown: unknown = null;
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        sessionId = currentMatch(rig.controller).sessionId;
        await play(rig, 20);

        const state = rig.controller.state;
        expect(state.kind).toBe("result");
        shown = state.kind === "result" ? state.result : null;
        expect(readSession(rig.database, sessionId)).toMatchObject({
          status: "COMPLETED",
          correctAnswers: 20,
          wrongAnswers: MISSED_BEFORE_HIT.size,
        });

        await rig.controller.leave();
        expect(readSession(rig.database, sessionId).status).toBe("COMPLETED");
      });

      await withScreen(filePath, async (rig) => {
        rig.clock.now = at(600_000);
        const reopened = practiceResultView(await rig.port.result(sessionId));

        expect(reopened).toEqual(shown);
        expect(reopened.rows.map(({ label }) => label)).toEqual([
          "Duração",
          "Acertos",
          "Erros",
          "Precisão",
          "Tempo médio",
        ]);
        expect(reopened.sections[0]?.items.length).toBeGreaterThan(0);
      });
    });
  });

  it("pauses on a failed write and stores the retried attempts once, in tap order", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        const { sessionId, words } = currentMatch(rig.controller);
        const ids = words.map(({ id }) => id);
        await play(rig, 2);
        const [first = "", second = ""] = ids.slice(2);

        rig.repository.failing.add("miss-x");
        rig.clock.now = at(9_000);
        await Promise.all([
          rig.controller.attempt(tap("miss-x", first, second, 1_100)),
          rig.controller.attempt(tap("hit-x", first, first, 1_300)),
          rig.controller.pairsEntered([ids[7] ?? ""]),
        ]);

        expect(currentMatch(rig.controller).halted).toBe(true);
        expect(rig.events).toEqual(["practice.persist_failed"]);
        expect(readSession(rig.database, sessionId)).toMatchObject({
          correctAnswers: 2,
          wrongAnswers: 1,
        });

        await rig.controller.retry();
        await rig.controller.attempt(tap("hit-y", second, second, 900));
        await rig.controller.attempt(tap("hit-y", second, second, 900));

        expect(currentMatch(rig.controller).halted).toBe(false);
        expect(readSession(rig.database, sessionId)).toMatchObject({
          correctAnswers: 4,
          wrongAnswers: 2,
        });
        const answers = rig.database
          .prepare(`SELECT "attemptId" FROM "GameAnswer" WHERE "sessionId" = ? ORDER BY "sequence"`)
          .all(sessionId) as { attemptId: string }[];
        expect(answers.map(({ attemptId }) => attemptId).slice(-3)).toEqual([
          "miss-x",
          "hit-x",
          "hit-y",
        ]);
      });
    });
  });

  it("shows the insufficient catalog state without creating a session", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const database = new Database(filePath);
      database.exec(
        `UPDATE "Word" SET "active" = 0 WHERE "id" NOT IN (SELECT "id" FROM "Word" LIMIT 19)`,
      );
      database.close();
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();

        expect(rig.controller.state).toEqual({ kind: "insufficientCatalog" });
        const row = rig.database.prepare(`SELECT COUNT(*) AS "total" FROM "GameSession"`).get() as {
          total: number;
        };
        expect(row.total).toBe(0);
      });
    });
  });
});
