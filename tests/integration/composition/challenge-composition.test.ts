import Database from "better-sqlite3";
import type { SpeechOptions } from "expo-speech";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHALLENGE_SPEECH_FAILED,
  CHALLENGE_WORD_LIMIT,
  createChallengeComposition,
  type ChallengePronunciation,
  InsufficientChallengeCatalogError,
  type ChallengeComposition,
  type ChallengeEvent,
} from "@/composition/challenge";
import {
  CHALLENGE_DURATION_MS,
  ChallengeTimeExpiredError,
} from "@/lib/domain/challenge/fixed-challenge";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import { SqliteChallengeRepository } from "@/persistence/sqlite-challenge-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { createDeviceSpeech } from "@/speech/device-speech";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const OTHER_VISITOR_ID = "visitor-other";
const CREATED_AT = "2026-11-12T10:00:00.000Z";
const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");
const EXTRA_WORD_COUNT = 16;
const UNSTUDIED_WORD_COUNT = 3;
const STUDY_TABLES = [
  "LearnerWordProgress",
  "GameSession",
  "GameSessionWord",
  "GameAnswer",
  "ReviewSession",
  "ReviewSessionWord",
  "TypingAttempt",
] as const;

const deviceVoice = vi.hoisted(() => {
  return {
    behavior: "error" as "error" | "throw" | "never-finishes",
    spoken: [] as string[],
    pending: [] as SpeechOptions[],
  };
});

vi.mock("expo-speech", () => {
  return {
    speak(text: string, options?: SpeechOptions) {
      deviceVoice.spoken.push(text);
      if (deviceVoice.behavior === "throw") {
        throw new Error("Speech engine is missing.");
      }
      if (deviceVoice.behavior === "error") {
        options?.onError?.(new Error("Speech engine died."));
        return;
      }
      deviceVoice.pending.push(options ?? {});
    },
    async getAvailableVoicesAsync() {
      throw new Error("The challenge must not look up voices.");
    },
  };
});

type StudyTables = Record<(typeof STUDY_TABLES)[number], unknown[]>;

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

interface StudiedCatalog {
  readonly studiedIds: readonly string[];
  readonly unstudiedIds: readonly string[];
  readonly inactiveId: string;
}

function seedStudiedCatalog(filePath: string): StudiedCatalog {
  const database = new Database(filePath);
  try {
    const insertWord = database.prepare(
      `INSERT INTO "Word" ("id", "english", "portuguese", "englishNormalized",
         "portugueseNormalized", "exampleSentence", "active", "updatedAt")
       VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`,
    );
    const extraIds = Array.from({ length: EXTRA_WORD_COUNT }, (_, index) => {
      const id = `extra-word-${String(index + 1).padStart(2, "0")}`;
      insertWord.run(
        id,
        `extra ${index}`,
        `extra pt ${index}`,
        `extra ${index}`,
        `extra pt ${index}`,
        CREATED_AT,
      );
      return id;
    });
    const allIds = [...vocabularySeed.map(({ id }) => id), ...extraIds];
    const unstudiedIds = allIds.slice(0, UNSTUDIED_WORD_COUNT);
    const scheduledIds = allIds.slice(UNSTUDIED_WORD_COUNT);
    const inactiveId = scheduledIds[0];
    if (inactiveId === undefined) {
      throw new Error("Scheduled words are missing.");
    }
    const insertProgress = database.prepare(
      `INSERT INTO "LearnerWordProgress" (
         "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
         "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
         "reviewRepetitions", "reviewIntervalDays", "reviewState", "updatedAt"
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, 6, ?, ?)`,
    );
    scheduledIds.forEach((wordId, index) => {
      const isDue = index % 3 === 0;
      const nextReviewAt = isDue ? "2026-11-11T10:00:00.000Z" : "2026-11-20T10:00:00.000Z";
      const wrongCount = index % 4;
      insertProgress.run(
        VISITOR_ID,
        wordId,
        4 + wrongCount,
        4,
        wrongCount,
        6_000,
        CREATED_AT,
        nextReviewAt,
        index % 2 === 0 ? "REVIEW" : "LEARNING",
        CREATED_AT,
      );
    });
    database.prepare(`UPDATE "Word" SET "active" = 0 WHERE "id" = ?`).run(inactiveId);
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
      .run(scheduledIds[1] ?? null);
    return {
      studiedIds: scheduledIds.filter((wordId) => wordId !== inactiveId),
      unstudiedIds,
      inactiveId,
    };
  } finally {
    database.close();
  }
}

interface OpenedComposition {
  readonly composition: ChallengeComposition;
  readonly repository: SqliteChallengeRepository;
  readonly database: Database.Database;
  readonly events: ChallengeEvent[];
}

async function useComposition(
  filePath: string,
  work: (opened: OpenedComposition) => Promise<void>,
  options: {
    readonly ids?: readonly string[];
    readonly seed?: number;
    readonly speech?: (events: ChallengeEvent[]) => ChallengePronunciation;
  } = {},
): Promise<void> {
  const database = new Database(filePath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const executor = createBetterSqliteExecutor(database);
    const runInTransaction = runBetterSqliteTransaction(database);
    const clock: Clock = { now: () => new Date(OPENED_AT) };
    const repository = new SqliteChallengeRepository(executor, runInTransaction);
    const ids = [...(options.ids ?? ["challenge-1", "challenge-2", "challenge-3"])];
    const events: ChallengeEvent[] = [];
    const composition = createChallengeComposition({
      catalog: new SqliteWordCatalog(executor, seededRandom(options.seed ?? 7), clock),
      repository,
      clock,
      createId: () => {
        const id = ids.shift();
        if (id === undefined) {
          throw new Error("No more challenge ids.");
        }
        return id;
      },
      recordEvent: (event) => events.push(event),
      speech: options.speech?.(events),
    });
    await work({ composition, repository, database, events });
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

function readSessionWordIds(database: Database.Database, sessionId: string): string[] {
  const rows = database
    .prepare(
      `SELECT "wordId" FROM "ChallengeSessionWord" WHERE "sessionId" = ? ORDER BY "sequence"`,
    )
    .all(sessionId) as { wordId: string }[];
  return rows.map(({ wordId }) => wordId);
}

function countSessions(database: Database.Database): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "ChallengeSession"`).get() as {
    total: number;
  };
  return row.total;
}

function readStartedAt(database: Database.Database, sessionId: string): string | null {
  const row = database
    .prepare(`SELECT "startedAt" FROM "ChallengeSession" WHERE "id" = ?`)
    .get(sessionId) as { startedAt: string | null };
  return row.startedAt;
}

function at(offsetMs: number): Date {
  return new Date(OPENED_AT.getTime() + offsetMs);
}

describe("challenge composition on better-sqlite3", () => {
  it("does not insert a session when no word is active", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const setup = new Database(filePath);
      setup.exec(`UPDATE "Word" SET "active" = 0`);
      setup.close();
      await useComposition(filePath, async ({ composition, database, events }) => {
        await expect(composition.start(VISITOR_ID)).rejects.toBeInstanceOf(
          InsufficientChallengeCatalogError,
        );
        expect(countSessions(database)).toBe(0);
        expect(events).toEqual([]);
      });
    });
  });

  it("stores at most 40 distinct active studied words and leaves study history untouched", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const catalog = seedStudiedCatalog(filePath);
      expect(catalog.studiedIds.length).toBeGreaterThan(CHALLENGE_WORD_LIMIT);
      const before = readStudyTables(filePath);
      await useComposition(filePath, async ({ composition, database }) => {
        const round = await composition.start(VISITOR_ID);
        const stored = readSessionWordIds(database, round.challengeId);
        expect(stored).toEqual(round.wordIds);
        expect(round.words.map(({ id }) => id)).toEqual(round.wordIds);
        expect(stored).toHaveLength(CHALLENGE_WORD_LIMIT);
        expect(new Set(stored).size).toBe(stored.length);
        for (const wordId of stored) {
          expect(catalog.studiedIds).toContain(wordId);
        }
        expect(stored).not.toContain(catalog.inactiveId);
        for (const wordId of catalog.unstudiedIds) {
          expect(stored).not.toContain(wordId);
        }
      });
      expect(readStudyTables(filePath)).toEqual(before);
    });
  });

  it("puts every studied word in the round and completes it with unstudied active words", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const catalog = seedStudiedCatalog(filePath);
      const setup = new Database(filePath);
      const kept = catalog.studiedIds.slice(0, 5);
      setup
        .prepare(
          `DELETE FROM "LearnerWordProgress" WHERE "wordId" NOT IN (${kept.map(() => "?").join(", ")})`,
        )
        .run(...kept);
      setup.close();
      await useComposition(filePath, async ({ composition, database }) => {
        const round = await composition.start(VISITOR_ID);
        const stored = readSessionWordIds(database, round.challengeId);
        expect(stored).toHaveLength(CHALLENGE_WORD_LIMIT);
        expect(new Set(stored).size).toBe(stored.length);
        expect([...stored.slice(0, kept.length)].sort()).toEqual([...kept].sort());
        expect(stored).not.toContain(catalog.inactiveId);
      });
    });
  });

  it("draws unstudied active words for a learner without study history", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      const catalog = seedStudiedCatalog(filePath);
      const setup = new Database(filePath);
      setup
        .prepare(
          `INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt") VALUES (?, ?, ?)`,
        )
        .run(OTHER_VISITOR_ID, CREATED_AT, CREATED_AT);
      setup.close();
      await useComposition(filePath, async ({ composition, database }) => {
        const round = await composition.start(OTHER_VISITOR_ID);
        const stored = readSessionWordIds(database, round.challengeId);
        expect(stored).toHaveLength(CHALLENGE_WORD_LIMIT);
        expect(new Set(stored).size).toBe(stored.length);
        expect(stored).not.toContain(catalog.inactiveId);
        expect(countSessions(database)).toBe(1);
      });
    });
  });

  it("plays a round through the session and repository and matches the stored record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudiedCatalog(filePath);
      const before = readStudyTables(filePath);
      await useComposition(filePath, async ({ composition, repository, database }) => {
        const round = await composition.start(VISITOR_ID);
        const [first, second, third] = round.wordIds;
        if (first === undefined || second === undefined || third === undefined) {
          throw new Error("The round needs three words.");
        }
        await composition.begin(round.challengeId, at(1_000));
        await composition.begin(round.challengeId, at(9_000));
        expect(readStartedAt(database, round.challengeId)).toBe(at(1_000).toISOString());

        const hit = await composition.attempt(
          {
            challengeId: round.challengeId,
            attemptId: "a-1",
            promptWordId: first,
            selectedWordId: first,
          },
          at(2_000),
        );
        expect(hit.lastAttempt?.isCorrect).toBe(true);
        expect(hit.startedAt).toEqual(at(1_000));
        expect(hit.deadline).toEqual(at(1_000 + CHALLENGE_DURATION_MS));
        expect(hit.score.score).toBe(100);
        const repeated = await composition.attempt(
          {
            challengeId: round.challengeId,
            attemptId: "a-1",
            promptWordId: first,
            selectedWordId: first,
          },
          at(3_000),
        );
        expect(repeated.score).toEqual(hit.score);
        await composition.attempt(
          {
            challengeId: round.challengeId,
            attemptId: "a-2",
            promptWordId: second,
            selectedWordId: second,
          },
          at(4_000),
        );
        const miss = await composition.attempt(
          {
            challengeId: round.challengeId,
            attemptId: "a-3",
            promptWordId: third,
            selectedWordId: first,
          },
          at(1_000 + CHALLENGE_DURATION_MS),
        );
        expect(miss.lastAttempt?.isCorrect).toBe(false);
        expect(miss.score.score).toBe(210);
        await expect(
          composition.attempt(
            {
              challengeId: round.challengeId,
              attemptId: "a-4",
              promptWordId: third,
              selectedWordId: third,
            },
            at(1_000 + CHALLENGE_DURATION_MS + 1),
          ),
        ).rejects.toBeInstanceOf(ChallengeTimeExpiredError);

        const result = await composition.expire(
          round.challengeId,
          at(1_000 + CHALLENGE_DURATION_MS),
        );
        expect(result).toEqual({
          challengeId: round.challengeId,
          status: "COMPLETED",
          correctAnswers: 2,
          wrongAnswers: 1,
          accuracy: (2 / 3) * 100,
          bestStreak: 2,
          score: 210,
          previousBest: null,
          best: 210,
          isNewRecord: true,
        });
        const record = await repository.recordFor(round.challengeId);
        expect({
          score: result.score,
          previousBest: result.previousBest,
          best: result.best,
          isNewRecord: result.isNewRecord,
        }).toEqual(record);
        expect(await composition.result(round.challengeId)).toEqual(result);
        expect(
          await composition.expire(round.challengeId, at(1_000 + CHALLENGE_DURATION_MS + 5_000)),
        ).toEqual(result);
      });
      expect(readStudyTables(filePath)).toEqual(before);
    });
  });

  it("keeps an abandoned round out of the record and announces a tie as no new record", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudiedCatalog(filePath);
      const before = readStudyTables(filePath);
      await useComposition(filePath, async ({ composition, repository }) => {
        const finished = await playCorrect(composition, 2);
        const firstResult = await composition.expire(finished, at(1_000 + CHALLENGE_DURATION_MS));
        expect(firstResult.isNewRecord).toBe(true);

        const abandoned = await playCorrect(composition, 4);
        await composition.abandon(abandoned, at(10_000));
        await composition.abandon(abandoned, at(11_000));
        const abandonedResult = await composition.result(abandoned);
        expect(abandonedResult.status).toBe("ABANDONED");
        expect(abandonedResult.score).toBe(460);
        expect(abandonedResult.isNewRecord).toBe(false);
        expect(await repository.bestCompletedScore(VISITOR_ID)).toBe(210);

        const tie = await playCorrect(composition, 2);
        const tieResult = await composition.expire(tie, at(1_000 + CHALLENGE_DURATION_MS));
        expect(tieResult).toMatchObject({
          score: 210,
          previousBest: 210,
          best: 210,
          isNewRecord: false,
        });
      });
      expect(readStudyTables(filePath)).toEqual(before);
    });
  });
});

describe("challenge pronunciation on better-sqlite3", () => {
  beforeEach(() => {
    deviceVoice.behavior = "error";
    deviceVoice.spoken.length = 0;
    deviceVoice.pending.length = 0;
  });

  const deviceSpeech = (events: ChallengeEvent[]) =>
    createDeviceSpeech((event) => events.push(event));

  it.each(["error", "throw"] as const)(
    "keeps a hit stored with the same score when the device voice fails (%s)",
    async (behavior) => {
      deviceVoice.behavior = behavior;
      await withDatabaseFile(async (filePath) => {
        await createLearnerFile(filePath);
        seedStudiedCatalog(filePath);
        await useComposition(
          filePath,
          async ({ composition, repository, events }) => {
            const round = await composition.start(VISITOR_ID);
            const [first, second] = round.wordIds;
            if (first === undefined || second === undefined) {
              throw new Error("The round needs two words.");
            }
            const english = (wordId: string) =>
              round.words.find(({ id }) => id === wordId)?.english;
            await composition.begin(round.challengeId, at(1_000));
            const hit = await composition.attempt(
              {
                challengeId: round.challengeId,
                attemptId: "a-1",
                promptWordId: first,
                selectedWordId: first,
              },
              at(2_000),
            );
            const next = await composition.attempt(
              {
                challengeId: round.challengeId,
                attemptId: "a-2",
                promptWordId: second,
                selectedWordId: second,
              },
              at(3_000),
            );
            expect(hit.score.score).toBe(100);
            expect(next.score.score).toBe(210);
            expect(deviceVoice.spoken).toEqual([english(first), english(second)]);
            expect(events).toEqual([CHALLENGE_SPEECH_FAILED, CHALLENGE_SPEECH_FAILED]);

            const stored = await repository.find(round.challengeId);
            expect(stored?.challenge.attempts.map(({ attemptId }) => attemptId)).toEqual([
              "a-1",
              "a-2",
            ]);
            expect(stored?.challenge.score).toEqual(next.score);
            const result = await composition.expire(
              round.challengeId,
              at(1_000 + CHALLENGE_DURATION_MS),
            );
            expect(result).toMatchObject({ correctAnswers: 2, score: 210, isNewRecord: true });
          },
          { speech: deviceSpeech },
        );
      });
    },
  );

  it("keeps the hit when a pronunciation adapter throws past its own guard", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudiedCatalog(filePath);
      await useComposition(
        filePath,
        async ({ composition, repository, events }) => {
          const challengeId = await playCorrect(composition, 2);
          const stored = await repository.find(challengeId);
          expect(stored?.challenge.score.score).toBe(210);
          expect(events).toEqual([CHALLENGE_SPEECH_FAILED, CHALLENGE_SPEECH_FAILED]);
        },
        {
          speech: () => ({
            pronounce: () => {
              throw new Error("Broken voice adapter.");
            },
          }),
        },
      );
    });
  });

  it("does not speak on a miss or on a repeated attempt", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudiedCatalog(filePath);
      const spoken: string[] = [];
      await useComposition(
        filePath,
        async ({ composition }) => {
          const round = await composition.start(VISITOR_ID);
          const [first, second] = round.wordIds;
          if (first === undefined || second === undefined) {
            throw new Error("The round needs two words.");
          }
          await composition.begin(round.challengeId, at(1_000));
          const miss = await composition.attempt(
            {
              challengeId: round.challengeId,
              attemptId: "a-1",
              promptWordId: first,
              selectedWordId: second,
            },
            at(2_000),
          );
          expect(miss.lastAttempt?.isCorrect).toBe(false);
          expect(spoken).toEqual([]);

          await composition.attempt(
            {
              challengeId: round.challengeId,
              attemptId: "a-2",
              promptWordId: first,
              selectedWordId: first,
            },
            at(3_000),
          );
          await composition.attempt(
            {
              challengeId: round.challengeId,
              attemptId: "a-2",
              promptWordId: first,
              selectedWordId: first,
            },
            at(4_000),
          );
          expect(spoken).toEqual([round.words.find(({ id }) => id === first)?.english]);
        },
        { speech: () => ({ pronounce: (english) => spoken.push(english) }) },
      );
    });
  });

  it("finishes the round without waiting for any speech callback", async () => {
    deviceVoice.behavior = "never-finishes";
    await withDatabaseFile(async (filePath) => {
      await createLearnerFile(filePath);
      seedStudiedCatalog(filePath);
      await useComposition(
        filePath,
        async ({ composition, events }) => {
          const challengeId = await playCorrect(composition, 3);
          const result = await composition.expire(challengeId, at(1_000 + CHALLENGE_DURATION_MS));
          expect(result).toMatchObject({ status: "COMPLETED", correctAnswers: 3, score: 330 });
          expect(deviceVoice.spoken).toHaveLength(3);
          expect(deviceVoice.pending).toHaveLength(3);
          expect(events).toEqual([]);
        },
        { speech: deviceSpeech },
      );
    });
  });
});

async function playCorrect(composition: ChallengeComposition, hits: number): Promise<string> {
  const round = await composition.start(VISITOR_ID);
  await composition.begin(round.challengeId, at(1_000));
  for (const [index, wordId] of round.wordIds.slice(0, hits).entries()) {
    await composition.attempt(
      {
        challengeId: round.challengeId,
        attemptId: `${round.challengeId}-${index}`,
        promptWordId: wordId,
        selectedWordId: wordId,
      },
      at(2_000 + index * 1_000),
    );
  }
  return round.challengeId;
}
