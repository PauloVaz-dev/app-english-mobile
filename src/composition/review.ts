import type { ChallengePronunciation } from "@/composition/challenge";
import type { PracticeAttemptInput } from "@/composition/practice";
import { NothingToReviewError } from "@/lib/application/review/errors";
import { FinishReviewSession } from "@/lib/application/review/finish-review-session";
import { completeWhenDone, readReviewView } from "@/lib/application/review/load-review-session";
import type { DailyReviewReader } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository } from "@/lib/application/review/ports/review-session-repository";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { RecordTypingAnswer, type RecordTypingAnswerResult } from "@/lib/application/review/record-typing-answer";
import type { ReviewSessionResultView, ReviewSessionView } from "@/lib/application/review/review-session-view";
import { StartDailyReview } from "@/lib/application/review/start-daily-review";
import { GameDomainError } from "@/lib/domain/game/errors";
import { createWord, type AttemptResult, type Clock, type SessionExposure, type Word } from "@/lib/domain/game/types";
import { InvalidReviewSessionError, ReviewDomainError, ReviewSessionNotFoundError } from "@/lib/domain/review";
import type { ReviewSession, ReviewStage } from "@/lib/domain/review";
import type { TypingOutcome } from "@/lib/domain/learning/typing-answer";
import type {
  ReviewScreenMatchInput,
  ReviewScreenPort,
  ReviewScreenTypingInput,
} from "@/lib/presentation/review/review-screen";
import type { TypingCardPrompt } from "@/lib/presentation/review/typing-card";
import type { RecordGameAttemptInput, RecordGameExposuresInput } from "@/persistence/sqlite-game-session-repository";

export const REVIEW_PERSIST_FAILED = "review.persist_failed";
export const REVIEW_SPEECH_FAILED = "review.speech_failed";
export const NOTHING_TO_REVIEW_MESSAGE = "nada para revisar";

export type ReviewEvent = typeof REVIEW_PERSIST_FAILED | typeof REVIEW_SPEECH_FAILED;
export type ReviewEventRecorder = (event: ReviewEvent) => void;

export interface ReviewBoardStore {
  recordExposures(input: RecordGameExposuresInput): Promise<readonly SessionExposure[]>;
  recordAttempt(input: RecordGameAttemptInput): Promise<AttemptResult>;
}

export interface ReviewCompositionDependencies {
  readonly repository: ReviewSessionRepository;
  readonly reader: DailyReviewReader;
  readonly preferences: VisitorPreferences;
  readonly board: ReviewBoardStore;
  readonly clock: Clock;
  readonly createId: () => string;
  readonly resolveTimeZone: (visitorId: string) => Promise<string>;
  readonly recordEvent: ReviewEventRecorder;
  readonly speech?: ChallengePronunciation;
}

export interface TypingSubmission {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly wordId: string;
  readonly kind: "answer" | "dont_know";
  readonly typed: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
}

export interface TypingFeedback {
  readonly outcome: TypingOutcome;
  readonly expected: string;
  readonly exampleSentence: string | null;
  readonly usedHint: boolean;
  readonly isReinforcement: boolean;
  readonly stage: ReviewStage;
  readonly typing: ReviewSessionView["typing"];
  readonly gameSessionId: string | null;
  readonly matchingSession: ReviewSessionView["matchingSession"];
  readonly result: ReviewSessionResultView | null;
}

export interface OpenedReview {
  readonly kind: "opened";
  readonly view: ReviewSessionView;
  readonly typingCount: number;
  readonly matchingCount: number;
  readonly newCount: number;
  readonly distractorCount: number;
}

export interface NothingToReview {
  readonly kind: "nothing";
  readonly message: typeof NOTHING_TO_REVIEW_MESSAGE;
}

export type ReviewStart = OpenedReview | NothingToReview;

export interface ReviewComposition {
  start(visitorId: string): Promise<ReviewStart>;
  type(input: TypingSubmission): Promise<TypingFeedback>;
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  match(input: PracticeAttemptInput): Promise<void>;
  finish(sessionId: string): Promise<ReviewSessionResultView>;
  abandon(sessionId: string): Promise<void>;
}

/** Gives the device voice a recorder that logs `review.speech_failed`. */
export function recordReviewSpeechFailure(recordEvent: ReviewEventRecorder): () => void {
  return () => {
    recordEvent(REVIEW_SPEECH_FAILED);
  };
}

/**
 * A write failed earlier, so calls already queued behind it are refused
 * without touching the database. The screen resends them after "Tentar de
 * novo"; the same `attemptId` keeps the grade.
 */
export class ReviewWritesHaltedError extends Error {
  readonly name = "ReviewWritesHaltedError";

  constructor(readonly sessionId: string) {
    super(`An earlier write failed; retry it before review ${sessionId}.`);
  }
}

class DatabaseQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export function createReviewComposition(dependencies: ReviewCompositionDependencies): ReviewComposition {
  const runtime = new ReviewRuntime(dependencies);
  return {
    start(visitorId) {
      return runtime.start(visitorId);
    },
    type(input) {
      return runtime.type(input);
    },
    expose(sessionId, wordIds) {
      return runtime.expose(sessionId, wordIds);
    },
    match(input) {
      return runtime.match(input);
    },
    finish(sessionId) {
      return runtime.finish(sessionId);
    },
    abandon(sessionId) {
      return runtime.abandon(sessionId);
    },
  };
}

class ReviewRuntime {
  private readonly queue = new DatabaseQueue();
  private failedEpoch = 0;
  private readonly visitors = new Map<string, string>();
  private readonly reviewByGame = new Map<string, string>();
  private readonly englishByWord = new Map<string, string>();
  private readonly spokenAttempts = new Set<string>();

  constructor(private readonly dependencies: ReviewCompositionDependencies) {}

  start(visitorId: string): Promise<ReviewStart> {
    return this.queue.run(async () => {
      try {
        return await this.openReview(visitorId);
      } catch (cause) {
        return this.failWrite(cause);
      }
    });
  }

  async type(input: TypingSubmission): Promise<TypingFeedback> {
    const feedback = await this.playWrite(input.sessionId, () => this.recordTyping(input));
    this.speakOnce(input.attemptId, feedback.expected);
    return feedback;
  }

  expose(sessionId: string, wordIds: readonly string[]): Promise<void> {
    return this.playWrite(sessionId, async () => {
      await this.dependencies.board.recordExposures({ sessionId, wordIds });
    });
  }

  async match(input: PracticeAttemptInput): Promise<void> {
    const outcome = await this.playWrite(input.sessionId, () => this.recordMatch(input));
    if (!outcome.isCorrect) {
      return;
    }
    const english = this.englishByWord.get(outcome.attempt.promptWordId);
    if (english !== undefined) {
      this.speakOnce(input.attemptId, english);
    }
  }

  finish(sessionId: string): Promise<ReviewSessionResultView> {
    return this.playWrite(sessionId, () => this.readResult(sessionId));
  }

  async abandon(sessionId: string): Promise<void> {
    await this.queue.run(async () => {
      try {
        await this.abandonIfActive(sessionId);
      } catch (cause) {
        this.failWrite(cause);
      }
    });
  }

  private async openReview(visitorId: string): Promise<ReviewStart> {
    const timeZone = await this.dependencies.resolveTimeZone(visitorId);
    await this.abandonActive(visitorId);
    try {
      const started = await this.startUseCase().execute({ visitorId, timeZone });
      this.remember(await this.dependencies.repository.findById(started.view.id));
      return {
        kind: "opened",
        view: started.view,
        typingCount: started.typingCount,
        matchingCount: started.matchingCount,
        newCount: started.newCount,
        distractorCount: started.distractorCount,
      };
    } catch (cause) {
      if (cause instanceof NothingToReviewError) {
        return { kind: "nothing", message: NOTHING_TO_REVIEW_MESSAGE };
      }
      throw cause;
    }
  }

  private async abandonActive(visitorId: string): Promise<void> {
    const active = await this.dependencies.repository.findActiveByVisitor(visitorId);
    if (active === null) {
      return;
    }
    await this.finishUseCase().execute({
      sessionId: active.id,
      visitorId: active.visitorId,
      reason: "abandoned",
    });
  }

  private async recordTyping(input: TypingSubmission): Promise<TypingFeedback> {
    const recorded = await this.answerUseCase().execute({
      sessionId: input.sessionId,
      visitorId: await this.visitorOf(input.sessionId),
      attemptId: input.attemptId,
      wordId: input.wordId,
      typedText: input.kind === "dont_know" ? null : input.typed,
      usedHint: input.usedHint,
      responseTimeMs: input.responseTimeMs,
    });
    return toTypingFeedback(recorded);
  }

  private async recordMatch(input: PracticeAttemptInput): Promise<AttemptResult> {
    const outcome = await this.dependencies.board.recordAttempt(input);
    await this.completeLinkedReview(input.sessionId);
    return outcome;
  }

  private async completeLinkedReview(gameSessionId: string): Promise<void> {
    const reviewId = this.reviewByGame.get(gameSessionId);
    if (reviewId === undefined) {
      return;
    }
    const session = await this.dependencies.repository.findById(reviewId);
    if (session === null) {
      return;
    }
    await completeWhenDone({ repository: this.dependencies.repository, session });
  }

  private async readResult(sessionId: string): Promise<ReviewSessionResultView> {
    const session = await this.dependencies.repository.findById(sessionId);
    if (session === null) {
      throw new ReviewSessionNotFoundError(sessionId);
    }
    const done = await completeWhenDone({ repository: this.dependencies.repository, session });
    const view = await readReviewView({
      session: done,
      reader: this.dependencies.reader,
      clock: this.dependencies.clock,
      repository: this.dependencies.repository,
    });
    if (view.result === null) {
      throw new InvalidReviewSessionError("The review is not finished.");
    }
    return view.result;
  }

  private async abandonIfActive(sessionId: string): Promise<void> {
    const session = await this.dependencies.repository.findById(sessionId);
    if (session === null) {
      throw new ReviewSessionNotFoundError(sessionId);
    }
    if (session.status !== "ACTIVE") {
      return;
    }
    await this.finishUseCase().execute({
      sessionId,
      visitorId: session.visitorId,
      reason: "abandoned",
    });
  }

  private async visitorOf(sessionId: string): Promise<string> {
    const cached = this.visitors.get(sessionId);
    if (cached !== undefined) {
      return cached;
    }
    const session = await this.dependencies.repository.findById(sessionId);
    if (session === null) {
      throw new ReviewSessionNotFoundError(sessionId);
    }
    this.visitors.set(session.id, session.visitorId);
    return session.visitorId;
  }

  private remember(session: ReviewSession | null): void {
    if (session === null) {
      return;
    }
    this.visitors.set(session.id, session.visitorId);
    if (session.gameSessionId !== null) {
      this.reviewByGame.set(session.gameSessionId, session.id);
    }
    for (const entry of session.words) {
      this.englishByWord.set(entry.word.id, entry.word.english);
    }
  }

  private playWrite<T>(sessionId: string, write: () => Promise<T>): Promise<T> {
    const epoch = this.failedEpoch;
    return this.queue.run(async () => {
      if (this.failedEpoch !== epoch) {
        throw new ReviewWritesHaltedError(sessionId);
      }
      try {
        return await write();
      } catch (cause) {
        return this.failWrite(cause);
      }
    });
  }

  private failWrite(cause: unknown): never {
    if (isStorageFailure(cause)) {
      this.failedEpoch += 1;
      recordQuietly(this.dependencies, REVIEW_PERSIST_FAILED);
    }
    throw cause;
  }

  private speakOnce(attemptId: string, english: string): void {
    if (this.spokenAttempts.has(attemptId) || this.dependencies.speech === undefined) {
      return;
    }
    this.spokenAttempts.add(attemptId);
    try {
      this.dependencies.speech.pronounce(english);
    } catch {
      recordQuietly(this.dependencies, REVIEW_SPEECH_FAILED);
    }
  }

  private startUseCase(): StartDailyReview {
    return new StartDailyReview({
      repository: this.dependencies.repository,
      reader: this.dependencies.reader,
      preferences: this.dependencies.preferences,
      clock: this.dependencies.clock,
      idGenerator: { generate: () => this.dependencies.createId() },
      onInvalidTimeZone: () => undefined,
    });
  }

  private answerUseCase(): RecordTypingAnswer {
    return new RecordTypingAnswer({
      repository: this.dependencies.repository,
      reader: this.dependencies.reader,
      preferences: this.dependencies.preferences,
      clock: this.dependencies.clock,
      onInvalidTimeZone: () => undefined,
    });
  }

  private finishUseCase(): FinishReviewSession {
    return new FinishReviewSession({
      repository: this.dependencies.repository,
      reader: this.dependencies.reader,
      clock: this.dependencies.clock,
    });
  }
}

function toTypingFeedback(recorded: RecordTypingAnswerResult): TypingFeedback {
  return {
    outcome: recorded.outcome,
    expected: recorded.expected,
    exampleSentence: recorded.exampleSentence,
    usedHint: recorded.usedHint,
    isReinforcement: recorded.isReinforcement,
    stage: recorded.view.stage,
    typing: recorded.view.typing,
    gameSessionId: recorded.view.gameSessionId,
    matchingSession: recorded.view.matchingSession,
    result: recorded.view.result,
  };
}

export interface ReviewScreenPortInput {
  readonly prepare: () => Promise<{ composition: ReviewComposition; visitorId: string }>;
}

export function createReviewScreenPort(input: ReviewScreenPortInput): ReviewScreenPort {
  const compositionOf = async () => (await input.prepare()).composition;
  return {
    async start() {
      const prepared = await input.prepare();
      const opening = await prepared.composition.start(prepared.visitorId);
      if (opening.kind === "nothing") {
        return { kind: "nothing" };
      }
      return {
        kind: "opened",
        sessionId: opening.view.id,
        stage: opening.view.stage,
        prompt: screenPrompt(opening.view.typing),
        typingRemaining: opening.view.typing.remaining,
        gameSessionId: opening.view.gameSessionId,
        matchingWords: screenWords(opening.view.matchingSession),
        typingCount: opening.typingCount,
        matchingCount: opening.matchingCount,
        distractorCount: opening.distractorCount,
        result: opening.view.result,
      };
    },
    async type(submission: ReviewScreenTypingInput) {
      const feedback = await (await compositionOf()).type(submission);
      return {
        outcome: feedback.outcome,
        expected: feedback.expected,
        exampleSentence: feedback.exampleSentence,
        stage: feedback.stage,
        prompt: screenPrompt(feedback.typing),
        typingRemaining: feedback.typing.remaining,
        gameSessionId: feedback.gameSessionId,
        matchingWords: screenWords(feedback.matchingSession),
        result: feedback.result,
      };
    },
    async expose(sessionId, wordIds) {
      await (await compositionOf()).expose(sessionId, wordIds);
    },
    async match(attempt: ReviewScreenMatchInput) {
      await (await compositionOf()).match(attempt);
    },
    async finish(sessionId) {
      return (await compositionOf()).finish(sessionId);
    },
    async abandon(sessionId) {
      await (await compositionOf()).abandon(sessionId);
    },
  };
}

function screenPrompt(typing: ReviewSessionView["typing"]): TypingCardPrompt | null {
  if (typing.current === null) {
    return null;
  }
  return {
    wordId: typing.current.wordId,
    portuguese: typing.current.portuguese,
    firstLetter: typing.current.firstLetter,
    reinforcement: typing.reinforcement,
  };
}

function screenWords(session: ReviewSessionView["matchingSession"]): readonly Word[] {
  if (session === null) {
    return [];
  }
  return session.words.map((entry) =>
    createWord({
      id: entry.id,
      english: entry.english,
      portuguese: entry.portuguese,
      exampleSentence: entry.exampleSentence,
    }),
  );
}

function isStorageFailure(cause: unknown): boolean {
  if (cause instanceof NothingToReviewError) {
    return false;
  }
  if (cause instanceof ReviewDomainError || cause instanceof GameDomainError) {
    return false;
  }
  if (cause instanceof ReviewWritesHaltedError) {
    return false;
  }
  return true;
}

function recordQuietly(dependencies: ReviewCompositionDependencies, event: ReviewEvent): void {
  try {
    dependencies.recordEvent(event);
  } catch {
    // A failed log must not reach the review.
  }
}
