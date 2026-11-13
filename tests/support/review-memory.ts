import type { DailyReviewReader, DailyReviewSummary, PlanInputs } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository, TypingAttemptResult } from "@/lib/application/review/ports/review-session-repository";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { GameSession } from "@/lib/domain/game/game-session";
import type { AttemptResult, Clock, SessionExposure, Word } from "@/lib/domain/game/types";
import { DAILY_NEW_WORD_LIMIT, type DueReviewWord } from "@/lib/domain/learning/daily-review-plan";
import { localDateOf } from "@/lib/domain/learning/local-day";
import { applyMatchingReview } from "@/lib/domain/learning/matching-review";
import { isReviewDue, scheduleReview, type ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import type { ScheduledWordRef } from "@/lib/domain/learning/word-selection";
import {
  ReviewSession,
  ReviewSessionAlreadyExistsError,
  ReviewSessionNotFoundError,
  type FinishedReviewSessionStatus,
  type ReviewSessionSnapshot,
} from "@/lib/domain/review";
import type { RecordTypingAttempt } from "@/lib/application/review/ports/review-session-repository";
import type { RecordGameAttemptInput, RecordGameExposuresInput } from "@/persistence/sqlite-game-session-repository";

const SCHEDULE_KEY_SEPARATOR = "\0";
const INITIAL_DELAY_MS = 8;

export class ManualClock implements Clock {
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

/**
 * In-memory ports for the review use cases. Each call waits a little so a
 * composition that forgets its queue overlaps them and raises `maxActive`.
 */
export class ReviewMemory {
  readonly log: string[] = [];
  readonly failures = new Map<string, Error>();
  maxActive = 0;
  private active = 0;
  private calls = 0;
  private readonly words = new Map<string, Word>();
  private readonly schedules = new Map<string, ReviewSchedule>();
  private readonly sessions = new Map<string, ReviewSessionSnapshot>();
  private readonly games = new Map<string, GameSession>();
  private readonly timeZones = new Map<string, string>();

  constructor(readonly clock: ManualClock) {}

  addWord(word: Word): void {
    this.words.set(word.id, word);
  }

  schedule(visitorId: string, wordId: string, reviewSchedule: ReviewSchedule): void {
    this.schedules.set(scheduleKey(visitorId, wordId), reviewSchedule);
  }

  readSchedule(visitorId: string, wordId: string): ReviewSchedule | null {
    return this.schedules.get(scheduleKey(visitorId, wordId)) ?? null;
  }

  storedSession(sessionId: string): ReviewSessionSnapshot | null {
    return this.sessions.get(sessionId) ?? null;
  }

  get repository(): ReviewSessionRepository {
    return {
      create: (session, game) => this.create(session, game),
      findById: (id) => this.findById(id),
      findActiveByVisitor: (visitorId) => this.findActiveByVisitor(visitorId),
      recordTypingAttempt: (input) => this.recordTypingAttempt(input),
      finish: (id, status) => this.finish(id, status),
      findLinkedGame: (gameSessionId) => this.findLinkedGame(gameSessionId),
    };
  }

  get reader(): DailyReviewReader {
    return {
      summary: (visitorId, now, timeZone) => this.summary(visitorId, now, timeZone),
      loadPlanInputs: (visitorId, now, timeZone) => this.loadPlanInputs(visitorId, now, timeZone),
      findActiveWords: (wordIds) => this.findActiveWords(wordIds),
      listStudied: (visitorId) => this.listStudied(visitorId),
    };
  }

  get preferences(): VisitorPreferences {
    return {
      getTimeZone: (visitorId) => this.getTimeZone(visitorId),
      saveTimeZone: (visitorId, timeZone) => this.saveTimeZone(visitorId, timeZone),
    };
  }

  get board() {
    return {
      recordExposures: (input: RecordGameExposuresInput) => this.recordExposures(input),
      recordAttempt: (input: RecordGameAttemptInput) => this.recordAttempt(input),
    };
  }

  private async create(session: ReviewSession, game: GameSession | null): Promise<void> {
    await this.track("create", () => {
      if (this.sessions.has(session.id)) {
        throw new ReviewSessionAlreadyExistsError(session.id);
      }
      this.sessions.set(session.id, session.toSnapshot());
      if (game) {
        this.games.set(game.id, GameSession.restore(game.toSnapshot()));
      }
    });
  }

  private async findById(id: string): Promise<ReviewSession | null> {
    return this.track("find", () => restoreReview(this.readTables(), id));
  }

  private async findActiveByVisitor(visitorId: string): Promise<ReviewSession | null> {
    return this.track("active", () => {
      const active = [...this.sessions.values()]
        .filter((snapshot) => snapshot.visitorId === visitorId && snapshot.status === "ACTIVE")
        .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
      const newest = active[0];
      return newest === undefined ? null : restoreReview(this.readTables(), newest.id);
    });
  }

  private async recordTypingAttempt(input: RecordTypingAttempt): Promise<TypingAttemptResult> {
    return this.track("type", () => {
      const session = this.requireSession(input.sessionId);
      const already = session.attempts.some((attempt) => attempt.attemptId === input.attemptId);
      const outcome = session.recordTypingAttempt(
        {
          attemptId: input.attemptId,
          wordId: input.wordId,
          typedText: input.typedText,
          usedHint: input.usedHint,
          responseTimeMs: input.responseTimeMs,
        },
        this.clock,
      );
      if (!already && outcome.grade) {
        const recorded = session.attempts.find((attempt) => attempt.attemptId === input.attemptId);
        if (recorded) {
          this.schedule(
            session.visitorId,
            recorded.wordId,
            scheduleReview(
              this.readSchedule(session.visitorId, recorded.wordId),
              outcome.grade,
              recorded.createdAt,
              session.timeZone,
            ),
          );
        }
      }
      this.sessions.set(session.id, session.toSnapshot());
      const stored = restoreReview(this.readTables(), session.id);
      if (stored === null) {
        throw new ReviewSessionNotFoundError(session.id);
      }
      return { ...outcome, session: stored };
    });
  }

  private async finish(id: string, status: FinishedReviewSessionStatus): Promise<ReviewSession> {
    return this.track(status === "ABANDONED" ? "abandon" : "finish", () => {
      const session = this.requireSession(id);
      if (status === "ABANDONED") {
        session.abandon(this.clock);
        this.abandonGame(session.gameSessionId);
      } else {
        session.complete(this.clock);
      }
      this.sessions.set(session.id, session.toSnapshot());
      const stored = restoreReview(this.readTables(), session.id);
      if (stored === null) {
        throw new ReviewSessionNotFoundError(id);
      }
      return stored;
    });
  }

  private async findLinkedGame(gameSessionId: string): Promise<GameSession | null> {
    return this.track("game", () => this.games.get(gameSessionId) ?? null);
  }

  private async summary(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewSummary> {
    return this.track("summary", () => {
      const due = listDueWords(this.readTables(), visitorId, now);
      const candidates = listNewCandidateIds(this.readTables(), visitorId);
      const introduced = countIntroducedToday(this.readTables(), visitorId, localDateOf(now, timeZone));
      const quota = Math.max(0, DAILY_NEW_WORD_LIMIT - introduced);
      return {
        dueCount: due.length,
        newAvailable: Math.min(candidates.length, quota),
        nextReviewAt: earliestFutureReview(this.readTables(), visitorId, now),
      };
    });
  }

  private async loadPlanInputs(visitorId: string, now: Date, timeZone: string): Promise<PlanInputs> {
    return this.track("plan", () => ({
      due: listDueWords(this.readTables(), visitorId, now),
      newCandidates: listNewCandidateIds(this.readTables(), visitorId),
      introducedToday: countIntroducedToday(this.readTables(), visitorId, localDateOf(now, timeZone)),
    }));
  }

  private async findActiveWords(wordIds: readonly string[]): Promise<readonly Word[]> {
    return this.track("words", () => {
      const found: Word[] = [];
      for (const wordId of wordIds) {
        const word = this.words.get(wordId);
        if (word?.active) {
          found.push(word);
        }
      }
      return found;
    });
  }

  private async listStudied(visitorId: string): Promise<readonly ScheduledWordRef[]> {
    return this.track("studied", () => {
      const studied: ScheduledWordRef[] = [];
      for (const [key, schedule] of this.schedules) {
        const parsed = parseScheduleKey(key);
        if (parsed.visitorId !== visitorId) {
          continue;
        }
        const word = this.words.get(parsed.wordId);
        if (!word?.active) {
          continue;
        }
        studied.push({ wordId: parsed.wordId, schedule });
      }
      return studied;
    });
  }

  private async getTimeZone(visitorId: string): Promise<string | null> {
    return this.track("zone", () => this.timeZones.get(visitorId) ?? null);
  }

  private async saveTimeZone(visitorId: string, timeZone: string): Promise<void> {
    await this.track("save-zone", () => {
      this.timeZones.set(visitorId, timeZone);
    });
  }

  private async recordExposures(input: RecordGameExposuresInput): Promise<readonly SessionExposure[]> {
    return this.track("expose", () => this.requireGame(input.sessionId).recordExposures(input.wordIds, this.clock));
  }

  private async recordAttempt(input: RecordGameAttemptInput): Promise<AttemptResult> {
    return this.track("match", () => {
      const game = this.requireGame(input.sessionId);
      const already = game.attempts.some((attempt) => attempt.attemptId === input.attemptId);
      const result = game.recordAttempt(
        {
          attemptId: input.attemptId,
          promptWordId: input.promptWordId,
          selectedWordId: input.selectedWordId,
          responseTimeMs: input.responseTimeMs,
        },
        this.clock,
      );
      if (!already) {
        applyGradedMatch(this.readTables(), game, result);
      }
      return result;
    });
  }

  private readTables(): ReviewTables {
    return {
      words: this.words,
      schedules: this.schedules,
      sessions: this.sessions,
      games: this.games,
    };
  }

  private requireSession(id: string): ReviewSession {
    const session = restoreReview(this.readTables(), id);
    if (session === null) {
      throw new ReviewSessionNotFoundError(id);
    }
    return session;
  }

  private requireGame(id: string): GameSession {
    const game = this.games.get(id);
    if (game === undefined) {
      throw new Error(`Game ${id} was not stored.`);
    }
    return game;
  }

  private abandonGame(gameSessionId: string | null): void {
    if (gameSessionId === null) {
      return;
    }
    const game = this.games.get(gameSessionId);
    if (game && game.status === "ACTIVE") {
      game.abandon(this.clock);
    }
  }

  private async track<T>(label: string, work: () => T): Promise<T> {
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.log.push(`begin:${label}`);
    const delay = Math.max(0, INITIAL_DELAY_MS - this.calls);
    this.calls += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const failure = this.failures.get(label);
      if (failure !== undefined) {
        this.failures.delete(label);
        throw failure;
      }
      return work();
    } finally {
      this.log.push(`end:${label}`);
      this.active -= 1;
    }
  }
}

interface ReviewTables {
  readonly words: Map<string, Word>;
  readonly schedules: Map<string, ReviewSchedule>;
  readonly sessions: Map<string, ReviewSessionSnapshot>;
  readonly games: Map<string, GameSession>;
}

function applyGradedMatch(tables: ReviewTables, game: GameSession, result: AttemptResult): void {
  const wordId = result.attempt.promptWordId;
  if (!game.gradesWord(wordId)) {
    return;
  }
  const review = findReviewForGame(tables, game.id);
  if (review === null) {
    return;
  }
  const previousAttempts = game.attempts.filter((attempt) => attempt.attemptId !== result.attempt.attemptId);
  const next = applyMatchingReview({
    current: tables.schedules.get(scheduleKey(game.visitorId, wordId)) ?? null,
    previousAttempts,
    result,
    timeZone: review.timeZone,
  });
  if (next) {
    tables.schedules.set(scheduleKey(game.visitorId, wordId), next);
  }
}

function findReviewForGame(tables: ReviewTables, gameSessionId: string): ReviewSessionSnapshot | null {
  for (const snapshot of tables.sessions.values()) {
    if (snapshot.gameSessionId === gameSessionId) {
      return snapshot;
    }
  }
  return null;
}

function listDueWords(tables: ReviewTables, visitorId: string, now: Date): DueReviewWord[] {
  const due: DueReviewWord[] = [];
  for (const [key, schedule] of tables.schedules) {
    const parsed = parseScheduleKey(key);
    if (parsed.visitorId !== visitorId || !isReviewDue(schedule, now)) {
      continue;
    }
    const word = tables.words.get(parsed.wordId);
    if (!word?.active) {
      continue;
    }
    due.push({ wordId: parsed.wordId, schedule });
  }
  return due;
}

function listNewCandidateIds(tables: ReviewTables, visitorId: string): string[] {
  const scheduled = new Set<string>();
  for (const key of tables.schedules.keys()) {
    const parsed = parseScheduleKey(key);
    if (parsed.visitorId === visitorId) {
      scheduled.add(parsed.wordId);
    }
  }
  return [...tables.words.values()]
    .filter((word) => word.active && !scheduled.has(word.id))
    .map((word) => word.id)
    .sort();
}

function countIntroducedToday(tables: ReviewTables, visitorId: string, localDate: string): number {
  const introduced = new Set<string>();
  for (const snapshot of tables.sessions.values()) {
    collectIntroducedWords(introduced, snapshot, { visitorId, localDate });
  }
  return introduced.size;
}

function collectIntroducedWords(
  introduced: Set<string>,
  snapshot: ReviewSessionSnapshot,
  scope: { readonly visitorId: string; readonly localDate: string },
): void {
  if (snapshot.visitorId !== scope.visitorId || snapshot.localDate !== scope.localDate) {
    return;
  }
  for (const entry of snapshot.words) {
    if (entry.origin === "NEW") {
      introduced.add(entry.word.id);
    }
  }
}

function earliestFutureReview(tables: ReviewTables, visitorId: string, now: Date): Date | null {
  let earliest: Date | null = null;
  for (const [key, schedule] of tables.schedules) {
    const parsed = parseScheduleKey(key);
    if (parsed.visitorId !== visitorId || schedule.nextReviewAt.getTime() <= now.getTime()) {
      continue;
    }
    if (earliest === null || schedule.nextReviewAt.getTime() < earliest.getTime()) {
      earliest = schedule.nextReviewAt;
    }
  }
  return earliest === null ? null : new Date(earliest);
}

function restoreReview(tables: ReviewTables, id: string): ReviewSession | null {
  const snapshot = tables.sessions.get(id);
  if (snapshot === undefined) {
    return null;
  }
  const game = snapshot.gameSessionId ? tables.games.get(snapshot.gameSessionId) : undefined;
  return ReviewSession.restore({
    ...snapshot,
    matchingFinished: game ? game.status !== "ACTIVE" : snapshot.matchingFinished,
  });
}

function scheduleKey(visitorId: string, wordId: string): string {
  return `${visitorId}${SCHEDULE_KEY_SEPARATOR}${wordId}`;
}

function parseScheduleKey(key: string): { readonly visitorId: string; readonly wordId: string } {
  const separator = key.indexOf(SCHEDULE_KEY_SEPARATOR);
  return {
    visitorId: key.slice(0, separator),
    wordId: key.slice(separator + SCHEDULE_KEY_SEPARATOR.length),
  };
}
