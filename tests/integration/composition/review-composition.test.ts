import Database from "better-sqlite3";
import type { SpeechOptions } from "expo-speech";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReviewComposition, REVIEW_SPEECH_FAILED, type ReviewComposition, type ReviewEvent } from "@/composition/review";
import { FixedChallenge } from "@/lib/domain/challenge/fixed-challenge";
import { GameSession } from "@/lib/domain/game/game-session";
import { createWord, type Clock, type Word } from "@/lib/domain/game/types";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import type { ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import { migrate } from "@/persistence/migrate";
import { SqliteChallengeRepository } from "@/persistence/sqlite-challenge-repository";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteReviewSessionRepository } from "@/persistence/sqlite-review-session-repository";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import type { SqlExecutor } from "@/persistence/sql-executor";
import { createDeviceSpeech } from "@/speech/device-speech";
import { normalizeVocabularyText } from "../../../prisma/seed-data";
import { createBetterSqliteExecutor, runBetterSqliteTransaction } from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-1";
const TIME_ZONE = DEFAULT_TIME_ZONE;
const STARTED_AT = new Date("2026-11-12T15:00:00.000Z");
const GOOD_RESPONSE_MS = 3_000;
const FAST_RESPONSE_MS = 500;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const ACTIVE_WORD = 1;
const FUTURE_OFFSET_DAYS = 40;

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

class ManualClock implements Clock {
  private instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  advance(milliseconds: number): void {
    this.instant = new Date(this.instant.getTime() + milliseconds);
  }

  set(instant: Date): void {
    this.instant = new Date(instant);
  }
}

interface Agenda {
  readonly nextReviewAt: string | null;
  readonly reviewState: string;
  readonly reviewRepetitions: number;
  readonly reviewLapses: number;
  readonly reviewIntervalDays: number;
  readonly reviewEaseFactor: number;
}

interface OpenedReviewFile {
  readonly database: Database.Database;
  readonly executor: SqlExecutor;
  readonly clock: ManualClock;
  readonly composition: ReviewComposition;
  readonly events: ReviewEvent[];
  readonly games: SqliteGameSessionRepository;
  readonly challenges: SqliteChallengeRepository;
}

describe("review composition against sqlite", () => {
  beforeEach(() => {
    deviceVoice.spoken.length = 0;
  });

  it("leaves a word at least seven days out after three hits on different days", async () => {
    await withReview(async ({ composition, clock, database }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", "An apple.");
      insertWord(database, "river", "river", "rio", null);
      insertWord(database, "stone", "stone", "pedra", null);
      insertProgress(database, "river", futureSchedule(FUTURE_OFFSET_DAYS));
      insertProgress(database, "stone", futureSchedule(FUTURE_OFFSET_DAYS + 1));
      const riverBefore = readAgenda(database, "river");
      const stoneBefore = readAgenda(database, "stone");

      await playMatching(composition, database, "apple");
      const afterFirst = readAgenda(database, "apple");
      expect(afterFirst?.reviewState).toBe("LEARNING");
      expect(afterFirst?.reviewRepetitions).toBe(1);
      expect(readAgenda(database, "river")).toEqual(riverBefore);
      expect(readAgenda(database, "stone")).toEqual(stoneBefore);

      clock.set(new Date(new Date(afterFirst?.nextReviewAt ?? "").getTime() + HOUR_MS));
      await playMatching(composition, database, "apple");
      const afterSecond = readAgenda(database, "apple");
      expect(afterSecond?.reviewState).toBe("REVIEW");
      expect(afterSecond?.reviewIntervalDays).toBe(6);

      const thirdDay = new Date(afterSecond?.nextReviewAt ?? "");
      clock.set(new Date(thirdDay.getTime() + HOUR_MS));
      const reviewedAt = clock.now();
      await playTyping(composition, "apple", "apple");
      const afterThird = readAgenda(database, "apple");
      expect(afterThird?.reviewIntervalDays).toBeGreaterThanOrEqual(7);
      expect(new Date(afterThird?.nextReviewAt ?? "").getTime() - reviewedAt.getTime()).toBeGreaterThanOrEqual(
        SEVEN_DAYS_MS,
      );

      clock.advance(DAY_MS);
      expect(await composition.start(VISITOR_ID)).toEqual({
        kind: "nothing",
        message: "nada para revisar",
      });
    });
  });

  it("keeps the grade and drops the answered word when a review is closed and started again", async () => {
    await withReview(async ({ composition, database }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", null);
      insertWord(database, "book", "book", "livro", null);
      insertProgress(database, "apple", dueReview());
      insertProgress(database, "book", dueReview());

      const first = await composition.start(VISITOR_ID);
      if (first.kind !== "opened") {
        throw new Error("Expected a typing review.");
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
      const second = await composition.start(VISITOR_ID);
      if (second.kind !== "opened") {
        throw new Error("Expected the remaining word.");
      }

      expect(readStatus(database, first.view.id)).toBe("ABANDONED");
      expect(readTyping(database, "attempt-apple")).toMatchObject({
        grade: "GOOD",
        isReinforcement: 0,
        responseTimeMs: GOOD_RESPONSE_MS,
      });
      expect(readSessionWords(database, second.view.id)).toEqual(["book"]);
      expect(readSessionWords(database, first.view.id)).toContain("apple");
    });
  });

  it("stores the measured time, a hint cap, a miss and one reinforcement", async () => {
    await withReview(async ({ composition, database }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", "An apple.");
      insertProgress(database, "apple", dueReview());
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
        responseTimeMs: 4_200,
      });
      const afterMiss = readAgenda(database, "apple");
      const reinforced = await composition.type({
        sessionId: opening.view.id,
        attemptId: "attempt-again",
        wordId: "apple",
        kind: "answer",
        typed: "apple",
        usedHint: false,
        responseTimeMs: FAST_RESPONSE_MS,
      });

      expect(missed).toMatchObject({ outcome: "DONT_KNOW", isReinforcement: false });
      expect(missed.typing.reinforcement).toBe(true);
      expect(reinforced.isReinforcement).toBe(true);
      expect(readTyping(database, "attempt-miss")).toMatchObject({
        grade: "AGAIN",
        responseTimeMs: 4_200,
        isReinforcement: 0,
      });
      expect(readTyping(database, "attempt-again")?.isReinforcement).toBe(1);
      expect(readAgenda(database, "apple")).toEqual(afterMiss);
      expect(deviceVoice.spoken).toEqual(["apple", "apple"]);
    });
  });

  it("caps a hinted answer at hard and reports the session result", async () => {
    await withReview(async ({ composition, database }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", null);
      insertWord(database, "book", "book", "livro", null);
      insertProgress(database, "apple", dueReview());
      insertProgress(database, "book", dueReview());
      const opening = await composition.start(VISITOR_ID);
      if (opening.kind !== "opened") {
        throw new Error("Expected a typing review.");
      }
      await composition.type({
        sessionId: opening.view.id,
        attemptId: "attempt-apple",
        wordId: "apple",
        kind: "answer",
        typed: "APPLE",
        usedHint: true,
        responseTimeMs: FAST_RESPONSE_MS,
      });
      await composition.type({
        sessionId: opening.view.id,
        attemptId: "attempt-book",
        wordId: "book",
        kind: "answer",
        typed: "wrong",
        usedHint: false,
        responseTimeMs: 4_200,
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

      expect(readTyping(database, "attempt-apple")?.grade).toBe("HARD");
      expect(result).toMatchObject({
        correctAnswers: 1,
        wrongAnswers: 1,
        remainingDueToday: 0,
      });
      expect(result.nextReviewAt).toEqual(expect.any(String));
    });
  });

  it("adds distractors below three scheduled words and leaves their agenda unchanged", async () => {
    await withReview(async ({ composition, database }) => {
      insertVisitor(database);
      insertWord(database, "house", "house", "casa", null);
      insertWord(database, "river", "river", "rio", null);
      insertWord(database, "stone", "stone", "pedra", null);
      insertProgress(database, "house", dueLearning());
      insertProgress(database, "river", futureSchedule(FUTURE_OFFSET_DAYS));
      insertProgress(database, "stone", futureSchedule(FUTURE_OFFSET_DAYS + 1));
      const riverBefore = readAgenda(database, "river");
      const stoneBefore = readAgenda(database, "stone");

      const opening = await composition.start(VISITOR_ID);
      if (opening.kind !== "opened" || opening.view.gameSessionId === null) {
        throw new Error("Expected a matching review.");
      }
      expect(opening.distractorCount).toBe(2);
      expect(readGraded(database, opening.view.gameSessionId)).toEqual([
        { wordId: "house", graded: 1 },
        { wordId: "river", graded: 0 },
        { wordId: "stone", graded: 0 },
      ]);
      await playBoard(composition, database, opening.view.gameSessionId, "house");
      await composition.finish(opening.view.id);

      expect(readAgenda(database, "river")).toEqual(riverBefore);
      expect(readAgenda(database, "stone")).toEqual(stoneBefore);
      expect(readAgenda(database, "house")?.nextReviewAt).not.toEqual(riverBefore?.nextReviewAt);
    });
  });

  it("leaves the agenda untouched for free practice and the challenge", async () => {
    await withReview(async ({ database, clock, executor, games, challenges }) => {
      insertVisitor(database);
      insertWord(database, "apple", "apple", "maçã", null);
      insertWord(database, "book", "book", "livro", null);
      insertWord(database, "house", "house", "casa", null);
      insertProgress(database, "apple", dueReview());
      const before = readAgenda(database, "apple");
      const words = [
        createWord({ id: "apple", english: "apple", portuguese: "maçã" }),
        createWord({ id: "book", english: "book", portuguese: "livro" }),
        createWord({ id: "house", english: "house", portuguese: "casa" }),
      ];
      await playFree(games, clock, words);
      expect(readAgenda(database, "apple")).toEqual(before);

      await playChallenge(challenges, executor, clock, words);
      expect(readAgenda(database, "apple")).toEqual(before);
      expect(readAgenda(database, "book")?.nextReviewAt ?? null).toBeNull();
    });
  });
});

async function withReview(verify: (opened: OpenedReviewFile) => Promise<void>): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      const runInTransaction = runBetterSqliteTransaction(database);
      await migrate(executor, runInTransaction);
      const clock = new ManualClock(STARTED_AT);
      const events: ReviewEvent[] = [];
      const recordEvent = (event: ReviewEvent) => {
        events.push(event);
      };
      let sequence = 0;
      const composition = createReviewComposition({
        repository: new SqliteReviewSessionRepository(executor, runInTransaction, clock),
        reader: new SqliteDailyReviewReader(executor),
        preferences: new SqliteVisitorPreferences(executor),
        board: new SqliteGameSessionRepository(executor, runInTransaction, clock),
        clock,
        createId: () => {
          sequence += 1;
          return `review-${sequence}`;
        },
        resolveTimeZone: async () => TIME_ZONE,
        recordEvent,
        speech: createDeviceSpeech(() => recordEvent(REVIEW_SPEECH_FAILED)),
      });
      await verify({
        database,
        executor,
        clock,
        composition,
        events,
        games: new SqliteGameSessionRepository(executor, runInTransaction, clock),
        challenges: new SqliteChallengeRepository(executor, runInTransaction),
      });
    } finally {
      database.close();
    }
  });
}

async function playMatching(
  composition: ReviewComposition,
  database: Database.Database,
  wordId: string,
): Promise<void> {
  const opening = await composition.start(VISITOR_ID);
  if (opening.kind !== "opened" || opening.view.gameSessionId === null) {
    throw new Error(`Expected ${wordId} on a matching board.`);
  }
  await playBoard(composition, database, opening.view.gameSessionId, wordId);
  await composition.finish(opening.view.id);
}

async function playBoard(
  composition: ReviewComposition,
  database: Database.Database,
  gameId: string,
  gradedWordId: string,
): Promise<void> {
  const ids = readGameWords(database, gameId);
  await composition.expose(gameId, ids);
  await composition.match(pair(gameId, gradedWordId));
  for (const wordId of ids) {
    if (wordId === gradedWordId) {
      continue;
    }
    await composition.match(pair(gameId, wordId));
  }
}

function pair(gameId: string, wordId: string) {
  return {
    sessionId: gameId,
    attemptId: `pair-${gameId}-${wordId}`,
    promptWordId: wordId,
    selectedWordId: wordId,
    responseTimeMs: GOOD_RESPONSE_MS,
  };
}

async function playTyping(composition: ReviewComposition, wordId: string, english: string): Promise<void> {
  const opening = await composition.start(VISITOR_ID);
  if (opening.kind !== "opened") {
    throw new Error(`Expected to type ${wordId}.`);
  }
  await composition.type({
    sessionId: opening.view.id,
    attemptId: `type-${opening.view.id}`,
    wordId,
    kind: "answer",
    typed: english,
    usedHint: false,
    responseTimeMs: GOOD_RESPONSE_MS,
  });
  await composition.finish(opening.view.id);
}

async function playFree(
  games: SqliteGameSessionRepository,
  clock: ManualClock,
  words: readonly Word[],
): Promise<void> {
  const session = GameSession.start({ id: "free-1", visitorId: VISITOR_ID, words, mode: "FREE" }, clock);
  await games.create(session);
  clock.advance(1_000);
  await games.recordExposures({ sessionId: session.id, wordIds: ["apple", "book"] });
  clock.advance(1_000);
  await games.recordAttempt({
    sessionId: session.id,
    attemptId: "free-apple",
    promptWordId: "apple",
    selectedWordId: "apple",
    responseTimeMs: FAST_RESPONSE_MS,
  });
}

async function playChallenge(
  challenges: SqliteChallengeRepository,
  executor: SqlExecutor,
  clock: ManualClock,
  words: readonly Word[],
): Promise<void> {
  const created = FixedChallenge.create({ id: "challenge-1", visitorId: VISITOR_ID }, clock);
  await challenges.create(created, words.map((entry) => entry.id));
  const stored = await challenges.find("challenge-1");
  if (stored === null) {
    throw new Error("Challenge was not stored.");
  }
  stored.challenge.begin(clock);
  stored.challenge.recordAttempt(
    { attemptId: "challenge-apple", promptWordId: "apple", selectedWordId: "apple" },
    clock,
  );
  await challenges.save(stored.challenge);
  const attempts = await executor.getAll<{ total: number }>(
    `SELECT COUNT(*) AS "total" FROM "ChallengeAttempt" WHERE "sessionId" = ?`,
    ["challenge-1"],
  );
  if (attempts[0]?.total !== 1) {
    throw new Error("Challenge attempt was not stored.");
  }
}

function insertVisitor(database: Database.Database): void {
  database.prepare(`INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt") VALUES (?, ?, ?)`).run(
    VISITOR_ID,
    STARTED_AT.toISOString(),
    STARTED_AT.toISOString(),
  );
}

function insertWord(
  database: Database.Database,
  id: string,
  english: string,
  portuguese: string,
  exampleSentence: string | null,
): void {
  const storedAt = STARTED_AT.toISOString();
  database
    .prepare(
      `INSERT INTO "Word" (
        "id", "english", "portuguese", "englishNormalized", "portugueseNormalized",
        "exampleSentence", "active", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      english,
      portuguese,
      normalizeVocabularyText(english),
      normalizeVocabularyText(portuguese),
      exampleSentence,
      ACTIVE_WORD,
      storedAt,
      storedAt,
    );
}

function insertProgress(database: Database.Database, wordId: string, schedule: ReviewSchedule): void {
  database
    .prepare(
      `INSERT INTO "LearnerWordProgress" (
        "visitorId", "wordId", "timesShown", "correctCount", "wrongCount",
        "totalCorrectResponseTimeMs", "lastReviewedAt", "nextReviewAt",
        "reviewRepetitions", "reviewLapses", "reviewIntervalDays", "reviewEaseFactor",
        "reviewState", "updatedAt"
      ) VALUES (?, ?, 1, 1, 0, 0, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      VISITOR_ID,
      wordId,
      schedule.nextReviewAt.toISOString(),
      schedule.repetitions,
      schedule.lapses,
      schedule.intervalDays,
      schedule.easeFactor,
      schedule.state,
      STARTED_AT.toISOString(),
    );
}

function dueReview(): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: 6,
    easeFactor: 2.5,
    nextReviewAt: new Date("2026-11-12T03:00:00.000Z"),
  };
}

function dueLearning(): ReviewSchedule {
  return {
    state: "LEARNING",
    repetitions: 0,
    lapses: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    nextReviewAt: new Date("2026-11-12T03:00:00.000Z"),
  };
}

function futureSchedule(daysAhead: number): ReviewSchedule {
  return {
    state: "REVIEW",
    repetitions: 2,
    lapses: 0,
    intervalDays: daysAhead,
    easeFactor: 2.5,
    nextReviewAt: new Date(STARTED_AT.getTime() + daysAhead * DAY_MS),
  };
}

function readAgenda(database: Database.Database, wordId: string): Agenda | null {
  const row = database
    .prepare(
      `SELECT "nextReviewAt", "reviewState", "reviewRepetitions", "reviewLapses",
              "reviewIntervalDays", "reviewEaseFactor"
       FROM "LearnerWordProgress" WHERE "visitorId" = ? AND "wordId" = ?`,
    )
    .get(VISITOR_ID, wordId) as Agenda | undefined;
  return row ?? null;
}

function readStatus(database: Database.Database, sessionId: string): string | null {
  const row = database.prepare(`SELECT "status" FROM "ReviewSession" WHERE "id" = ?`).get(sessionId) as
    | { status: string }
    | undefined;
  return row?.status ?? null;
}

function readSessionWords(database: Database.Database, sessionId: string): string[] {
  const rows = database
    .prepare(`SELECT "wordId" FROM "ReviewSessionWord" WHERE "sessionId" = ? ORDER BY "sequence"`)
    .all(sessionId) as { wordId: string }[];
  return rows.map((row) => row.wordId);
}

function readGameWords(database: Database.Database, gameId: string): string[] {
  const rows = database
    .prepare(`SELECT "wordId" FROM "GameSessionWord" WHERE "sessionId" = ? ORDER BY "sequence"`)
    .all(gameId) as { wordId: string }[];
  return rows.map((row) => row.wordId);
}

function readGraded(database: Database.Database, gameId: string): { wordId: string; graded: number }[] {
  return database
    .prepare(`SELECT "wordId", "graded" FROM "GameSessionWord" WHERE "sessionId" = ? ORDER BY "sequence"`)
    .all(gameId) as { wordId: string; graded: number }[];
}

function readTyping(database: Database.Database, attemptId: string): {
  grade: string | null;
  isReinforcement: number;
  responseTimeMs: number;
} | null {
  const row = database
    .prepare(`SELECT "grade", "isReinforcement", "responseTimeMs" FROM "TypingAttempt" WHERE "attemptId" = ?`)
    .get(attemptId) as { grade: string | null; isReinforcement: number; responseTimeMs: number } | undefined;
  return row ?? null;
}
