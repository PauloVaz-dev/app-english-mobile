import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CHALLENGE_DURATION_MS, FixedChallenge } from "@/lib/domain/challenge/fixed-challenge";
import { SessionEndedError } from "@/lib/domain/game/errors";
import type { Clock } from "@/lib/domain/game/types";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SUPPORTED_SCHEMA_VERSION } from "@/persistence/migrate";
import {
  ChallengeNotStoredError,
  SqliteChallengeRepository,
  StoredAttemptsMismatchError,
} from "@/persistence/sqlite-challenge-repository";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const CREATED_AT = "2026-11-12T10:00:00.000Z";
const FIXED_LEVEL = 1;
const CHALLENGE_SESSION_COLUMNS = [
  "id",
  "visitorId",
  "level",
  "status",
  "score",
  "bestStreak",
  "correctAnswers",
  "wrongAnswers",
  "createdAt",
  "startedAt",
  "finishedAt",
];

class FakeClock implements Clock {
  private current: Date;

  constructor(start: string) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

const WORD_IDS = vocabularySeed.slice(0, 6).map(({ id }) => id);

function wordAt(index: number): string {
  const wordId = WORD_IDS[index];
  if (wordId === undefined) {
    throw new Error(`Seed word ${index} is missing.`);
  }
  return wordId;
}

interface PlannedAnswer {
  readonly wordIndex: number;
  readonly isCorrect: boolean;
}

function plan(outcomes: readonly boolean[]): PlannedAnswer[] {
  return outcomes.map((isCorrect, index) => ({ wordIndex: index % WORD_IDS.length, isCorrect }));
}

interface PlayedChallenge {
  readonly challenge: FixedChallenge;
  readonly clock: FakeClock;
}

async function playChallenge(
  repository: SqliteChallengeRepository,
  input: {
    readonly id: string;
    readonly start: string;
    readonly answers: readonly PlannedAnswer[];
  },
): Promise<PlayedChallenge> {
  const clock = new FakeClock(input.start);
  const challenge = FixedChallenge.create({ id: input.id, visitorId: VISITOR_ID }, clock);
  await repository.create(challenge, WORD_IDS);
  clock.advance(500);
  challenge.begin(clock);
  await repository.save(challenge);
  input.answers.forEach((planned, index) => {
    clock.advance(1_000);
    const promptWordId = wordAt(planned.wordIndex);
    const selectedWordId = planned.isCorrect
      ? promptWordId
      : wordAt((planned.wordIndex + 1) % WORD_IDS.length);
    challenge.recordAttempt(
      { attemptId: `${input.id}-attempt-${index + 1}`, promptWordId, selectedWordId },
      clock,
    );
  });
  await repository.save(challenge);
  return { challenge, clock };
}

async function completeChallenge(
  repository: SqliteChallengeRepository,
  input: {
    readonly id: string;
    readonly start: string;
    readonly answers: readonly PlannedAnswer[];
  },
): Promise<FixedChallenge> {
  const { challenge, clock } = await playChallenge(repository, input);
  clock.advance(CHALLENGE_DURATION_MS);
  challenge.expire(clock);
  await repository.save(challenge);
  return challenge;
}

async function abandonChallenge(
  repository: SqliteChallengeRepository,
  input: {
    readonly id: string;
    readonly start: string;
    readonly answers: readonly PlannedAnswer[];
  },
): Promise<FixedChallenge> {
  const { challenge, clock } = await playChallenge(repository, input);
  clock.advance(1_000);
  challenge.abandon(clock);
  await repository.save(challenge);
  return challenge;
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

async function useFile(
  filePath: string,
  work: (repository: SqliteChallengeRepository, database: Database.Database) => Promise<void>,
): Promise<void> {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const repository = new SqliteChallengeRepository(
      createBetterSqliteExecutor(database),
      runBetterSqliteTransaction(database),
    );
    await work(repository, database);
  } finally {
    database.close();
  }
}

describe("sqlite challenge repository", () => {
  it("keeps a completed challenge and its record after the file is closed and opened", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      let expected: FixedChallenge | undefined;
      await useFile(filePath, async (repository) => {
        expected = await completeChallenge(repository, {
          id: "challenge-first",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true, true, false, true]),
        });
        expect(expected.score.score).toBe(310);
      });
      await useFile(filePath, async (repository, database) => {
        const stored = await repository.find("challenge-first");
        if (stored === null || expected === undefined) {
          throw new Error("Challenge was not stored.");
        }
        expect(stored.wordIds).toEqual(WORD_IDS);
        expect(stored.challenge.status).toBe("COMPLETED");
        expect(stored.challenge.visitorId).toBe(VISITOR_ID);
        expect(stored.challenge.createdAt).toEqual(expected.createdAt);
        expect(stored.challenge.startedAt).toEqual(expected.startedAt);
        expect(stored.challenge.deadline).toEqual(expected.deadline);
        expect(stored.challenge.finishedAt).toEqual(expected.deadline);
        expect(stored.challenge.attempts).toEqual(expected.attempts);
        expect(stored.challenge.score).toEqual(expected.score);
        expect(readSession(database, "challenge-first")).toEqual({
          level: FIXED_LEVEL,
          status: "COMPLETED",
          score: 310,
          bestStreak: 2,
          correctAnswers: 3,
          wrongAnswers: 1,
        });
        expect(readCompletedWordIds(database, "challenge-first")).toEqual([
          wordAt(0),
          wordAt(1),
          wordAt(3),
        ]);
        expect(await repository.bestCompletedScore(VISITOR_ID)).toBe(310);
        expect(await repository.recordFor("challenge-first")).toEqual({
          score: 310,
          previousBest: null,
          best: 310,
          isNewRecord: true,
        });
      });
      await useFile(filePath, async (repository) => {
        expect(await repository.recordFor("challenge-first")).toEqual({
          score: 310,
          previousBest: null,
          best: 310,
          isNewRecord: true,
        });
      });
    });
  });

  it("leaves an abandoned challenge out of the record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository) => {
        await completeChallenge(repository, {
          id: "challenge-completed",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true, true]),
        });
        const abandoned = await abandonChallenge(repository, {
          id: "challenge-abandoned",
          start: "2026-11-12T13:00:00.000Z",
          answers: plan([true, true, true, true, true]),
        });
        expect(abandoned.score.score).toBe(600);
      });
      await useFile(filePath, async (repository, database) => {
        expect(readSession(database, "challenge-abandoned").status).toBe("ABANDONED");
        expect(await repository.bestCompletedScore(VISITOR_ID)).toBe(210);
        expect(await repository.recordFor("challenge-abandoned")).toEqual({
          score: 600,
          previousBest: 210,
          best: 210,
          isNewRecord: false,
        });
        expect(await repository.recordFor("challenge-completed")).toEqual({
          score: 210,
          previousBest: null,
          best: 210,
          isNewRecord: true,
        });
      });
    });
  });

  it("does not announce a tie as a new record and keeps earlier results stable", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository) => {
        await completeChallenge(repository, {
          id: "challenge-a",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true, true]),
        });
        await completeChallenge(repository, {
          id: "challenge-b",
          start: "2026-11-12T13:00:00.000Z",
          answers: plan([true, false, true, true]),
        });
        await completeChallenge(repository, {
          id: "challenge-c",
          start: "2026-11-12T14:00:00.000Z",
          answers: plan([true, true, true]),
        });
      });
      await useFile(filePath, async (repository) => {
        expect(await repository.recordFor("challenge-a")).toEqual({
          score: 210,
          previousBest: null,
          best: 210,
          isNewRecord: true,
        });
        expect(await repository.recordFor("challenge-b")).toEqual({
          score: 310,
          previousBest: 210,
          best: 310,
          isNewRecord: true,
        });
        expect(await repository.recordFor("challenge-c")).toEqual({
          score: 330,
          previousBest: 310,
          best: 330,
          isNewRecord: true,
        });
        expect(await repository.bestCompletedScore(VISITOR_ID)).toBe(330);
      });
      await useFile(filePath, async (repository) => {
        await completeChallenge(repository, {
          id: "challenge-tie",
          start: "2026-11-12T15:00:00.000Z",
          answers: plan([true, true, true]),
        });
        expect(await repository.recordFor("challenge-tie")).toEqual({
          score: 330,
          previousBest: 330,
          best: 330,
          isNewRecord: false,
        });
      });
      await useFile(filePath, async (repository) => {
        expect(await repository.recordFor("challenge-tie")).toEqual({
          score: 330,
          previousBest: 330,
          best: 330,
          isNewRecord: false,
        });
      });
    });
  });

  it("saves the same attempts once and refuses to rewrite a finished challenge", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository, database) => {
        const challenge = await completeChallenge(repository, {
          id: "challenge-once",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true, false, true]),
        });
        await repository.save(challenge);
        expect(readAttemptCount(database, "challenge-once")).toBe(3);
        const other = FixedChallenge.create(
          { id: "challenge-once", visitorId: VISITOR_ID },
          new FakeClock("2026-11-12T12:00:00.000Z"),
        );
        other.abandon(new FakeClock("2026-11-12T12:00:01.000Z"));
        await expect(repository.save(other)).rejects.toBeInstanceOf(SessionEndedError);
        expect(readSession(database, "challenge-once").status).toBe("COMPLETED");
      });
    });
  });

  it("returns null for an unknown challenge and refuses to save it", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository) => {
        const clock = new FakeClock("2026-11-12T12:00:00.000Z");
        const challenge = FixedChallenge.create(
          { id: "challenge-ghost", visitorId: VISITOR_ID },
          clock,
        );
        expect(await repository.find("challenge-ghost")).toBeNull();
        await expect(repository.save(challenge)).rejects.toBeInstanceOf(ChallengeNotStoredError);
        await expect(repository.recordFor("challenge-ghost")).rejects.toBeInstanceOf(
          ChallengeNotStoredError,
        );
        expect(await repository.bestCompletedScore(VISITOR_ID)).toBeNull();
      });
    });
  });

  it("leaves progress and review schedule rows unchanged after challenge attempts", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudyHistory(filePath);
      const before = readStudyTables(filePath);
      expect(before.LearnerWordProgress).toHaveLength(2);
      await useFile(filePath, async (repository) => {
        await completeChallenge(repository, {
          id: "challenge-study",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true, false, true, true, false, true]),
        });
        await abandonChallenge(repository, {
          id: "challenge-study-abandoned",
          start: "2026-11-12T13:00:00.000Z",
          answers: plan([false, true]),
        });
      });
      expect(readStudyTables(filePath)).toEqual(before);
    });
  });

  it("refuses to save attempts that differ from the stored ones", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository, database) => {
        const { challenge } = await playChallenge(repository, {
          id: "challenge-diverged",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true]),
        });
        const clock = new FakeClock("2026-11-12T12:00:00.000Z");
        const diverged = FixedChallenge.create(
          { id: "challenge-diverged", visitorId: VISITOR_ID },
          clock,
        );
        diverged.begin(clock);
        diverged.recordAttempt(
          { attemptId: "other-attempt", promptWordId: wordAt(0), selectedWordId: wordAt(0) },
          clock,
        );
        await expect(repository.save(diverged)).rejects.toBeInstanceOf(StoredAttemptsMismatchError);
        expect(readAttemptCount(database, challenge.id)).toBe(1);
      });
    });
  });

  it("uses the version 1 tables without a new migration or record column", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      await useFile(filePath, async (repository, database) => {
        await completeChallenge(repository, {
          id: "challenge-schema",
          start: "2026-11-12T12:00:00.000Z",
          answers: plan([true]),
        });
        const version = database.prepare("PRAGMA user_version").get() as { user_version: number };
        expect(version.user_version).toBe(SUPPORTED_SCHEMA_VERSION);
        expect(SUPPORTED_SCHEMA_VERSION).toBe(1);
        const columns = database.prepare(`PRAGMA table_info("ChallengeSession")`).all() as {
          name: string;
        }[];
        expect(columns.map(({ name }) => name)).toEqual(CHALLENGE_SESSION_COLUMNS);
      });
    });
  });
});

interface SessionRow {
  level: number;
  status: string;
  score: number;
  bestStreak: number;
  correctAnswers: number;
  wrongAnswers: number;
}

function readSession(database: Database.Database, sessionId: string): SessionRow {
  return database
    .prepare(
      `SELECT "level", "status", "score", "bestStreak", "correctAnswers", "wrongAnswers"
       FROM "ChallengeSession"
       WHERE "id" = ?`,
    )
    .get(sessionId) as SessionRow;
}

function readCompletedWordIds(database: Database.Database, sessionId: string): string[] {
  const rows = database
    .prepare(
      `SELECT "wordId" FROM "ChallengeSessionWord"
       WHERE "sessionId" = ? AND "completedAt" IS NOT NULL
       ORDER BY "sequence"`,
    )
    .all(sessionId) as { wordId: string }[];
  return rows.map(({ wordId }) => wordId);
}

function readAttemptCount(database: Database.Database, sessionId: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS "total" FROM "ChallengeAttempt" WHERE "sessionId" = ?`)
    .get(sessionId) as { total: number };
  return row.total;
}

const STUDY_TABLES = [
  "LearnerWordProgress",
  "GameSession",
  "GameSessionWord",
  "GameAnswer",
  "ReviewSession",
  "ReviewSessionWord",
  "TypingAttempt",
] as const;

type StudyTables = Record<(typeof STUDY_TABLES)[number], unknown[]>;

function seedStudyHistory(filePath: string): void {
  const database = new Database(filePath);
  try {
    const progress = database.prepare(
      `INSERT INTO "LearnerWordProgress" (
         "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
         "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
         "reviewRepetitions", "reviewIntervalDays", "reviewState", "updatedAt"
       ) VALUES (?, ?, 4, 3, 1, 5400, ?, ?, 2, 6, 'REVIEW', ?)`,
    );
    progress.run(VISITOR_ID, wordAt(0), CREATED_AT, "2026-11-13T10:00:00.000Z", CREATED_AT);
    progress.run(VISITOR_ID, wordAt(1), CREATED_AT, "2026-11-18T10:00:00.000Z", CREATED_AT);
    database
      .prepare(
        `INSERT INTO "ReviewSession" ("id", "visitorId", "localDate", "timeZone", "status", "startedAt")
         VALUES ('review-1', ?, '2026-11-12', 'America/Sao_Paulo', 'ACTIVE', ?)`,
      )
      .run(VISITOR_ID, CREATED_AT);
    database
      .prepare(
        `INSERT INTO "ReviewSessionWord" ("sessionId", "wordId", "sequence", "stage", "origin")
         VALUES ('review-1', ?, 1, 'MATCHING', 'DUE')`,
      )
      .run(wordAt(0));
  } finally {
    database.close();
  }
}

function readStudyTables(filePath: string): StudyTables {
  const database = new Database(filePath);
  try {
    const entries = STUDY_TABLES.map((table) => [
      table,
      database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
    ]);
    return Object.fromEntries(entries) as StudyTables;
  } finally {
    database.close();
  }
}
