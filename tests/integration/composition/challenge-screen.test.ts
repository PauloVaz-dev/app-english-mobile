import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  createChallengeComposition,
  createChallengeScreenPort,
  type ChallengeComposition,
} from "@/composition/challenge";
import {
  CHALLENGE_DURATION_MS,
  ChallengeTimeExpiredError,
} from "@/lib/domain/challenge/fixed-challenge";
import { SessionEndedError } from "@/lib/domain/game/errors";
import type { Clock } from "@/lib/domain/game/types";
import {
  ChallengeScreenController,
  challengeBoardDisabled,
  type ChallengeScreenState,
} from "@/lib/presentation/challenge/challenge-screen";
import { PairBoardController } from "@/lib/presentation/game/pair-board-state";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteChallengeRepository } from "@/persistence/sqlite-challenge-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");

interface StoredSession {
  readonly id: string;
  readonly status: string;
  readonly score: number;
  readonly finishedAt: string | null;
}

interface ScreenRig {
  readonly composition: ChallengeComposition;
  readonly repository: SqliteChallengeRepository;
  readonly controller: ChallengeScreenController;
  readonly clock: { now: Date };
  readonly database: Database.Database;
  readonly states: ChallengeScreenState[];
}

function at(offsetMs: number): Date {
  return new Date(OPENED_AT.getTime() + offsetMs);
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

async function withScreen(
  filePath: string,
  work: (rig: ScreenRig) => Promise<void>,
): Promise<void> {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const executor = createBetterSqliteExecutor(database);
    const runInTransaction = runBetterSqliteTransaction(database);
    const clock = { now: OPENED_AT };
    const domainClock: Clock = { now: () => new Date(clock.now) };
    const repository = new SqliteChallengeRepository(executor, runInTransaction);
    let nextId = 1;
    const composition = createChallengeComposition({
      catalog: new SqliteWordCatalog(executor, { next: () => 0.42 }, domainClock),
      repository,
      clock: domainClock,
      createId: () => `challenge-${nextId++}`,
      recordEvent: () => undefined,
    });
    const states: ChallengeScreenState[] = [];
    const controller = new ChallengeScreenController({
      port: createChallengeScreenPort({
        prepare: async () => ({ composition, visitorId: VISITOR_ID }),
      }),
      now: () => new Date(clock.now),
      wait: async () => undefined,
      onChange: (state) => states.push(state),
    });
    await work({ composition, repository, controller, clock, database, states });
  } finally {
    database.close();
  }
}

function readSession(database: Database.Database, id: string): StoredSession {
  return database
    .prepare(`SELECT "id", "status", "score", "finishedAt" FROM "ChallengeSession" WHERE "id" = ?`)
    .get(id) as StoredSession;
}

function roundId(controller: ChallengeScreenController): string {
  const state = controller.state;
  if (state.kind !== "round") {
    throw new Error(`Expected a round, got ${state.kind}.`);
  }
  return state.challengeId;
}

async function hitFirstWord(rig: ScreenRig, attemptId: string, offsetMs: number): Promise<void> {
  const challengeId = roundId(rig.controller);
  const stored = await rig.repository.find(challengeId);
  const wordId = stored?.wordIds[Number(attemptId.split("-").pop())] ?? "";
  await rig.composition.attempt(
    { challengeId, attemptId, promptWordId: wordId, selectedWordId: wordId },
    at(offsetMs),
  );
}

const STUDY_TABLES = [
  "GameSession",
  "GameSessionWord",
  "GameAnswer",
  "LearnerWordProgress",
] as const;

function studyTables(database: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(
    STUDY_TABLES.map((table) => [
      table,
      database.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all(),
    ]),
  );
}

function storedAttemptIds(database: Database.Database, challengeId: string): string[] {
  const rows = database
    .prepare(`SELECT "attemptId" FROM "ChallengeAttempt" WHERE "sessionId" = ? ORDER BY "sequence"`)
    .all(challengeId) as { attemptId: string }[];
  return rows.map(({ attemptId }) => attemptId);
}

/** The board on top of the screen controller, wired like the challenge screen wires PairBoard. */
function mountBoard(rig: ScreenRig) {
  const state = rig.controller.state;
  if (state.kind !== "round") {
    throw new Error(`Expected a round, got ${state.kind}.`);
  }
  const writes: Promise<void>[] = [];
  const attemptIds: string[] = [];
  let nextAttempt = 1;
  const board = new PairBoardController({
    words: state.words,
    random: { next: () => 0.37 },
    now: () => rig.clock.now.getTime(),
    createAttemptId: () => `tap-${nextAttempt++}`,
    announce: () => undefined,
    onChange: () => undefined,
  });
  board.setCallbacks({
    onReady: () => writes.push(rig.controller.cardsReady()),
    onPairsEntered: () => undefined,
    onAttempt: (attempt) => {
      attemptIds.push(attempt.attemptId);
      writes.push(rig.controller.attempt(attempt));
    },
  });
  const sync = () => {
    const current = rig.controller.state;
    board.setDisabled(current.kind !== "round" || challengeBoardDisabled(current, rig.clock.now));
  };
  const hit = () => {
    const [card] = board.state.board.portugueseCards;
    if (card === undefined) {
      throw new Error("The board is empty.");
    }
    sync();
    board.select(card.wordId, "portuguese");
    board.select(card.wordId, "english");
  };
  const miss = () => {
    const [card] = board.state.board.portugueseCards;
    const other = board.state.board.englishCards.find(({ wordId }) => wordId !== card?.wordId);
    if (card === undefined || other === undefined) {
      throw new Error("The board needs two pairs for a miss.");
    }
    sync();
    board.select(card.wordId, "portuguese");
    board.select(other.wordId, "english");
  };
  return {
    board,
    attemptIds,
    hit,
    miss,
    ready: () => board.ready(),
    settle: () => Promise.all(writes),
  };
}

describe("challenge round through the pair board on better-sqlite3", () => {
  it("scores the board's attempts and stores them only in ChallengeAttempt", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        const before = studyTables(rig.database);
        await rig.controller.start();
        const challengeId = roundId(rig.controller);
        const table = mountBoard(rig);

        rig.clock.now = at(500);
        table.ready();
        await table.settle();
        expect(readSession(rig.database, challengeId)).toMatchObject({ status: "ACTIVE" });
        expect(rig.controller.state).toMatchObject({ deadline: at(500 + CHALLENGE_DURATION_MS) });

        for (const [index, play] of ["hit", "hit", "miss", "hit", "hit", "hit"].entries()) {
          rig.clock.now = at(1_000 + index * 2_000);
          if (play === "hit") {
            table.hit();
          } else {
            table.miss();
          }
        }
        await table.settle();

        expect(rig.controller.state).toMatchObject({ kind: "round", score: 540, streak: 3 });
        expect(storedAttemptIds(rig.database, challengeId)).toEqual(table.attemptIds);

        rig.clock.now = at(500 + CHALLENGE_DURATION_MS);
        await rig.controller.refresh();

        expect(rig.controller.state).toMatchObject({
          kind: "result",
          result: { rows: expect.arrayContaining([{ label: "Pontuação", value: "540" }]) },
        });
        expect(readSession(rig.database, challengeId)).toMatchObject({
          status: "COMPLETED",
          score: 540,
        });
        expect(studyTables(rig.database)).toEqual(before);
      });
    });
  });

  it("does not store an attempt tapped after zero and blocks the board", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        const challengeId = roundId(rig.controller);
        const table = mountBoard(rig);
        table.ready();
        await table.settle();
        rig.clock.now = at(10_000);
        table.hit();
        await table.settle();

        rig.clock.now = at(CHALLENGE_DURATION_MS + 1);
        const [card] = table.board.state.board.portugueseCards;
        table.board.select(card?.wordId ?? "", "portuguese");
        table.board.select(card?.wordId ?? "", "english");
        await table.settle();
        expect(rig.controller.state).toMatchObject({ kind: "round", score: 100, streak: 1 });

        table.hit();
        await table.settle();
        expect(table.board.state.disabled).toBe(true);

        await rig.controller.refresh();
        expect(readSession(rig.database, challengeId)).toMatchObject({
          status: "COMPLETED",
          score: 100,
        });
        expect(storedAttemptIds(rig.database, challengeId)).toEqual(["tap-1"]);
      });
    });
  });

  it("explains that the vocabulary ran out and still concludes at zero with the record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const database = new Database(filePath);
      database.exec(
        `UPDATE "Word" SET "active" = 0 WHERE "id" NOT IN (SELECT "id" FROM "Word" ORDER BY "id" LIMIT 3)`,
      );
      database.close();
      await withScreen(filePath, async (rig) => {
        const before = studyTables(rig.database);
        await rig.controller.start();
        const challengeId = roundId(rig.controller);
        const table = mountBoard(rig);
        table.ready();
        await table.settle();

        for (const index of [0, 1, 2]) {
          rig.clock.now = at(1_000 + index * 1_000);
          table.hit();
        }
        await table.settle();

        expect(rig.controller.state).toMatchObject({ kind: "round", exhausted: true, score: 330 });
        rig.clock.now = at(20_000);
        await rig.controller.refresh();
        expect(readSession(rig.database, challengeId)).toMatchObject({ status: "ACTIVE" });

        rig.clock.now = at(CHALLENGE_DURATION_MS);
        await rig.controller.refresh();
        expect(rig.controller.state).toMatchObject({
          kind: "result",
          result: { isNewRecord: true },
        });
        expect(readSession(rig.database, challengeId)).toMatchObject({
          status: "COMPLETED",
          score: 330,
        });
        expect(studyTables(rig.database)).toEqual(before);
      });
    });
  });
});

describe("challenge screen on better-sqlite3", () => {
  it("stores ABANDONED when the route is left mid round and keeps the previous record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        await rig.controller.cardsReady();
        await hitFirstWord(rig, "first-0", 1_000);
        rig.clock.now = at(CHALLENGE_DURATION_MS);
        await rig.controller.refresh();
        expect(rig.controller.state).toMatchObject({
          kind: "result",
          result: { isNewRecord: true },
        });
        expect(await rig.repository.bestCompletedScore(VISITOR_ID)).toBe(100);

        rig.clock.now = at(CHALLENGE_DURATION_MS + 5_000);
        await rig.controller.start();
        const abandonedId = roundId(rig.controller);
        rig.clock.now = at(CHALLENGE_DURATION_MS + 6_000);
        await rig.controller.cardsReady();
        await hitFirstWord(rig, "second-0", CHALLENGE_DURATION_MS + 7_000);
        await hitFirstWord(rig, "second-1", CHALLENGE_DURATION_MS + 8_000);
        rig.clock.now = at(CHALLENGE_DURATION_MS + 9_000);
        await rig.controller.leave();

        expect(readSession(rig.database, abandonedId)).toMatchObject({
          status: "ABANDONED",
          score: 210,
          finishedAt: at(CHALLENGE_DURATION_MS + 9_000).toISOString(),
        });
        expect(await rig.repository.bestCompletedScore(VISITOR_ID)).toBe(100);
      });
    });
  });

  it("concludes at the deadline when the screen returns from background after it passed", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        const challengeId = roundId(rig.controller);
        await rig.controller.cardsReady();
        await hitFirstWord(rig, "only-0", 2_000);

        rig.clock.now = at(CHALLENGE_DURATION_MS + 45_000);
        await rig.controller.refresh();

        const kinds = rig.states.map(({ kind }) => kind);
        expect(kinds.indexOf("timeUp")).toBeLessThan(kinds.indexOf("result"));
        expect(readSession(rig.database, challengeId)).toMatchObject({
          status: "COMPLETED",
          score: 100,
          finishedAt: at(CHALLENGE_DURATION_MS).toISOString(),
        });

        const stored = await rig.repository.find(challengeId);
        const wordId = stored?.wordIds[1] ?? "";
        await expect(
          rig.composition.attempt(
            { challengeId, attemptId: "late", promptWordId: wordId, selectedWordId: wordId },
            at(CHALLENGE_DURATION_MS + 46_000),
          ),
        ).rejects.toBeInstanceOf(SessionEndedError);
      });
    });
  });

  it("keeps the round running in background without abandoning or pausing", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();
        const challengeId = roundId(rig.controller);
        await rig.controller.cardsReady();

        rig.clock.now = at(50_000);
        await rig.controller.refresh();

        expect(readSession(rig.database, challengeId)).toMatchObject({
          status: "ACTIVE",
          finishedAt: null,
        });
        expect(rig.controller.state).toMatchObject({
          kind: "round",
          deadline: at(CHALLENGE_DURATION_MS),
        });
        const stored = await rig.repository.find(challengeId);
        const wordId = stored?.wordIds[0] ?? "";
        await expect(
          rig.composition.attempt(
            { challengeId, attemptId: "after-zero", promptWordId: wordId, selectedWordId: wordId },
            at(CHALLENGE_DURATION_MS + 1),
          ),
        ).rejects.toBeInstanceOf(ChallengeTimeExpiredError);
      });
    });
  });

  it("does not present a tie with the record as a new record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await withScreen(filePath, async (rig) => {
        for (const round of [0, 1]) {
          const base = round * 2 * CHALLENGE_DURATION_MS;
          rig.clock.now = at(base);
          await rig.controller.start();
          await rig.controller.cardsReady();
          await hitFirstWord(rig, `tie${round}-0`, base + 1_000);
          rig.clock.now = at(base + CHALLENGE_DURATION_MS);
          await rig.controller.refresh();
        }

        expect(rig.controller.state).toMatchObject({
          kind: "result",
          result: {
            isNewRecord: false,
            recordText: "Você empatou com o seu recorde de 100 pontos.",
          },
        });
      });
    });
  });

  it("shows the insufficient catalog state without creating a session", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const database = new Database(filePath);
      database.exec(`UPDATE "Word" SET "active" = 0`);
      database.close();
      await withScreen(filePath, async (rig) => {
        await rig.controller.start();

        expect(rig.controller.state).toEqual({ kind: "insufficientCatalog" });
        const row = rig.database
          .prepare(`SELECT COUNT(*) AS "total" FROM "ChallengeSession"`)
          .get() as {
          total: number;
        };
        expect(row.total).toBe(0);
      });
    });
  });
});
