import {
  type ChallengeAttempt,
  type ChallengeAttemptInput as SessionAttemptInput,
  ChallengeTimeExpiredError,
  FixedChallenge,
  type FixedChallengeStatus,
} from "@/lib/domain/challenge/fixed-challenge";
import type { ChallengeScore } from "@/lib/domain/challenge/scoring";
import { InvalidWordCatalogError, SessionEndedError } from "@/lib/domain/game/errors";
import type { Clock, Word } from "@/lib/domain/game/types";
import type {
  ChallengeAttemptOutcome,
  ChallengeOpeningOutcome,
  ChallengeScreenPort,
} from "@/lib/presentation/challenge/challenge-screen";
import {
  ChallengeNotStoredError,
  type ChallengeRecordView,
  type StoredChallenge,
} from "@/persistence/sqlite-challenge-repository";
import type { DrawChallengeWordsInput } from "@/persistence/sqlite-word-catalog";

export type { DrawChallengeWordsInput } from "@/persistence/sqlite-word-catalog";

export const CHALLENGE_WORD_LIMIT = 40;
export const CHALLENGE_PERSIST_FAILED = "challenge.persist_failed";
export const CHALLENGE_SPEECH_FAILED = "challenge.speech_failed";
export const INSUFFICIENT_CATALOG = "INSUFFICIENT_CATALOG";

export type ChallengeEvent = typeof CHALLENGE_PERSIST_FAILED | typeof CHALLENGE_SPEECH_FAILED;
export type ChallengeEventRecorder = (event: ChallengeEvent) => void;

export interface ChallengeWordSource {
  drawChallengeWords(input: DrawChallengeWordsInput): Promise<readonly Word[]>;
}

export interface ChallengeStore {
  create(challenge: FixedChallenge, wordIds: readonly string[]): Promise<void>;
  save(challenge: FixedChallenge): Promise<void>;
  find(challengeId: string): Promise<StoredChallenge | null>;
  recordFor(challengeId: string): Promise<ChallengeRecordView>;
}

/**
 * Pronounces the English word of an accepted hit. It is fire-and-forget:
 * the round never waits for it and a failure never reaches the session.
 */
export interface ChallengePronunciation {
  pronounce(english: string): void;
}

export interface ChallengeCompositionDependencies {
  readonly catalog: ChallengeWordSource;
  readonly repository: ChallengeStore;
  readonly clock: Clock;
  readonly createId: () => string;
  readonly recordEvent: ChallengeEventRecorder;
  readonly speech?: ChallengePronunciation;
}

export interface ChallengeAttemptInput extends SessionAttemptInput {
  readonly challengeId: string;
}

export interface ChallengeRound {
  readonly challengeId: string;
  readonly status: FixedChallengeStatus;
  readonly wordIds: readonly string[];
  readonly startedAt: Date | null;
  readonly deadline: Date | null;
  readonly score: ChallengeScore;
  readonly lastAttempt: ChallengeAttempt | null;
}

export interface ChallengeOpening extends ChallengeRound {
  readonly words: readonly Word[];
}

export interface ChallengeResult {
  readonly challengeId: string;
  readonly status: FixedChallengeStatus;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly bestStreak: number;
  readonly score: number;
  readonly previousBest: number | null;
  readonly best: number | null;
  readonly isNewRecord: boolean;
}

export interface ChallengeComposition {
  start(visitorId: string): Promise<ChallengeOpening>;
  begin(challengeId: string, now: Date): Promise<void>;
  attempt(input: ChallengeAttemptInput, now: Date): Promise<ChallengeRound>;
  expire(challengeId: string, now: Date): Promise<ChallengeResult>;
  abandon(challengeId: string, now: Date): Promise<void>;
  result(challengeId: string): Promise<ChallengeResult>;
}

export class InsufficientChallengeCatalogError extends Error {
  readonly name = "InsufficientChallengeCatalogError";
  readonly state = INSUFFICIENT_CATALOG;

  constructor(cause?: unknown) {
    super("There are not enough words to open a challenge.");
    this.cause = cause;
  }
}

export function createChallengeComposition(
  dependencies: ChallengeCompositionDependencies,
): ChallengeComposition {
  const persist = (write: () => Promise<void>) => persistOrRecord(dependencies, write);
  const englishByChallenge = new Map<string, ReadonlyMap<string, string>>();

  const pronounceHit = (challengeId: string, wordId: string) => {
    const english = englishByChallenge.get(challengeId)?.get(wordId);
    if (dependencies.speech === undefined || english === undefined) {
      return;
    }
    try {
      dependencies.speech.pronounce(english);
    } catch {
      recordQuietly(dependencies, CHALLENGE_SPEECH_FAILED);
    }
  };

  const load = async (challengeId: string): Promise<StoredChallenge> => {
    const stored = await dependencies.repository.find(challengeId);
    if (stored === null) {
      throw new ChallengeNotStoredError(challengeId);
    }
    return stored;
  };

  const result = async (challengeId: string): Promise<ChallengeResult> => {
    const { challenge } = await load(challengeId);
    const record = await dependencies.repository.recordFor(challengeId);
    return toResult(challenge, record);
  };

  return {
    async start(visitorId) {
      const words = await drawWords(dependencies.catalog, visitorId);
      const challenge = FixedChallenge.create(
        { id: dependencies.createId(), visitorId },
        dependencies.clock,
      );
      const wordIds = words.map(({ id }) => id);
      await persist(() => dependencies.repository.create(challenge, wordIds));
      englishByChallenge.set(challenge.id, new Map(words.map(({ id, english }) => [id, english])));
      return { ...toRound(challenge, wordIds, null), words };
    },

    async begin(challengeId, now) {
      const { challenge } = await load(challengeId);
      challenge.begin(clockAt(now));
      await persist(() => dependencies.repository.save(challenge));
    },

    async attempt(input, now) {
      const { challenge, wordIds } = await load(input.challengeId);
      const attemptsBefore = challenge.attempts.length;
      const attempt = challenge.recordAttempt(
        {
          attemptId: input.attemptId,
          promptWordId: input.promptWordId,
          selectedWordId: input.selectedWordId,
        },
        clockAt(now),
      );
      await persist(() => dependencies.repository.save(challenge));
      const isNewHit = attempt.isCorrect && challenge.attempts.length > attemptsBefore;
      if (isNewHit) {
        pronounceHit(challenge.id, attempt.promptWordId);
      }
      return toRound(challenge, wordIds, attempt);
    },

    async expire(challengeId, now) {
      const { challenge } = await load(challengeId);
      englishByChallenge.delete(challengeId);
      if (challenge.status === "ACTIVE") {
        challenge.expire(clockAt(now));
        await persist(() => dependencies.repository.save(challenge));
      }
      return result(challengeId);
    },

    async abandon(challengeId, now) {
      const { challenge } = await load(challengeId);
      englishByChallenge.delete(challengeId);
      if (challenge.status !== "ACTIVE") {
        return;
      }
      challenge.abandon(clockAt(now));
      await persist(() => dependencies.repository.save(challenge));
    },

    result,
  };
}

async function drawWords(catalog: ChallengeWordSource, visitorId: string): Promise<readonly Word[]> {
  let words: readonly Word[];
  try {
    words = await catalog.drawChallengeWords({ visitorId, limit: CHALLENGE_WORD_LIMIT });
  } catch (cause) {
    if (cause instanceof InvalidWordCatalogError) {
      throw new InsufficientChallengeCatalogError(cause);
    }
    throw cause;
  }
  if (words.length === 0) {
    throw new InsufficientChallengeCatalogError();
  }
  return requireDistinctDraw(words);
}

function requireDistinctDraw(words: readonly Word[]): readonly Word[] {
  if (words.length > CHALLENGE_WORD_LIMIT) {
    throw new InvalidWordCatalogError(
      `Challenge draw returned ${words.length} words; the limit is ${CHALLENGE_WORD_LIMIT}.`,
    );
  }
  const ids = new Set(words.map(({ id }) => id));
  if (ids.size !== words.length) {
    throw new InvalidWordCatalogError("Challenge draw repeated a word.");
  }
  return words;
}

async function persistOrRecord(
  dependencies: ChallengeCompositionDependencies,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (cause) {
    dependencies.recordEvent(CHALLENGE_PERSIST_FAILED);
    throw cause;
  }
}

function recordQuietly(
  dependencies: ChallengeCompositionDependencies,
  event: ChallengeEvent,
): void {
  try {
    dependencies.recordEvent(event);
  } catch {
    // A failed log must not reach the round.
  }
}

function clockAt(now: Date): Clock {
  return { now: () => new Date(now) };
}

function toRound(
  challenge: FixedChallenge,
  wordIds: readonly string[],
  lastAttempt: ChallengeAttempt | null,
): ChallengeRound {
  return {
    challengeId: challenge.id,
    status: challenge.status,
    wordIds: [...wordIds],
    startedAt: challenge.startedAt,
    deadline: challenge.deadline,
    score: challenge.score,
    lastAttempt,
  };
}

function toResult(challenge: FixedChallenge, record: ChallengeRecordView): ChallengeResult {
  const score = challenge.score;
  const answers = score.correctAnswers + score.wrongAnswers;
  return {
    challengeId: challenge.id,
    status: challenge.status,
    correctAnswers: score.correctAnswers,
    wrongAnswers: score.wrongAnswers,
    accuracy: answers === 0 ? 0 : (score.correctAnswers / answers) * 100,
    bestStreak: score.bestStreak,
    score: score.score,
    previousBest: record.previousBest,
    best: record.best,
    isNewRecord: record.isNewRecord,
  };
}

export interface PreparedChallenge {
  readonly composition: ChallengeComposition;
  readonly visitorId: string;
}

export interface ChallengeScreenPortInput {
  readonly prepare: () => Promise<PreparedChallenge>;
}

/**
 * Gives the challenge screen one composition for the whole route, so the
 * pronunciation map kept by `start` stays available for every hit.
 */
export function createChallengeScreenPort(input: ChallengeScreenPortInput): ChallengeScreenPort {
  const composition = async () => (await input.prepare()).composition;
  return {
    async start(): Promise<ChallengeOpeningOutcome> {
      const prepared = await input.prepare();
      try {
        const opening = await prepared.composition.start(prepared.visitorId);
        return { kind: "opened", challengeId: opening.challengeId, words: opening.words };
      } catch (cause) {
        if (cause instanceof InsufficientChallengeCatalogError) {
          return { kind: "insufficientCatalog" };
        }
        throw cause;
      }
    },
    async begin(challengeId, now) {
      await (await composition()).begin(challengeId, now);
    },
    async attempt(input, now): Promise<ChallengeAttemptOutcome> {
      let round: ChallengeRound;
      try {
        round = await (await composition()).attempt(input, now);
      } catch (cause) {
        if (cause instanceof ChallengeTimeExpiredError || cause instanceof SessionEndedError) {
          return { kind: "late" };
        }
        throw cause;
      }
      const { score, streak, correctAnswers } = round.score;
      return { kind: "accepted", score, streak, correctAnswers };
    },
    async expire(challengeId, now) {
      return (await composition()).expire(challengeId, now);
    },
    async abandon(challengeId, now) {
      await (await composition()).abandon(challengeId, now);
    },
  };
}
