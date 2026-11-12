import {
  type ChallengeAttempt,
  compareWithRecord,
  FixedChallenge,
  type FixedChallengeStatus,
} from "@/lib/domain/challenge/fixed-challenge";
import { SessionEndedError } from "@/lib/domain/game/errors";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";

export const FIXED_CHALLENGE_LEVEL = 1;

const INSERT_SESSION = `
INSERT INTO "ChallengeSession" (
  "id", "visitorId", "level", "status", "score", "bestStreak",
  "correctAnswers", "wrongAnswers", "createdAt", "startedAt", "finishedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_SESSION_WORD = `
INSERT INTO "ChallengeSessionWord" ("sessionId", "wordId", "sequence", "completedAt")
VALUES (?, ?, ?, NULL)
`;

const SELECT_SESSION = `
SELECT "id", "visitorId", "status", "score", "createdAt", "startedAt", "finishedAt"
FROM "ChallengeSession"
WHERE "id" = ?
`;

const SELECT_SESSION_WORDS = `
SELECT "wordId"
FROM "ChallengeSessionWord"
WHERE "sessionId" = ?
ORDER BY "sequence"
`;

const SELECT_ATTEMPTS = `
SELECT "attemptId", "promptWordId", "selectedWordId", "isCorrect", "createdAt"
FROM "ChallengeAttempt"
WHERE "sessionId" = ?
ORDER BY "sequence"
`;

const UPDATE_SESSION = `
UPDATE "ChallengeSession"
SET "status" = ?, "score" = ?, "bestStreak" = ?, "correctAnswers" = ?,
    "wrongAnswers" = ?, "startedAt" = ?, "finishedAt" = ?
WHERE "id" = ? AND "status" = 'ACTIVE'
`;

const INSERT_ATTEMPT = `
INSERT INTO "ChallengeAttempt" (
  "id", "attemptId", "sessionId", "sequence", "promptWordId",
  "selectedWordId", "isCorrect", "createdAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const COMPLETE_SESSION_WORD = `
UPDATE "ChallengeSessionWord"
SET "completedAt" = ?
WHERE "sessionId" = ? AND "wordId" = ? AND "completedAt" IS NULL
`;

const SELECT_BEST_COMPLETED_SCORE = `
SELECT MAX("score") AS "best"
FROM "ChallengeSession"
WHERE "visitorId" = ? AND "status" = 'COMPLETED'
`;

const SELECT_PREVIOUS_BEST_SCORE = `
SELECT MAX("score") AS "best"
FROM "ChallengeSession"
WHERE "visitorId" = ?
  AND "status" = 'COMPLETED'
  AND "id" <> ?
  AND ("finishedAt" < ? OR ("finishedAt" = ? AND "id" < ?))
`;

export class ChallengeNotStoredError extends Error {
  readonly name = "ChallengeNotStoredError";

  constructor(readonly challengeId: string) {
    super(`Challenge ${challengeId} was not stored.`);
  }
}

export class StoredAttemptsMismatchError extends Error {
  readonly name = "StoredAttemptsMismatchError";

  constructor(readonly challengeId: string) {
    super(`Challenge ${challengeId} has stored attempts that differ from the session.`);
  }
}

export interface StoredChallenge {
  readonly challenge: FixedChallenge;
  readonly wordIds: readonly string[];
}

export interface ChallengeRecordView {
  readonly score: number;
  readonly previousBest: number | null;
  readonly best: number | null;
  readonly isNewRecord: boolean;
}

interface SessionRow {
  id: string;
  visitorId: string;
  status: FixedChallengeStatus;
  score: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

interface SessionWordRow {
  wordId: string;
}

interface AttemptRow {
  attemptId: string;
  promptWordId: string;
  selectedWordId: string;
  isCorrect: number;
  createdAt: string;
}

interface BestScoreRow {
  best: number | null;
}

export class SqliteChallengeRepository {
  private readonly executor: SqlExecutor;
  private readonly runInTransaction: RunInTransaction;

  constructor(executor: SqlExecutor, runInTransaction: RunInTransaction) {
    this.executor = executor;
    this.runInTransaction = runInTransaction;
  }

  async create(challenge: FixedChallenge, wordIds: readonly string[]): Promise<void> {
    const score = challenge.score;
    await this.runInTransaction(async () => {
      await this.executor.run(INSERT_SESSION, [
        challenge.id,
        challenge.visitorId,
        FIXED_CHALLENGE_LEVEL,
        challenge.status,
        score.score,
        score.bestStreak,
        score.correctAnswers,
        score.wrongAnswers,
        challenge.createdAt.toISOString(),
        toStoredInstant(challenge.startedAt),
        toStoredInstant(challenge.finishedAt),
      ]);
      for (const [index, wordId] of wordIds.entries()) {
        await this.executor.run(INSERT_SESSION_WORD, [challenge.id, wordId, index + 1]);
      }
    });
    if (challenge.attempts.length > 0) {
      await this.save(challenge);
    }
  }

  async save(challenge: FixedChallenge): Promise<void> {
    await this.runInTransaction(async () => {
      const stored = await this.readSession(challenge.id);
      if (stored.status !== "ACTIVE") {
        if (stored.status === challenge.status) {
          return;
        }
        throw new SessionEndedError(stored.status);
      }
      await this.writeAttempts(challenge);
      await this.writeSession(challenge);
    });
  }

  async find(challengeId: string): Promise<StoredChallenge | null> {
    const rows = await this.executor.getAll<SessionRow>(SELECT_SESSION, [challengeId]);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const [words, attempts] = await Promise.all([
      this.executor.getAll<SessionWordRow>(SELECT_SESSION_WORDS, [challengeId]),
      this.executor.getAll<AttemptRow>(SELECT_ATTEMPTS, [challengeId]),
    ]);
    const challenge = FixedChallenge.restore({
      id: row.id,
      visitorId: row.visitorId,
      status: row.status,
      createdAt: new Date(row.createdAt),
      startedAt: fromStoredInstant(row.startedAt),
      finishedAt: fromStoredInstant(row.finishedAt),
      attempts: attempts.map(toAttempt),
    });
    return { challenge, wordIds: words.map(({ wordId }) => wordId) };
  }

  async bestCompletedScore(visitorId: string): Promise<number | null> {
    const rows = await this.executor.getAll<BestScoreRow>(SELECT_BEST_COMPLETED_SCORE, [
      visitorId,
    ]);
    return rows[0]?.best ?? null;
  }

  async recordFor(challengeId: string): Promise<ChallengeRecordView> {
    const session = await this.readSession(challengeId);
    const previousBest = await this.previousBestScore(session);
    const comparison = compareWithRecord(session, previousBest);
    const best = comparison.isNewRecord ? session.score : previousBest;
    return { score: session.score, ...comparison, best };
  }

  private async previousBestScore(session: SessionRow): Promise<number | null> {
    if (session.finishedAt === null) {
      return this.bestCompletedScore(session.visitorId);
    }
    const rows = await this.executor.getAll<BestScoreRow>(SELECT_PREVIOUS_BEST_SCORE, [
      session.visitorId,
      session.id,
      session.finishedAt,
      session.finishedAt,
      session.id,
    ]);
    return rows[0]?.best ?? null;
  }

  private async readSession(challengeId: string): Promise<SessionRow> {
    const rows = await this.executor.getAll<SessionRow>(SELECT_SESSION, [challengeId]);
    const row = rows[0];
    if (row === undefined) {
      throw new ChallengeNotStoredError(challengeId);
    }
    return row;
  }

  private async writeAttempts(challenge: FixedChallenge): Promise<void> {
    const attempts = challenge.attempts;
    const storedIds = await this.storedAttemptIds(challenge.id);
    storedIds.forEach((attemptId, index) => {
      if (attempts[index]?.attemptId !== attemptId) {
        throw new StoredAttemptsMismatchError(challenge.id);
      }
    });
    for (const [index, attempt] of attempts.entries()) {
      if (index < storedIds.length) {
        continue;
      }
      const sequence = index + 1;
      const occurredAt = attempt.occurredAt.toISOString();
      await this.executor.run(INSERT_ATTEMPT, [
        `${challenge.id}:${sequence}`,
        attempt.attemptId,
        challenge.id,
        sequence,
        attempt.promptWordId,
        attempt.selectedWordId,
        attempt.isCorrect ? 1 : 0,
        occurredAt,
      ]);
      if (attempt.isCorrect) {
        await this.executor.run(COMPLETE_SESSION_WORD, [
          occurredAt,
          challenge.id,
          attempt.promptWordId,
        ]);
      }
    }
  }

  private async storedAttemptIds(challengeId: string): Promise<string[]> {
    const rows = await this.executor.getAll<AttemptRow>(SELECT_ATTEMPTS, [challengeId]);
    return rows.map(({ attemptId }) => attemptId);
  }

  private async writeSession(challenge: FixedChallenge): Promise<void> {
    const score = challenge.score;
    await this.executor.run(UPDATE_SESSION, [
      challenge.status,
      score.score,
      score.bestStreak,
      score.correctAnswers,
      score.wrongAnswers,
      toStoredInstant(challenge.startedAt),
      toStoredInstant(challenge.finishedAt),
      challenge.id,
    ]);
  }
}

function toAttempt(row: AttemptRow): ChallengeAttempt {
  return {
    attemptId: row.attemptId,
    promptWordId: row.promptWordId,
    selectedWordId: row.selectedWordId,
    isCorrect: row.isCorrect === 1,
    occurredAt: new Date(row.createdAt),
  };
}

function toStoredInstant(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function fromStoredInstant(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}
