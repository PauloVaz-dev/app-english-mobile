import {
  AttemptConflictError,
  GameDomainError,
  InvalidAttemptError,
  InvalidGameSessionError,
  SessionEndedError,
} from "@/lib/domain/game/errors";
import type { Clock } from "@/lib/domain/game/types";

import { type ChallengeScore, scoreOutcomes } from "./scoring";

export const CHALLENGE_DURATION_MS = 60_000;

export const FIXED_CHALLENGE_STATUSES = ["ACTIVE", "COMPLETED", "ABANDONED"] as const;

export type FixedChallengeStatus = (typeof FIXED_CHALLENGE_STATUSES)[number];

export interface ChallengeAttemptInput {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
}

export interface ChallengeAttempt extends ChallengeAttemptInput {
  readonly isCorrect: boolean;
  readonly occurredAt: Date;
}

export interface FixedChallengeSnapshot {
  readonly id: string;
  readonly visitorId: string;
  readonly status: FixedChallengeStatus;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly attempts: readonly ChallengeAttempt[];
}

export interface RecordCandidate {
  readonly status: FixedChallengeStatus;
  readonly score: number;
}

export interface RecordComparison {
  readonly previousBest: number | null;
  readonly isNewRecord: boolean;
}

export function bestCompletedScore(sessions: readonly RecordCandidate[]): number | null {
  return sessions.reduce<number | null>((best, session) => {
    if (session.status !== "COMPLETED") {
      return best;
    }
    return best === null ? session.score : Math.max(best, session.score);
  }, null);
}

export function compareWithRecord(
  current: RecordCandidate,
  previousBest: number | null,
): RecordComparison {
  if (current.status !== "COMPLETED") {
    return { previousBest, isNewRecord: false };
  }
  return {
    previousBest,
    isNewRecord: previousBest === null || current.score > previousBest,
  };
}

export class ChallengeNotStartedError extends GameDomainError {
  constructor() {
    super("CHALLENGE_NOT_STARTED", "The challenge countdown has not started.");
  }
}

export class ChallengeTimeExpiredError extends GameDomainError {
  constructor() {
    super("CHALLENGE_TIME_EXPIRED", "The challenge time is over.");
  }
}

export class ChallengeStillRunningError extends GameDomainError {
  constructor() {
    super("CHALLENGE_STILL_RUNNING", "The challenge time is not over yet.");
  }
}

export class FixedChallenge {
  readonly id: string;
  readonly visitorId: string;

  private readonly createdTime: Date;
  private currentStatus: FixedChallengeStatus = "ACTIVE";
  private startTime: Date | null = null;
  private finishTime: Date | null = null;
  private readonly recordedAttempts: ChallengeAttempt[] = [];

  private constructor(id: string, visitorId: string, createdAt: Date) {
    this.id = id;
    this.visitorId = visitorId;
    this.createdTime = createdAt;
  }

  static create(
    input: { readonly id: string; readonly visitorId: string },
    clock: Clock,
  ): FixedChallenge {
    return new FixedChallenge(
      requireText(input.id, "Challenge id", InvalidGameSessionError),
      requireText(input.visitorId, "Visitor id", InvalidGameSessionError),
      readClock(clock),
    );
  }

  static restore(snapshot: FixedChallengeSnapshot): FixedChallenge {
    const challenge = new FixedChallenge(
      requireText(snapshot.id, "Challenge id", InvalidGameSessionError),
      requireText(snapshot.visitorId, "Visitor id", InvalidGameSessionError),
      requireStoredDate(snapshot.createdAt, "createdAt"),
    );
    challenge.currentStatus = requireStatus(snapshot.status);
    challenge.startTime = optionalStoredDate(snapshot.startedAt, "startedAt");
    challenge.finishTime = optionalStoredDate(snapshot.finishedAt, "finishedAt");
    challenge.assertRestoredTimes();
    for (const attempt of snapshot.attempts) {
      challenge.recordedAttempts.push(challenge.restoredAttempt(attempt));
    }
    return challenge;
  }

  toSnapshot(): FixedChallengeSnapshot {
    return {
      id: this.id,
      visitorId: this.visitorId,
      status: this.currentStatus,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      attempts: this.attempts,
    };
  }

  get status(): FixedChallengeStatus {
    return this.currentStatus;
  }

  get createdAt(): Date {
    return new Date(this.createdTime);
  }

  get startedAt(): Date | null {
    return cloneDate(this.startTime);
  }

  get finishedAt(): Date | null {
    return cloneDate(this.finishTime);
  }

  get deadline(): Date | null {
    return this.startTime
      ? new Date(this.startTime.getTime() + CHALLENGE_DURATION_MS)
      : null;
  }

  get attempts(): readonly ChallengeAttempt[] {
    return this.recordedAttempts.map(cloneAttempt);
  }

  get score(): ChallengeScore {
    return scoreOutcomes(this.recordedAttempts.map(({ isCorrect }) => isCorrect));
  }

  remainingMs(clock: Clock): number | null {
    const deadline = this.deadline;
    if (deadline === null) {
      return null;
    }
    if (this.currentStatus !== "ACTIVE") {
      return 0;
    }
    return Math.max(0, deadline.getTime() - readClock(clock).getTime());
  }

  begin(clock: Clock): void {
    this.assertActive();
    if (this.startTime === null) {
      this.startTime = readClock(clock);
    }
  }

  recordAttempt(input: ChallengeAttemptInput, clock: Clock): ChallengeAttempt {
    const normalized = normalizeAttempt(input);
    const existing = this.recordedAttempts.find(
      ({ attemptId }) => attemptId === normalized.attemptId,
    );
    if (existing) {
      if (
        existing.promptWordId !== normalized.promptWordId ||
        existing.selectedWordId !== normalized.selectedWordId
      ) {
        throw new AttemptConflictError(normalized.attemptId);
      }
      return cloneAttempt(existing);
    }
    this.assertActive();
    const deadline = this.requireDeadline();
    const now = readClock(clock);
    if (now.getTime() > deadline.getTime()) {
      throw new ChallengeTimeExpiredError();
    }
    const attempt: ChallengeAttempt = {
      ...normalized,
      isCorrect: normalized.promptWordId === normalized.selectedWordId,
      occurredAt: now,
    };
    this.recordedAttempts.push(attempt);
    return cloneAttempt(attempt);
  }

  expire(clock: Clock): void {
    this.assertActive();
    const deadline = this.requireDeadline();
    if (readClock(clock).getTime() < deadline.getTime()) {
      throw new ChallengeStillRunningError();
    }
    this.currentStatus = "COMPLETED";
    this.finishTime = deadline;
  }

  abandon(clock: Clock): void {
    this.assertActive();
    const now = readClock(clock);
    const deadline = this.deadline;
    this.currentStatus = "ABANDONED";
    this.finishTime =
      deadline !== null && deadline.getTime() < now.getTime() ? deadline : now;
  }

  private assertRestoredTimes(): void {
    const created = this.createdTime.getTime();
    const start = this.startTime;
    const finish = this.finishTime;
    const deadline = this.deadline;
    if (start !== null && start.getTime() < created) {
      throw new InvalidGameSessionError("Challenge cannot start before it was created.");
    }
    if (this.currentStatus === "ACTIVE") {
      if (finish !== null) {
        throw new InvalidGameSessionError("An active challenge cannot have a finish time.");
      }
      return;
    }
    if (finish === null) {
      throw new InvalidGameSessionError("A finished challenge needs a finish time.");
    }
    if (this.currentStatus === "COMPLETED") {
      if (deadline === null || finish.getTime() !== deadline.getTime()) {
        throw new InvalidGameSessionError("A completed challenge finishes at its deadline.");
      }
      return;
    }
    const earliest = start ?? this.createdTime;
    if (
      finish.getTime() < earliest.getTime() ||
      (deadline !== null && finish.getTime() > deadline.getTime())
    ) {
      throw new InvalidGameSessionError("An abandoned challenge finishes inside its round.");
    }
  }

  private restoredAttempt(attempt: ChallengeAttempt): ChallengeAttempt {
    const normalized = restoreAttemptInput(attempt);
    const occurredAt = requireStoredDate(attempt.occurredAt, "occurredAt");
    const start = this.startTime;
    const deadline = this.deadline;
    if (start === null || deadline === null) {
      throw new InvalidGameSessionError("A challenge without start cannot have attempts.");
    }
    const previous = this.recordedAttempts.at(-1);
    if (
      occurredAt.getTime() < start.getTime() ||
      occurredAt.getTime() > deadline.getTime() ||
      (previous !== undefined && occurredAt.getTime() < previous.occurredAt.getTime())
    ) {
      throw new InvalidGameSessionError("Stored attempt time is outside the round.");
    }
    if (this.recordedAttempts.some(({ attemptId }) => attemptId === normalized.attemptId)) {
      throw new InvalidGameSessionError(`Attempt ${normalized.attemptId} is stored twice.`);
    }
    const isCorrect = normalized.promptWordId === normalized.selectedWordId;
    if (attempt.isCorrect !== isCorrect) {
      throw new InvalidGameSessionError("Stored attempt outcome does not match its words.");
    }
    return { ...normalized, isCorrect, occurredAt };
  }

  private assertActive(): void {
    if (this.currentStatus !== "ACTIVE") {
      throw new SessionEndedError(this.currentStatus);
    }
  }

  private requireDeadline(): Date {
    const deadline = this.deadline;
    if (deadline === null) {
      throw new ChallengeNotStartedError();
    }
    return deadline;
  }
}

function normalizeAttempt(input: ChallengeAttemptInput): ChallengeAttemptInput {
  return {
    attemptId: requireText(input.attemptId, "attemptId", InvalidAttemptError),
    promptWordId: requireText(input.promptWordId, "promptWordId", InvalidAttemptError),
    selectedWordId: requireText(
      input.selectedWordId,
      "selectedWordId",
      InvalidAttemptError,
    ),
  };
}

function restoreAttemptInput(input: ChallengeAttemptInput): ChallengeAttemptInput {
  try {
    return normalizeAttempt(input);
  } catch (error) {
    if (error instanceof InvalidAttemptError) {
      throw new InvalidGameSessionError(error.message);
    }
    throw error;
  }
}

function requireStatus(value: unknown): FixedChallengeStatus {
  const status = FIXED_CHALLENGE_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) {
    throw new InvalidGameSessionError(`Unknown challenge status: ${String(value)}.`);
  }
  return status;
}

function requireStoredDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidGameSessionError(`${field} must be a valid date.`);
  }
  return new Date(value);
}

function optionalStoredDate(value: Date | null, field: string): Date | null {
  return value === null ? null : requireStoredDate(value, field);
}

function requireText(
  value: unknown,
  field: string,
  ErrorType: new (message: string) => GameDomainError,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ErrorType(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readClock(clock: Clock): Date {
  const value = clock.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidGameSessionError("Clock must return a valid date.");
  }
  return new Date(value);
}

function cloneDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value);
}

function cloneAttempt(attempt: ChallengeAttempt): ChallengeAttempt {
  return { ...attempt, occurredAt: new Date(attempt.occurredAt) };
}
