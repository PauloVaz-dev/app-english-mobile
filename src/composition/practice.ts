import {
  type ChallengePronunciation,
  INSUFFICIENT_CATALOG,
} from "@/composition/challenge";
import type { SessionResultLists } from "@/lib/application/game/session-view";
import { GameSessionNotFoundError, InvalidWordCatalogError } from "@/lib/domain/game/errors";
import { GameSession } from "@/lib/domain/game/game-session";
import {
  type AttemptResult,
  type Clock,
  type GameSessionStatus,
  type SessionExposure,
  SESSION_TARGET_WORDS,
  type Word,
} from "@/lib/domain/game/types";
import type {
  PracticeOpeningOutcome,
  PracticeScreenPort,
} from "@/lib/presentation/game/practice-screen";
import type {
  RecordGameAttemptInput,
  RecordGameExposuresInput,
} from "@/persistence/sqlite-game-session-repository";
import type { DrawPracticeWordsInput } from "@/persistence/sqlite-word-catalog";

export const PRACTICE_PERSIST_FAILED = "practice.persist_failed";
export const PRACTICE_SPEECH_FAILED = "practice.speech_failed";

export type PracticeEvent = typeof PRACTICE_PERSIST_FAILED | typeof PRACTICE_SPEECH_FAILED;
export type PracticeEventRecorder = (event: PracticeEvent) => void;

export interface PracticeWordSource {
  drawPracticeWords(input: DrawPracticeWordsInput): Promise<readonly Word[]>;
}

export interface PracticeStore {
  create(session: GameSession): Promise<void>;
  findById(sessionId: string): Promise<GameSession | null>;
  recordExposures(input: RecordGameExposuresInput): Promise<readonly SessionExposure[]>;
  recordAttempt(input: RecordGameAttemptInput): Promise<AttemptResult>;
  abandon(sessionId: string): Promise<GameSession>;
  readResultLists(sessionId: string): Promise<SessionResultLists>;
}

export interface PracticeCompositionDependencies {
  readonly catalog: PracticeWordSource;
  readonly repository: PracticeStore;
  readonly clock: Clock;
  readonly createId: () => string;
  readonly recordEvent: PracticeEventRecorder;
  readonly speech?: ChallengePronunciation;
}

export interface PracticeOpening {
  readonly sessionId: string;
  readonly targetWords: number;
  readonly words: readonly Word[];
}

export type PracticeAttemptInput = RecordGameAttemptInput;

export interface PracticeProgress {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly isCorrect: boolean;
  readonly completedWordId: string | null;
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly completedWords: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
}

export interface PracticeResult extends SessionResultLists {
  readonly sessionId: string;
  readonly status: GameSessionStatus;
  readonly targetWords: number;
  readonly completedWords: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly averageResponseTimeMs: number;
  readonly durationMs: number;
}

export interface PracticeComposition {
  start(visitorId: string): Promise<PracticeOpening>;
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  attempt(input: PracticeAttemptInput): Promise<PracticeProgress>;
  abandon(sessionId: string): Promise<void>;
  result(sessionId: string): Promise<PracticeResult>;
}

export class InsufficientPracticeCatalogError extends Error {
  readonly name = "InsufficientPracticeCatalogError";
  readonly state = INSUFFICIENT_CATALOG;

  constructor(cause?: unknown) {
    super("There are not enough active words to start a practice.");
    this.cause = cause;
  }
}

/**
 * A write of the session failed earlier, so the calls already queued behind
 * it are refused without touching the database. The screen resends them in
 * order after "Tentar de novo"; the idempotent `attemptId` keeps the counts.
 */
export class PracticeWritesHaltedError extends Error {
  readonly name = "PracticeWritesHaltedError";

  constructor(readonly sessionId: string) {
    super(`An earlier write of practice ${sessionId} failed; retry it first.`);
  }
}

/** Gives the device voice a recorder that logs `practice.speech_failed`. */
export function recordPracticeSpeechFailure(recordEvent: PracticeEventRecorder): () => void {
  return () => recordEvent(PRACTICE_SPEECH_FAILED);
}

/**
 * Runs one database call at a time, in call order. On the device the
 * transaction runs through `withTransactionAsync`, and a query started while
 * it is open may land inside it, so every call of the composition (draw,
 * creation, exposure, attempt, abandon and result) goes through this queue.
 */
class DatabaseQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export function createPracticeComposition(
  dependencies: PracticeCompositionDependencies,
): PracticeComposition {
  const queue = new DatabaseQueue();
  const failedWrites = new Map<string, number>();
  const englishBySession = new Map<string, ReadonlyMap<string, string>>();
  const answeredBySession = new Map<string, Set<string>>();

  const failWrite = (cause: unknown): never => {
    recordQuietly(dependencies, PRACTICE_PERSIST_FAILED);
    throw cause;
  };

  /** Writes of the match: a failure halts the calls already queued behind it. */
  const playWrite = <T>(sessionId: string, write: () => Promise<T>): Promise<T> => {
    const epoch = failedWrites.get(sessionId) ?? 0;
    return queue.run(async () => {
      if ((failedWrites.get(sessionId) ?? 0) !== epoch) {
        throw new PracticeWritesHaltedError(sessionId);
      }
      try {
        return await write();
      } catch (cause) {
        failedWrites.set(sessionId, epoch + 1);
        return failWrite(cause);
      }
    });
  };

  const pronounce = (sessionId: string, wordId: string) => {
    const english = englishBySession.get(sessionId)?.get(wordId);
    if (dependencies.speech === undefined || english === undefined) {
      return;
    }
    try {
      dependencies.speech.pronounce(english);
    } catch {
      recordQuietly(dependencies, PRACTICE_SPEECH_FAILED);
    }
  };

  const forget = (sessionId: string) => {
    englishBySession.delete(sessionId);
    answeredBySession.delete(sessionId);
    failedWrites.delete(sessionId);
  };

  return {
    start(visitorId) {
      return queue.run(async () => {
        const words = await drawWords(dependencies.catalog, visitorId);
        const session = GameSession.start(
          { id: dependencies.createId(), visitorId, words, mode: "FREE" },
          dependencies.clock,
        );
        try {
          await dependencies.repository.create(session);
        } catch (cause) {
          failWrite(cause);
        }
        englishBySession.set(session.id, new Map(words.map(({ id, english }) => [id, english])));
        answeredBySession.set(session.id, new Set());
        return { sessionId: session.id, targetWords: session.targetWords, words };
      });
    },

    async expose(sessionId, wordIds) {
      await playWrite(sessionId, () =>
        dependencies.repository.recordExposures({ sessionId, wordIds }),
      );
    },

    async attempt(input) {
      const outcome = await playWrite(input.sessionId, () =>
        dependencies.repository.recordAttempt(input),
      );
      const answered = answeredBySession.get(input.sessionId) ?? new Set<string>();
      answeredBySession.set(input.sessionId, answered);
      const isNewHit = outcome.isCorrect && !answered.has(input.attemptId);
      answered.add(input.attemptId);
      if (isNewHit) {
        pronounce(input.sessionId, outcome.attempt.promptWordId);
      }
      return toProgress(input.sessionId, outcome);
    },

    async abandon(sessionId) {
      await queue.run(async () => {
        try {
          await dependencies.repository.abandon(sessionId);
        } catch (cause) {
          failWrite(cause);
        }
      });
      forget(sessionId);
    },

    result(sessionId) {
      return queue.run(async () => {
        const session = await dependencies.repository.findById(sessionId);
        if (session === null) {
          throw new GameSessionNotFoundError(sessionId);
        }
        const lists = await dependencies.repository.readResultLists(sessionId);
        return toResult(session, dependencies.clock, lists);
      });
    },
  };
}

async function drawWords(catalog: PracticeWordSource, visitorId: string): Promise<readonly Word[]> {
  let words: readonly Word[];
  try {
    words = await catalog.drawPracticeWords({ visitorId });
  } catch (cause) {
    if (cause instanceof InvalidWordCatalogError) {
      throw new InsufficientPracticeCatalogError(cause);
    }
    throw cause;
  }
  if (words.length < SESSION_TARGET_WORDS) {
    throw new InsufficientPracticeCatalogError();
  }
  return words;
}

function recordQuietly(dependencies: PracticeCompositionDependencies, event: PracticeEvent): void {
  try {
    dependencies.recordEvent(event);
  } catch {
    // A failed log must not reach the match.
  }
}

function toProgress(sessionId: string, outcome: AttemptResult): PracticeProgress {
  const { metrics } = outcome;
  return {
    sessionId,
    attemptId: outcome.attempt.attemptId,
    isCorrect: outcome.isCorrect,
    completedWordId: outcome.completedWordId,
    status: metrics.status,
    targetWords: metrics.targetWords,
    completedWords: metrics.completedWords,
    correctAnswers: metrics.correctAnswers,
    wrongAnswers: metrics.wrongAnswers,
  };
}

function toResult(
  session: GameSession,
  clock: Clock,
  lists: SessionResultLists,
): PracticeResult {
  const metrics = session.result ?? session.metrics(clock);
  return {
    sessionId: session.id,
    status: metrics.status,
    targetWords: metrics.targetWords,
    completedWords: metrics.completedWords,
    correctAnswers: metrics.correctAnswers,
    wrongAnswers: metrics.wrongAnswers,
    accuracy: metrics.accuracy,
    averageResponseTimeMs: metrics.averageResponseTimeMs,
    durationMs: metrics.durationMs,
    reviewWords: lists.reviewWords,
    praiseWords: lists.praiseWords,
  };
}

/** What the practice screen needs once the database is open on the device. */
export interface PreparedPractice {
  readonly composition: PracticeComposition;
  readonly visitorId: string;
}

export interface PracticeScreenPortInput {
  readonly prepare: () => Promise<PreparedPractice>;
}

/**
 * Adapts the composition to the practice screen. Every call goes through the
 * same prepared composition, so a match has a single queue from start to end.
 */
export function createPracticeScreenPort(input: PracticeScreenPortInput): PracticeScreenPort {
  const composition = async () => (await input.prepare()).composition;
  return {
    async start(): Promise<PracticeOpeningOutcome> {
      const prepared = await input.prepare();
      try {
        const opening = await prepared.composition.start(prepared.visitorId);
        return { kind: "opened", ...opening };
      } catch (cause) {
        if (cause instanceof InsufficientPracticeCatalogError) {
          return { kind: "insufficientCatalog" };
        }
        throw cause;
      }
    },
    async expose(sessionId, wordIds) {
      await (await composition()).expose(sessionId, wordIds);
    },
    async attempt(attempt) {
      return (await composition()).attempt(attempt);
    },
    async abandon(sessionId) {
      await (await composition()).abandon(sessionId);
    },
    async result(sessionId) {
      return (await composition()).result(sessionId);
    },
  };
}
