import { GameSession } from "@/lib/domain/game/game-session";
import {
  type Clock,
  MAX_RESPONSE_TIME_MS,
  type Word,
  createWord,
} from "@/lib/domain/game/types";
import { isValidTimeZone, localDateOf } from "@/lib/domain/learning/local-day";
import type { ReviewGrade } from "@/lib/domain/learning/review-schedule";
import { evaluateTypedAnswer, type TypingOutcome } from "@/lib/domain/learning/typing-answer";
import { gradeTypingAnswer } from "@/lib/domain/learning/typing-review";

import {
  InvalidReviewSessionError,
  InvalidTypingAttemptError,
  ReviewAttemptConflictError,
  ReviewSessionEndedError,
  ReviewWordNotInSessionError,
  UnexpectedTypingWordError,
} from "./errors";

export const REVIEW_SESSION_STATUSES = ["ACTIVE", "COMPLETED", "ABANDONED"] as const;
export type ReviewSessionStatus = (typeof REVIEW_SESSION_STATUSES)[number];
export type FinishedReviewSessionStatus = Exclude<ReviewSessionStatus, "ACTIVE">;

export const REVIEW_STAGES = ["TYPING", "MATCHING", "DONE"] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

export const REVIEW_WORD_STAGES = ["TYPING", "MATCHING"] as const;
export type ReviewWordStage = (typeof REVIEW_WORD_STAGES)[number];

export const REVIEW_WORD_ORIGINS = ["DUE", "NEW", "DISTRACTOR"] as const;
export type ReviewWordOrigin = (typeof REVIEW_WORD_ORIGINS)[number];

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReviewSessionWordInput {
  readonly word: Parameters<typeof createWord>[0];
  readonly stage: ReviewWordStage;
  readonly origin: ReviewWordOrigin;
}

export interface StartReviewSessionInput {
  readonly id: string;
  readonly visitorId: string;
  readonly timeZone: string;
  readonly words: readonly ReviewSessionWordInput[];
  readonly gameSessionId: string | null;
}

export interface ReviewSessionWord {
  readonly word: Word;
  readonly sequence: number;
  readonly stage: ReviewWordStage;
  readonly origin: ReviewWordOrigin;
}

export interface TypingAttempt {
  readonly attemptId: string;
  readonly sequence: number;
  readonly wordId: string;
  readonly outcome: TypingOutcome;
  readonly typedText: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
  readonly grade: ReviewGrade | null;
  readonly isReinforcement: boolean;
  readonly createdAt: Date;
}

export interface ReviewSessionSnapshot {
  readonly id: string;
  readonly visitorId: string;
  readonly localDate: string;
  readonly timeZone: string;
  readonly status: ReviewSessionStatus;
  readonly gameSessionId: string | null;
  readonly matchingFinished: boolean;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly words: readonly ReviewSessionWord[];
  readonly attempts: readonly TypingAttempt[];
}

export interface RecordTypingAttemptInput {
  readonly attemptId: string;
  readonly wordId: string;
  readonly typedText: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
}

export interface TypingAttemptOutcome {
  readonly outcome: TypingOutcome;
  readonly expected: string;
  readonly exampleSentence: string | null;
  readonly grade: ReviewGrade | null;
  readonly isReinforcement: boolean;
}

interface MutableReviewWord {
  word: Word;
  sequence: number;
  stage: ReviewWordStage;
  origin: ReviewWordOrigin;
}

interface TypingStep {
  readonly word: MutableReviewWord;
  readonly reinforcement: boolean;
}

export class ReviewSession {
  readonly id: string;
  readonly visitorId: string;
  readonly localDate: string;
  readonly timeZone: string;
  readonly gameSessionId: string | null;

  private currentStatus: ReviewSessionStatus;
  private matchingFinished: boolean;
  private readonly sessionWords: MutableReviewWord[];
  private readonly recordedAttempts: TypingAttempt[];
  private readonly startTime: Date;
  private finishTime: Date | null;

  private constructor(snapshot: ReviewSessionSnapshot) {
    this.id = snapshot.id;
    this.visitorId = snapshot.visitorId;
    this.localDate = snapshot.localDate;
    this.timeZone = snapshot.timeZone;
    this.gameSessionId = snapshot.gameSessionId;
    this.currentStatus = snapshot.status;
    this.matchingFinished = snapshot.matchingFinished;
    this.sessionWords = snapshot.words.map(cloneWord);
    this.recordedAttempts = snapshot.attempts.map(cloneAttempt);
    this.startTime = cloneRequiredDate(snapshot.startedAt, "startedAt");
    this.finishTime = cloneDate(snapshot.finishedAt);
  }

  static start(input: StartReviewSessionInput, clock: Clock): ReviewSession {
    const id = requireIdentifier(input.id, "Session id");
    const visitorId = requireIdentifier(input.visitorId, "Visitor id");
    const timeZone = requireTimeZone(input.timeZone);
    const startedAt = readClock(clock);
    const words = normalizeWords(input.words);
    const gameSessionId = normalizeGameLink(input.gameSessionId, words);
    return new ReviewSession({
      id,
      visitorId,
      localDate: localDateOf(startedAt, timeZone),
      timeZone,
      status: "ACTIVE",
      gameSessionId,
      matchingFinished: false,
      startedAt,
      finishedAt: null,
      words,
      attempts: [],
    });
  }

  static restore(snapshot: ReviewSessionSnapshot): ReviewSession {
    validateSnapshot(snapshot);
    return new ReviewSession(snapshot);
  }

  assertLinkedGame(game: GameSession | null): void {
    const matchingWords = this.sessionWords.filter((entry) => entry.stage === "MATCHING");
    if (game === null) {
      if (this.gameSessionId !== null || matchingWords.length > 0) {
        throw new InvalidReviewSessionError(
          "A review with matching words requires its linked game.",
        );
      }
      return;
    }
    if (this.gameSessionId !== game.id) {
      throw new InvalidReviewSessionError(
        "The linked game id does not match the review.",
      );
    }
    if (game.visitorId !== this.visitorId) {
      throw new InvalidReviewSessionError(
        "The linked game belongs to a different visitor.",
      );
    }
    if (game.mode !== "REVIEW") {
      throw new InvalidReviewSessionError("The linked game must be a review game.");
    }
    if (game.status !== "ACTIVE") {
      throw new InvalidReviewSessionError("The linked game must still be active.");
    }
    if (game.words.length !== matchingWords.length) {
      throw new InvalidReviewSessionError(
        "The linked game must contain exactly the matching-stage words.",
      );
    }
    const matchingById = new Map(matchingWords.map((entry) => [entry.word.id, entry]));
    for (const entry of game.words) {
      const reviewWord = matchingById.get(entry.word.id);
      if (!reviewWord) {
        throw new InvalidReviewSessionError(
          `Game word ${entry.word.id} is not a matching word of this review.`,
        );
      }
      const graded = reviewWord.origin !== "DISTRACTOR";
      if (entry.graded !== graded) {
        throw new InvalidReviewSessionError(
          `Game word ${entry.word.id} grading does not match its review origin.`,
        );
      }
    }
  }

  get status(): ReviewSessionStatus {
    return this.currentStatus;
  }

  get startedAt(): Date {
    return new Date(this.startTime);
  }

  get finishedAt(): Date | null {
    return cloneDate(this.finishTime);
  }

  get words(): readonly ReviewSessionWord[] {
    return this.sessionWords.map(cloneWord);
  }

  get attempts(): readonly TypingAttempt[] {
    return this.recordedAttempts.map(cloneAttempt);
  }

  get stage(): ReviewStage {
    if (this.nextTypingStep() !== null) {
      return "TYPING";
    }
    if (this.gameSessionId !== null && !this.matchingFinished) {
      return "MATCHING";
    }
    return "DONE";
  }

  get typingRemaining(): number {
    const typingWords = this.typingWords();
    const firstPending = typingWords.filter((entry) => !this.firstAttempt(entry.word.id)).length;
    const reinforcementPending = typingWords.filter((entry) =>
      this.needsReinforcement(entry.word.id),
    ).length;
    return firstPending + reinforcementPending;
  }

  get currentTyping(): { readonly wordId: string; readonly reinforcement: boolean } | null {
    const step = this.nextTypingStep();
    if (!step) return null;
    return { wordId: step.word.word.id, reinforcement: step.reinforcement };
  }

  recordTypingAttempt(
    input: RecordTypingAttemptInput,
    clock: Clock,
  ): TypingAttemptOutcome {
    const normalized = validateTypingInput(input);
    const existing = this.recordedAttempts.find(
      (attempt) => attempt.attemptId === normalized.attemptId,
    );
    if (existing) {
      if (!sameTypingInput(existing, normalized)) {
        throw new ReviewAttemptConflictError(normalized.attemptId);
      }
      return outcomeOf(existing, this.wordById(existing.wordId).word);
    }

    this.assertActive();
    const step = this.nextTypingStep();
    if (!step) {
      throw new InvalidTypingAttemptError("The typing stage is already finished.");
    }
    if (!this.typingWords().some((entry) => entry.word.id === normalized.wordId)) {
      throw new ReviewWordNotInSessionError(normalized.wordId);
    }
    if (step.word.word.id !== normalized.wordId) {
      throw new UnexpectedTypingWordError(normalized.wordId);
    }

    const attempt = buildTypingAttempt({
      input: normalized,
      step,
      sequence: this.recordedAttempts.length,
      occurredAt: readAttemptTime(clock, this.startTime),
    });
    this.recordedAttempts.push(attempt);
    return outcomeOf(attempt, step.word.word);
  }

  abandon(clock: Clock): void {
    this.assertActive();
    const finishedAt = readClock(clock);
    assertNotBefore(finishedAt, this.startTime, "Finish time");
    this.currentStatus = "ABANDONED";
    this.finishTime = finishedAt;
  }

  complete(clock: Clock): void {
    this.assertActive();
    if (this.stage !== "DONE") {
      throw new InvalidReviewSessionError(
        "A review can be completed only after every stage is finished.",
      );
    }
    const finishedAt = readClock(clock);
    assertNotBefore(finishedAt, this.startTime, "Finish time");
    this.currentStatus = "COMPLETED";
    this.finishTime = finishedAt;
  }

  toSnapshot(): ReviewSessionSnapshot {
    return {
      id: this.id,
      visitorId: this.visitorId,
      localDate: this.localDate,
      timeZone: this.timeZone,
      status: this.currentStatus,
      gameSessionId: this.gameSessionId,
      matchingFinished: this.matchingFinished,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      words: this.words,
      attempts: this.attempts,
    };
  }

  private assertActive(): void {
    if (this.currentStatus !== "ACTIVE") {
      throw new ReviewSessionEndedError(this.currentStatus);
    }
  }

  private typingWords(): readonly MutableReviewWord[] {
    return this.sessionWords
      .filter((entry) => entry.stage === "TYPING")
      .sort((left, right) => left.sequence - right.sequence);
  }

  private nextTypingStep(): TypingStep | null {
    const typingWords = this.typingWords();
    const pendingFirst = typingWords.find((entry) => !this.firstAttempt(entry.word.id));
    if (pendingFirst) {
      return { word: pendingFirst, reinforcement: false };
    }
    const pendingReinforcement = typingWords.find((entry) =>
      this.needsReinforcement(entry.word.id),
    );
    if (pendingReinforcement) {
      return { word: pendingReinforcement, reinforcement: true };
    }
    return null;
  }

  private firstAttempt(wordId: string): TypingAttempt | undefined {
    return this.recordedAttempts.find(
      (attempt) => attempt.wordId === wordId && !attempt.isReinforcement,
    );
  }

  private needsReinforcement(wordId: string): boolean {
    const first = this.firstAttempt(wordId);
    if (!first || first.grade !== "AGAIN") return false;
    return !this.recordedAttempts.some(
      (attempt) => attempt.wordId === wordId && attempt.isReinforcement,
    );
  }

  private wordById(wordId: string): MutableReviewWord {
    const entry = this.sessionWords.find((word) => word.word.id === wordId);
    if (!entry) {
      throw new ReviewWordNotInSessionError(wordId);
    }
    return entry;
  }
}

function outcomeOf(attempt: TypingAttempt, word: Word): TypingAttemptOutcome {
  return {
    outcome: attempt.outcome,
    expected: word.english,
    exampleSentence: word.exampleSentence,
    grade: attempt.grade,
    isReinforcement: attempt.isReinforcement,
  };
}

function buildTypingAttempt(input: {
  readonly input: RecordTypingAttemptInput;
  readonly step: TypingStep;
  readonly sequence: number;
  readonly occurredAt: Date;
}): TypingAttempt {
  const outcome = classifyOutcome(input.step.word.word.english, input.input.typedText);
  return {
    attemptId: input.input.attemptId,
    sequence: input.sequence,
    wordId: input.input.wordId,
    outcome,
    typedText: input.input.typedText,
    usedHint: input.input.usedHint,
    responseTimeMs: input.input.responseTimeMs,
    grade: input.step.reinforcement
      ? null
      : gradeTypingAnswer({
          outcome,
          usedHint: input.input.usedHint,
          responseTimeMs: input.input.responseTimeMs,
        }),
    isReinforcement: input.step.reinforcement,
    createdAt: input.occurredAt,
  };
}

function readAttemptTime(clock: Clock, startedAt: Date): Date {
  const occurredAt = readClock(clock);
  assertNotBefore(occurredAt, startedAt, "Attempt time");
  return occurredAt;
}

function classifyOutcome(expected: string, typedText: string | null): TypingOutcome {
  if (typedText === null) return "DONT_KNOW";
  return evaluateTypedAnswer(expected, typedText);
}

function normalizeWords(words: readonly ReviewSessionWordInput[]): ReviewSessionWord[] {
  if (words.length === 0) {
    throw new InvalidReviewSessionError("A review needs at least one word.");
  }
  const seen = new Set<string>();
  return words.map((entry, sequence) => {
    if (!REVIEW_WORD_STAGES.includes(entry.stage)) {
      throw new InvalidReviewSessionError("Review word stage must be TYPING or MATCHING.");
    }
    if (!REVIEW_WORD_ORIGINS.includes(entry.origin)) {
      throw new InvalidReviewSessionError("Review word origin must be DUE, NEW, or DISTRACTOR.");
    }
    const word = createWord(entry.word);
    if (!word.active) {
      throw new InvalidReviewSessionError("A review cannot contain inactive words.");
    }
    if (seen.has(word.id)) {
      throw new InvalidReviewSessionError(`Duplicate review word: ${word.id}.`);
    }
    seen.add(word.id);
    if (entry.stage === "TYPING" && entry.origin !== "DUE") {
      throw new InvalidReviewSessionError("Typing words must be due review words.");
    }
    if (entry.origin === "NEW" && entry.stage !== "MATCHING") {
      throw new InvalidReviewSessionError("New words belong to the matching stage.");
    }
    if (entry.origin === "DISTRACTOR" && entry.stage !== "MATCHING") {
      throw new InvalidReviewSessionError("Distractors belong to the matching stage.");
    }
    return { word, sequence, stage: entry.stage, origin: entry.origin };
  });
}

function normalizeGameLink(
  gameSessionId: string | null,
  words: readonly ReviewSessionWord[],
): string | null {
  const hasMatching = words.some((entry) => entry.stage === "MATCHING");
  if (gameSessionId === null) {
    if (hasMatching) {
      throw new InvalidReviewSessionError(
        "Matching words require a linked game session.",
      );
    }
    return null;
  }
  if (!hasMatching) {
    throw new InvalidReviewSessionError(
      "A linked game requires at least one matching word.",
    );
  }
  return requireIdentifier(gameSessionId, "Game session id");
}

function validateTypingInput(input: RecordTypingAttemptInput): RecordTypingAttemptInput {
  const attemptId = requireIdentifier(input.attemptId, "Attempt id");
  const wordId = requireIdentifier(input.wordId, "Word id");
  if (input.typedText !== null && typeof input.typedText !== "string") {
    throw new InvalidTypingAttemptError("Typed text must be a string or null.");
  }
  if (typeof input.usedHint !== "boolean") {
    throw new InvalidTypingAttemptError("Hint flag must be a boolean.");
  }
  if (
    !Number.isInteger(input.responseTimeMs) ||
    input.responseTimeMs < 0 ||
    input.responseTimeMs > MAX_RESPONSE_TIME_MS
  ) {
    throw new InvalidTypingAttemptError(
      `Response time must be an integer from 0 through ${MAX_RESPONSE_TIME_MS} ms.`,
    );
  }
  return {
    attemptId,
    wordId,
    typedText: input.typedText,
    usedHint: input.usedHint,
    responseTimeMs: input.responseTimeMs,
  };
}

function sameTypingInput(
  attempt: TypingAttempt,
  input: RecordTypingAttemptInput,
): boolean {
  return (
    attempt.wordId === input.wordId &&
    attempt.typedText === input.typedText &&
    attempt.usedHint === input.usedHint &&
    attempt.responseTimeMs === input.responseTimeMs
  );
}

function validateSnapshot(snapshot: ReviewSessionSnapshot): void {
  requireIdentifier(snapshot.id, "Session id");
  requireIdentifier(snapshot.visitorId, "Visitor id");
  requireTimeZone(snapshot.timeZone);
  if (!LOCAL_DATE.test(snapshot.localDate)) {
    throw new InvalidReviewSessionError("Local date must be YYYY-MM-DD.");
  }
  if (!REVIEW_SESSION_STATUSES.includes(snapshot.status)) {
    throw new InvalidReviewSessionError("Snapshot status is invalid.");
  }
  if (snapshot.gameSessionId === null) {
    if (snapshot.matchingFinished) {
      throw new InvalidReviewSessionError(
        "A review without a game cannot have a finished matching stage.",
      );
    }
  } else {
    requireIdentifier(snapshot.gameSessionId, "Game session id");
  }
  const startedAt = cloneRequiredDate(snapshot.startedAt, "startedAt");
  const finishedAt = cloneDate(snapshot.finishedAt);
  assertReviewTimeline(snapshot, startedAt, finishedAt);
  const words = normalizeWords(
    snapshot.words.map((entry) => ({
      word: entry.word,
      stage: entry.stage,
      origin: entry.origin,
    })),
  );
  const sequences = [...snapshot.words.map((entry) => entry.sequence)].sort(
    (left, right) => left - right,
  );
  if (sequences.some((sequence, index) => sequence !== index)) {
    throw new InvalidReviewSessionError("Review word sequence must be contiguous and unique.");
  }
  if (words.some((entry) => entry.stage === "MATCHING") !== (snapshot.gameSessionId !== null)) {
    throw new InvalidReviewSessionError("Matching words and the linked game must agree.");
  }
  validateAttempts({
    attempts: snapshot.attempts,
    words,
    startedAt,
    finishedAt,
  });
}

function assertReviewTimeline(
  snapshot: ReviewSessionSnapshot,
  startedAt: Date,
  finishedAt: Date | null,
): void {
  if (snapshot.status === "ACTIVE" && finishedAt !== null) {
    throw new InvalidReviewSessionError("An active review cannot have a finish time.");
  }
  if (snapshot.status !== "ACTIVE" && finishedAt === null) {
    throw new InvalidReviewSessionError("A finished review needs a finish time.");
  }
  if (finishedAt && finishedAt.getTime() < startedAt.getTime()) {
    throw new InvalidReviewSessionError("Finish time cannot precede the start time.");
  }
  if (snapshot.localDate !== localDateOf(startedAt, snapshot.timeZone)) {
    throw new InvalidReviewSessionError("Local date does not match the start time.");
  }
}

function validateAttempts(input: {
  readonly attempts: readonly TypingAttempt[];
  readonly words: readonly ReviewSessionWord[];
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}): void {
  const { attempts, words, startedAt, finishedAt } = input;
  const typingIds = new Set(
    words.filter((entry) => entry.stage === "TYPING").map((entry) => entry.word.id),
  );
  const seenAttemptIds = new Set<string>();
  const gradedByWord = new Set<string>();
  const reinforcedByWord = new Set<string>();
  const ordered = [...attempts].sort((left, right) => left.sequence - right.sequence);
  if (ordered.some((attempt, index) => attempt.sequence !== index)) {
    throw new InvalidReviewSessionError("Typing attempt sequence must be contiguous and unique.");
  }
  for (const attempt of ordered) {
    assertAttemptIdentity({ attempt, seenAttemptIds, typingIds, startedAt, finishedAt });
    if (attempt.isReinforcement) {
      assertReinforcement({ attempt, attempts, gradedByWord, reinforcedByWord });
      continue;
    }
    if (attempt.grade === null || gradedByWord.has(attempt.wordId)) {
      throw new InvalidReviewSessionError("Only the first attempt of a word receives a grade.");
    }
    gradedByWord.add(attempt.wordId);
  }
}

function assertAttemptIdentity(input: {
  readonly attempt: TypingAttempt;
  readonly seenAttemptIds: Set<string>;
  readonly typingIds: ReadonlySet<string>;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}): void {
  requireIdentifier(input.attempt.attemptId, "Attempt id");
  if (input.seenAttemptIds.has(input.attempt.attemptId)) {
    throw new InvalidReviewSessionError(`Duplicate attempt id: ${input.attempt.attemptId}.`);
  }
  input.seenAttemptIds.add(input.attempt.attemptId);
  if (!input.typingIds.has(input.attempt.wordId)) {
    throw new InvalidReviewSessionError(
      `Typing attempt ${input.attempt.attemptId} does not belong to a typing word.`,
    );
  }
  if (input.attempt.createdAt.getTime() < input.startedAt.getTime()) {
    throw new InvalidReviewSessionError("A typing attempt cannot precede the review.");
  }
  if (input.finishedAt && input.attempt.createdAt.getTime() > input.finishedAt.getTime()) {
    throw new InvalidReviewSessionError("A typing attempt cannot follow the finish time.");
  }
}

function assertReinforcement(input: {
  readonly attempt: TypingAttempt;
  readonly attempts: readonly TypingAttempt[];
  readonly gradedByWord: ReadonlySet<string>;
  readonly reinforcedByWord: Set<string>;
}): void {
  if (input.attempt.grade !== null) {
    throw new InvalidReviewSessionError("Reinforcement does not receive a grade.");
  }
  if (
    input.reinforcedByWord.has(input.attempt.wordId) ||
    !input.gradedByWord.has(input.attempt.wordId)
  ) {
    throw new InvalidReviewSessionError("Reinforcement must follow a single graded attempt.");
  }
  const graded = input.attempts.find(
    (candidate) => candidate.wordId === input.attempt.wordId && !candidate.isReinforcement,
  );
  if (graded?.grade !== "AGAIN") {
    throw new InvalidReviewSessionError("Only an AGAIN grade returns for reinforcement.");
  }
  input.reinforcedByWord.add(input.attempt.wordId);
}

function requireTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || !isValidTimeZone(timeZone)) {
    throw new InvalidReviewSessionError("Time zone must be a valid IANA name.");
  }
  return timeZone;
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidReviewSessionError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readClock(clock: Clock): Date {
  const now = clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InvalidReviewSessionError("Clock must return a valid date.");
  }
  return new Date(now);
}

function assertNotBefore(value: Date, earliest: Date, field: string): void {
  if (value.getTime() < earliest.getTime()) {
    throw new InvalidReviewSessionError(`${field} cannot precede the review start.`);
  }
}

function cloneWord(entry: ReviewSessionWord): MutableReviewWord {
  return {
    word: createWord(entry.word),
    sequence: entry.sequence,
    stage: entry.stage,
    origin: entry.origin,
  };
}

function cloneAttempt(attempt: TypingAttempt): TypingAttempt {
  return {
    ...attempt,
    createdAt: new Date(attempt.createdAt),
  };
}

function cloneDate(value: Date | null): Date | null {
  return value ? new Date(value) : null;
}

function cloneRequiredDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidReviewSessionError(`${field} must be a valid date.`);
  }
  return new Date(value);
}
