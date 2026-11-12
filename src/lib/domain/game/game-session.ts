import {
  AttemptConflictError,
  InvalidAttemptError,
  InvalidExposureBatchError,
  InvalidGameSessionError,
  SessionEndedError,
  WordAlreadyCompletedError,
  WordNotInSessionError,
} from "./errors";
import {
  type AttemptResult,
  BOARD_PAIR_LIMIT,
  type Clock,
  type GameAttempt,
  type GameMetrics,
  type GameResult,
  type GameSessionMode,
  type GameSessionSnapshot,
  type GameSessionStatus,
  GAME_SESSION_MODES,
  GAME_SESSION_STATUSES,
  type LegacyGameSessionSnapshot,
  MAX_RESPONSE_TIME_MS,
  MAX_SESSION_WORDS,
  MIN_SESSION_WORDS,
  type RecordAttemptInput,
  type SessionExposure,
  type SessionWord,
  type StartableGameSessionMode,
  type Word,
  createWord,
} from "./types";

interface StartGameSessionInput {
  readonly id: string;
  readonly visitorId: string;
  readonly words: readonly Word[];
  readonly mode?: StartableGameSessionMode;
  readonly ungradedWordIds?: readonly string[];
}

interface MutableSessionWord {
  word: Word;
  sequence: number;
  presentedAt: Date | null;
  completedAt: Date | null;
  graded: boolean;
}

export class GameSession {
  readonly id: string;
  readonly visitorId: string;
  readonly mode: GameSessionMode;
  readonly targetWords: number;

  private currentStatus: GameSessionStatus;
  private readonly sessionWords: MutableSessionWord[];
  private readonly recordedAttempts: GameAttempt[];
  private readonly startTime: Date;
  private finishTime: Date | null;

  private constructor(snapshot: GameSessionSnapshot) {
    this.id = snapshot.id;
    this.visitorId = snapshot.visitorId;
    this.mode = snapshot.mode;
    this.targetWords = snapshot.targetWords;
    this.currentStatus = snapshot.status;
    this.sessionWords = snapshot.words.map((entry) => ({
      word: createWord(entry.word),
      sequence: entry.sequence,
      presentedAt: cloneDate(entry.presentedAt),
      completedAt: cloneDate(entry.completedAt),
      graded: entry.graded,
    }));
    this.recordedAttempts = snapshot.attempts.map(cloneAttempt);
    this.startTime = cloneRequiredDate(snapshot.startedAt, "startedAt");
    this.finishTime = cloneDate(snapshot.finishedAt);
  }

  static start(input: StartGameSessionInput, clock: Clock): GameSession {
    const id = requireIdentifier(input.id, "Session id");
    const visitorId = requireIdentifier(input.visitorId, "Visitor id");
    const mode = resolveStartMode(input.mode);
    validateSessionWords(input.words, mode);
    const ungradedWordIds = resolveUngradedWordIds(
      input.words,
      mode,
      input.ungradedWordIds,
    );
    const startedAt = readClock(clock);
    return new GameSession({
      id,
      visitorId,
      mode,
      status: "ACTIVE",
      targetWords: input.words.length,
      words: input.words.map((word, sequence) => ({
        word: createWord(word),
        sequence,
        presentedAt: null,
        completedAt: null,
        graded: !ungradedWordIds.has(word.id),
      })),
      attempts: [],
      startedAt,
      finishedAt: null,
    });
  }

  static restore(snapshot: LegacyGameSessionSnapshot): GameSession {
    const canonical = canonicalizeSnapshot(snapshot);
    validateSnapshot(canonical);
    return new GameSession(canonical);
  }

  gradesWord(wordId: string): boolean {
    if (this.mode !== "REVIEW") return false;
    const entry = this.sessionWords.find(({ word }) => word.id === wordId);
    return entry?.graded === true;
  }

  get status(): GameSessionStatus {
    return this.currentStatus;
  }

  get words(): readonly SessionWord[] {
    return this.sessionWords.map(cloneSessionWord);
  }

  get attempts(): readonly GameAttempt[] {
    return this.recordedAttempts.map(cloneAttempt);
  }

  get startedAt(): Date {
    return new Date(this.startTime);
  }

  get finishedAt(): Date | null {
    return cloneDate(this.finishTime);
  }

  get correctAnswers(): number {
    return this.recordedAttempts.filter((attempt) => attempt.isCorrect).length;
  }

  get wrongAnswers(): number {
    return this.recordedAttempts.length - this.correctAnswers;
  }

  get completedWords(): number {
    return this.sessionWords.filter((entry) => entry.completedAt !== null).length;
  }

  get result(): GameResult | null {
    if (this.currentStatus === "ACTIVE" || this.finishTime === null) {
      return null;
    }
    return {
      ...this.calculateMetrics(this.finishTime),
      status: this.currentStatus,
      finishedAt: new Date(this.finishTime),
    };
  }

  recordAttempt(input: RecordAttemptInput, clock: Clock): AttemptResult {
    const normalized = validateAttemptInput(input);
    const existing = this.recordedAttempts.find(
      (attempt) => attempt.attemptId === normalized.attemptId,
    );
    if (existing) {
      if (!sameAttemptInput(existing, normalized)) {
        throw new AttemptConflictError(normalized.attemptId);
      }
      return this.attemptResult(existing);
    }
    this.assertActive();
    const prompt = this.findSessionWord(normalized.promptWordId);
    const selected = this.findSessionWord(normalized.selectedWordId);
    if (prompt.completedAt !== null) {
      throw new WordAlreadyCompletedError(prompt.word.id);
    }
    if (selected.completedAt !== null) {
      throw new WordAlreadyCompletedError(selected.word.id);
    }
    const occurredAt = readClock(clock);
    assertNotBefore(occurredAt, this.startTime, "Attempt time");
    const isCorrect = prompt.word.id === selected.word.id;
    const attempt: GameAttempt = {
      ...normalized,
      isCorrect,
      occurredAt,
    };
    this.recordedAttempts.push(attempt);
    if (isCorrect) {
      prompt.completedAt = new Date(occurredAt);
      if (this.completedWords === this.targetWords) {
        this.currentStatus = "COMPLETED";
        this.finishTime = new Date(occurredAt);
      }
    }
    return this.attemptResult(attempt);
  }

  abandon(clock: Clock): void {
    this.assertActive();
    const finishedAt = readClock(clock);
    assertNotBefore(finishedAt, this.startTime, "Finish time");
    this.currentStatus = "ABANDONED";
    this.finishTime = finishedAt;
  }

  recordExposures(
    wordIds: readonly string[],
    clock: Clock,
  ): readonly SessionExposure[] {
    this.assertActive();
    const normalized = validateExposureBatch(wordIds);
    const occurredAt = readClock(clock);
    assertNotBefore(occurredAt, this.startTime, "Exposure time");
    return normalized.map((wordId) => {
      const entry = this.findSessionWord(wordId);
      const isNew = entry.presentedAt === null;
      if (isNew) {
        entry.presentedAt = new Date(occurredAt);
      }
      return {
        wordId,
        presentedAt: cloneRequiredDate(entry.presentedAt, "presentedAt"),
        isNew,
      };
    });
  }

  metrics(clock: Clock): GameMetrics {
    const measuredAt = this.finishTime ?? readClock(clock);
    assertNotBefore(measuredAt, this.startTime, "Measurement time");
    return this.calculateMetrics(measuredAt);
  }

  toSnapshot(): GameSessionSnapshot {
    return {
      id: this.id,
      visitorId: this.visitorId,
      mode: this.mode,
      status: this.currentStatus,
      targetWords: this.targetWords,
      words: this.words,
      attempts: this.attempts,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  private assertActive(): void {
    if (this.currentStatus !== "ACTIVE") {
      throw new SessionEndedError(this.currentStatus);
    }
  }

  private findSessionWord(wordId: string): MutableSessionWord {
    const entry = this.sessionWords.find(({ word }) => word.id === wordId);
    if (!entry) {
      throw new WordNotInSessionError(wordId);
    }
    return entry;
  }

  private attemptResult(attempt: GameAttempt): AttemptResult {
    const attemptIndex = this.recordedAttempts.findIndex(
      ({ attemptId }) => attemptId === attempt.attemptId,
    );
    const attemptsAtResult = this.recordedAttempts.slice(0, attemptIndex + 1);
    const correctAnswers = attemptsAtResult.filter(
      (recordedAttempt) => recordedAttempt.isCorrect,
    ).length;
    const status =
      correctAnswers === this.targetWords ? "COMPLETED" : "ACTIVE";
    const metrics = this.calculateMetricsFor(
      attemptsAtResult,
      status,
      attempt.occurredAt,
    );
    return {
      attempt: cloneAttempt(attempt),
      isCorrect: attempt.isCorrect,
      completedWordId: attempt.isCorrect ? attempt.promptWordId : null,
      revealedExposure: null,
      metrics,
      result:
        status === "COMPLETED"
          ? {
              ...metrics,
              status,
              finishedAt: new Date(attempt.occurredAt),
            }
          : null,
    };
  }

  private calculateMetrics(measuredAt: Date): GameMetrics {
    return this.calculateMetricsFor(
      this.recordedAttempts,
      this.currentStatus,
      measuredAt,
    );
  }

  private calculateMetricsFor(
    attempts: readonly GameAttempt[],
    status: GameSessionStatus,
    measuredAt: Date,
  ): GameMetrics {
    const totalAttempts = attempts.length;
    const correctAnswers = attempts.filter((entry) => entry.isCorrect).length;
    const totalResponseTime = attempts.reduce(
      (total, attempt) => total + attempt.responseTimeMs,
      0,
    );
    return {
      status,
      targetWords: this.targetWords,
      completedWords: correctAnswers,
      correctAnswers,
      wrongAnswers: totalAttempts - correctAnswers,
      accuracy: totalAttempts === 0 ? 0 : (correctAnswers / totalAttempts) * 100,
      averageResponseTimeMs:
        totalAttempts === 0 ? 0 : totalResponseTime / totalAttempts,
      durationMs: measuredAt.getTime() - this.startTime.getTime(),
    };
  }
}

function validateExposureBatch(wordIds: readonly string[]): readonly string[] {
  if (wordIds.length === 0 || wordIds.length > BOARD_PAIR_LIMIT) {
    throw new InvalidExposureBatchError(
      `Exposure batches must contain between 1 and ${BOARD_PAIR_LIMIT} words.`,
    );
  }
  const normalized = wordIds.map((wordId) => requireIdentifier(wordId, "Word id"));
  if (new Set(normalized).size !== normalized.length) {
    throw new InvalidExposureBatchError("Exposure batches must contain distinct words.");
  }
  return normalized;
}

const REVIEW_MINIMUM_WORDS = 1;

function validateSessionWords(words: readonly Word[], mode: GameSessionMode): void {
  const minimum = mode === "REVIEW" ? REVIEW_MINIMUM_WORDS : MIN_SESSION_WORDS;
  if (words.length < minimum || words.length > MAX_SESSION_WORDS) {
    throw new InvalidGameSessionError(
      `A session must contain between ${minimum} and ${MAX_SESSION_WORDS} words.`,
    );
  }
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const wordInput of words) {
    const word = createWord(wordInput);
    if (!word.active) {
      throw new InvalidGameSessionError("A session cannot contain inactive words.");
    }
    const pair = `${word.english.toLowerCase()}\u0000${word.portuguese.toLowerCase()}`;
    if (ids.has(word.id) || pairs.has(pair)) {
      throw new InvalidGameSessionError("Session words must be distinct.");
    }
    ids.add(word.id);
    pairs.add(pair);
  }
}

function validateSnapshot(snapshot: GameSessionSnapshot): void {
  validateCanonicalIdentifier(snapshot.id, "Session id");
  validateCanonicalIdentifier(snapshot.visitorId, "Visitor id");
  const status = validateSnapshotStatus(snapshot.status);
  if (snapshot.targetWords !== snapshot.words.length) {
    throw new InvalidGameSessionError(
      "Snapshot target does not match the session words.",
    );
  }
  if (
    snapshot.mode === "FREE" &&
    snapshot.words.some((entry) => entry.graded)
  ) {
    throw new InvalidGameSessionError("A free session cannot grade words.");
  }
  validateSessionWords(
    snapshot.words.map(({ word }) => word),
    snapshot.mode,
  );
  validateSnapshotSequences(snapshot);
  const timeline = validateSnapshotTimeline(snapshot, status);
  const correctAttempts = validateSnapshotAttempts(snapshot, timeline);
  validateSnapshotCompletions(snapshot, {
    status,
    timeline,
    correctAttempts,
  });
}

function validateSnapshotStatus(value: unknown): GameSessionStatus {
  const status = GAME_SESSION_STATUSES.find((candidate) => candidate === value);
  if (!status) {
    throw new InvalidGameSessionError("Snapshot status is invalid.");
  }
  return status;
}

function validateSnapshotSequences(snapshot: GameSessionSnapshot): void {
  const sequences = snapshot.words.map(({ sequence }) => sequence);
  const hasExpectedSequence = [...sequences]
    .sort((first, second) => first - second)
    .every((sequence, index) => sequence === index);
  if (!hasExpectedSequence) {
    throw new InvalidGameSessionError("Session word sequence must be contiguous and unique.");
  }
}

interface SnapshotTimeline {
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

function validateSnapshotTimeline(
  snapshot: GameSessionSnapshot,
  status: GameSessionStatus,
): SnapshotTimeline {
  const startedAt = cloneRequiredDate(snapshot.startedAt, "startedAt");
  const finishedAt = cloneDate(snapshot.finishedAt);
  if (status === "ACTIVE" && finishedAt !== null) {
    throw new InvalidGameSessionError("An active session cannot have a finish time.");
  }
  if (status !== "ACTIVE" && finishedAt === null) {
    throw new InvalidGameSessionError("An ended session must have a finish time.");
  }
  if (finishedAt) {
    assertNotBefore(finishedAt, startedAt, "Finish time");
  }
  return { startedAt, finishedAt };
}

function validateSnapshotAttempts(
  snapshot: GameSessionSnapshot,
  timeline: SnapshotTimeline,
): ReadonlyMap<string, GameAttempt> {
  const wordIds = new Set(snapshot.words.map(({ word }) => word.id));
  const attemptIds = new Set<string>();
  const correctAttempts = new Map<string, GameAttempt>();
  for (const attempt of snapshot.attempts) {
    const normalized = validateAttemptInput(attempt);
    validateCanonicalAttempt(attempt, normalized);
    if (attemptIds.has(attempt.attemptId)) {
      throw new InvalidGameSessionError("Attempt ids must be unique.");
    }
    if (!wordIds.has(attempt.promptWordId) || !wordIds.has(attempt.selectedWordId)) {
      throw new InvalidGameSessionError("Every attempt must reference session words.");
    }
    const expectedCorrect = attempt.promptWordId === attempt.selectedWordId;
    if (attempt.isCorrect !== expectedCorrect) {
      throw new InvalidGameSessionError("Attempt correctness is inconsistent.");
    }
    const occurredAt = cloneRequiredDate(attempt.occurredAt, "Attempt time");
    assertWithinTimeline(occurredAt, timeline, "Attempt time");
    attemptIds.add(attempt.attemptId);
    if (attempt.isCorrect) {
      if (correctAttempts.has(attempt.promptWordId)) {
        throw new InvalidGameSessionError("A word cannot be completed twice.");
      }
      correctAttempts.set(attempt.promptWordId, attempt);
    }
  }
  return correctAttempts;
}

interface SnapshotCompletionContext {
  readonly status: GameSessionStatus;
  readonly timeline: SnapshotTimeline;
  readonly correctAttempts: ReadonlyMap<string, GameAttempt>;
}

function validateSnapshotCompletions(
  snapshot: GameSessionSnapshot,
  context: SnapshotCompletionContext,
): void {
  const { status, timeline, correctAttempts } = context;
  const completedIds = new Set<string>();
  for (const entry of snapshot.words) {
    if (entry.completedAt === null) continue;
    const completedAt = cloneRequiredDate(entry.completedAt, "Completion time");
    assertWithinTimeline(completedAt, timeline, "Completion time");
    const correctAttempt = correctAttempts.get(entry.word.id);
    if (!correctAttempt || correctAttempt.occurredAt.getTime() !== completedAt.getTime()) {
      throw new InvalidGameSessionError(
        "Completed words and correct attempts are inconsistent.",
      );
    }
    completedIds.add(entry.word.id);
  }
  const hasEveryCorrectWord = [...correctAttempts.keys()].every((wordId) =>
    completedIds.has(wordId),
  );
  if (completedIds.size !== correctAttempts.size || !hasEveryCorrectWord) {
    throw new InvalidGameSessionError(
      "Completed words and correct attempts are inconsistent.",
    );
  }
  if (status === "COMPLETED" && completedIds.size !== snapshot.targetWords) {
    throw new InvalidGameSessionError("A completed session must complete every target word.");
  }
  if (status !== "COMPLETED" && completedIds.size === snapshot.targetWords) {
    throw new InvalidGameSessionError("A session with every word completed must be completed.");
  }
  if (status === "COMPLETED") {
    validateAutomaticCompletion(timeline.finishedAt, correctAttempts);
  }
}

function validateAutomaticCompletion(
  finishedAt: Date | null,
  correctAttempts: ReadonlyMap<string, GameAttempt>,
): void {
  const latestCorrectAttempt = Math.max(
    ...[...correctAttempts.values()].map(({ occurredAt }) => occurredAt.getTime()),
  );
  if (finishedAt?.getTime() !== latestCorrectAttempt) {
    throw new InvalidGameSessionError(
      "Completion time must match the final correct attempt.",
    );
  }
}

function validateAttemptInput(input: RecordAttemptInput): RecordAttemptInput {
  return {
    attemptId: requireAttemptText(input.attemptId, "attemptId"),
    promptWordId: requireAttemptText(input.promptWordId, "promptWordId"),
    selectedWordId: requireAttemptText(input.selectedWordId, "selectedWordId"),
    responseTimeMs: requireResponseTime(input.responseTimeMs),
  };
}

function requireAttemptText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidAttemptError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireResponseTime(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_RESPONSE_TIME_MS
  ) {
    throw new InvalidAttemptError(
      `responseTimeMs must be an integer between 0 and ${MAX_RESPONSE_TIME_MS}.`,
    );
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidGameSessionError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function validateCanonicalIdentifier(value: unknown, field: string): void {
  const normalized = requireIdentifier(value, field);
  if (value !== normalized) {
    throw new InvalidGameSessionError(`${field} must already be normalized.`);
  }
}

function validateCanonicalAttempt(
  attempt: GameAttempt,
  normalized: RecordAttemptInput,
): void {
  if (
    attempt.attemptId !== normalized.attemptId ||
    attempt.promptWordId !== normalized.promptWordId ||
    attempt.selectedWordId !== normalized.selectedWordId
  ) {
    throw new InvalidGameSessionError(
      "Snapshot attempt identifiers must already be normalized.",
    );
  }
}

function readClock(clock: Clock): Date {
  if (!clock || typeof clock.now !== "function") {
    throw new InvalidGameSessionError("A clock source is required.");
  }
  return cloneRequiredDate(clock.now(), "Clock value");
}

function cloneRequiredDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidGameSessionError(`${field} must be a valid date.`);
  }
  return new Date(value);
}

function cloneDate(value: Date | null): Date | null {
  return value === null ? null : cloneRequiredDate(value, "Date");
}

function cloneAttempt(attempt: GameAttempt): GameAttempt {
  return {
    attemptId: attempt.attemptId,
    promptWordId: attempt.promptWordId,
    selectedWordId: attempt.selectedWordId,
    isCorrect: attempt.isCorrect,
    responseTimeMs: attempt.responseTimeMs,
    occurredAt: cloneRequiredDate(attempt.occurredAt, "Attempt time"),
  };
}

function cloneSessionWord(entry: MutableSessionWord): SessionWord {
  return {
    word: createWord(entry.word),
    sequence: entry.sequence,
    presentedAt: cloneDate(entry.presentedAt),
    completedAt: cloneDate(entry.completedAt),
    graded: entry.graded,
  };
}

function resolveStartMode(mode: unknown): StartableGameSessionMode {
  if (mode === undefined) return "REVIEW";
  if (mode === "REVIEW" || mode === "FREE") return mode;
  throw new InvalidGameSessionError("New sessions must be REVIEW or FREE.");
}

function resolveUngradedWordIds(
  words: readonly Word[],
  mode: StartableGameSessionMode,
  ungradedWordIds: readonly string[] | undefined,
): ReadonlySet<string> {
  if (mode === "FREE") {
    if (ungradedWordIds !== undefined) {
      throw new InvalidGameSessionError(
        "A free session grades no words, so ungraded word ids do not apply.",
      );
    }
    return new Set(words.map((word) => word.id));
  }
  const ungraded = new Set<string>();
  if (ungradedWordIds === undefined) return ungraded;
  const known = new Set(words.map((word) => word.id));
  for (const wordId of ungradedWordIds) {
    if (!known.has(wordId) || ungraded.has(wordId)) {
      throw new InvalidGameSessionError(
        "Ungraded word ids must be distinct session words.",
      );
    }
    ungraded.add(wordId);
  }
  return ungraded;
}

function canonicalizeSnapshot(
  snapshot: LegacyGameSessionSnapshot,
): GameSessionSnapshot {
  return {
    id: snapshot.id,
    visitorId: snapshot.visitorId,
    mode: parseMode(snapshot.mode),
    status: snapshot.status,
    targetWords: snapshot.targetWords,
    words: snapshot.words.map((entry) => ({
      word: entry.word,
      sequence: entry.sequence,
      presentedAt: entry.presentedAt,
      completedAt: entry.completedAt,
      graded: resolveGraded(entry.graded),
    })),
    attempts: snapshot.attempts,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
  };
}

function parseMode(value: unknown): GameSessionMode {
  if (value === undefined) return "CLASSIC";
  const mode = GAME_SESSION_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new InvalidGameSessionError("Snapshot mode is invalid.");
  }
  return mode;
}

function resolveGraded(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") {
    throw new InvalidGameSessionError("Session word graded flag must be a boolean.");
  }
  return value;
}

function assertNotBefore(value: Date, minimum: Date, field: string): void {
  if (value.getTime() < minimum.getTime()) {
    throw new InvalidGameSessionError(`${field} cannot be before the session start.`);
  }
}

function assertWithinTimeline(
  value: Date,
  timeline: SnapshotTimeline,
  field: string,
): void {
  assertNotBefore(value, timeline.startedAt, field);
  if (timeline.finishedAt && value.getTime() > timeline.finishedAt.getTime()) {
    throw new InvalidGameSessionError(`${field} cannot be after the session finish.`);
  }
}

function sameAttemptInput(
  attempt: GameAttempt,
  input: RecordAttemptInput,
): boolean {
  return (
    attempt.promptWordId === input.promptWordId &&
    attempt.selectedWordId === input.selectedWordId &&
    attempt.responseTimeMs === input.responseTimeMs
  );
}
