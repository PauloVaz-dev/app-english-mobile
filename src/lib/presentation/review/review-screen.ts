import type { ReviewSessionResultView } from "@/lib/application/review/review-session-view";
import type { Word } from "@/lib/domain/game/types";
import { localDateOf, startOfLocalDay } from "@/lib/domain/learning/local-day";
import type { ReviewStage } from "@/lib/domain/review";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";
import type { TypingCardPrompt, TypingCardResult, TypingCardSubmission } from "@/lib/presentation/review/typing-card";

export const REVIEW_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;

export const REVIEW_OPENING_MESSAGE = "Abrindo a revisão.";
export const REVIEW_NOTHING_MESSAGE = "Não há nada para revisar hoje.";
export const REVIEW_PERSIST_FAILED_MESSAGE = "Não foi possível salvar a última resposta.";
export const REVIEW_START_FAILED_MESSAGE = "Não foi possível abrir a revisão.";
export const REVIEW_RESULT_FAILED_MESSAGE = "Não foi possível abrir o resultado da revisão.";

export const REVIEW_PRACTICE_ACTION = {
  label: "Treino livre",
  href: "/treino-livre",
  accessibilityLabel: "Ir para o treino livre",
} as const;

export const REVIEW_HOME_ACTION = {
  label: "Voltar à entrada",
  href: "/",
  accessibilityLabel: "Voltar para a entrada",
} as const;

export const REVIEW_CONTINUE_ACTION = {
  label: "Continuar",
  accessibilityLabel: "Continuar a revisão das palavras que ainda vencem hoje",
} as const;

export const REVIEW_RETRY_ACTION = {
  label: "Tentar de novo",
  accessibilityLabel: "Tentar de novo",
} as const;

export const REVIEW_LEAVE_ACTION = {
  label: "Sair",
  accessibilityLabel: "Sair da revisão e voltar para a entrada",
} as const;

export interface ReviewLink {
  readonly label: string;
  readonly href: "/" | "/treino-livre";
  readonly accessibilityLabel: string;
}

export interface ReviewAction {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export interface ReviewProgressInput {
  readonly stage: "TYPING" | "MATCHING";
  readonly hasTyping: boolean;
  readonly hasMatching: boolean;
  readonly completed: number;
  readonly total: number;
}

export interface ReviewProgressView {
  readonly stageLabel: string;
  readonly progressLabel: string;
  readonly remainingLabel: string | null;
  readonly ratio: number;
  readonly accessibilityLabel: string;
}

export interface ReviewResultView {
  readonly title: string;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly remainingDueToday: number;
  readonly nextReviewAt: string | null;
  readonly remainingLabel: string;
  readonly nextReviewLabel: string;
  readonly announcement: string;
  readonly continueReview: boolean;
  readonly continueAction: ReviewAction | null;
  readonly homeAction: ReviewLink;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}

export interface ReviewScreenTypingInput {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly wordId: string;
  readonly kind: "answer" | "dont_know";
  readonly typed: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
}

export interface ReviewScreenTypingResult {
  readonly outcome: TypingCardResult["outcome"];
  readonly expected: string;
  readonly exampleSentence: string | null;
  readonly stage: ReviewStage;
  readonly prompt: TypingCardPrompt | null;
  readonly typingRemaining: number;
  readonly gameSessionId: string | null;
  readonly matchingWords: readonly Word[];
  readonly result: ReviewSessionResultView | null;
}

export interface ReviewScreenMatchInput {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly responseTimeMs: number;
}

export interface ReviewBoardAttempt {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export type ReviewScreenStart =
  | {
      readonly kind: "opened";
      readonly sessionId: string;
      readonly stage: ReviewStage;
      readonly prompt: TypingCardPrompt | null;
      readonly typingRemaining: number;
      readonly gameSessionId: string | null;
      readonly matchingWords: readonly Word[];
      readonly typingCount: number;
      readonly matchingCount: number;
      readonly distractorCount: number;
      readonly result: ReviewSessionResultView | null;
    }
  | { readonly kind: "nothing" };

export interface ReviewScreenPort {
  start(): Promise<ReviewScreenStart>;
  type(input: ReviewScreenTypingInput): Promise<ReviewScreenTypingResult>;
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  match(input: ReviewScreenMatchInput): Promise<void>;
  finish(sessionId: string): Promise<ReviewSessionResultView>;
  abandon(sessionId: string): Promise<void>;
}

export interface ReviewTypingView {
  readonly sessionId: string;
  readonly prompt: TypingCardPrompt;
  readonly result: TypingCardResult | null;
  readonly progress: ReviewProgressView;
  readonly halted: boolean;
  readonly failureMessage: string | null;
}

export interface ReviewMatchingView {
  readonly sessionId: string;
  readonly gameSessionId: string;
  readonly words: readonly Word[];
  readonly progress: ReviewProgressView;
  readonly halted: boolean;
  readonly boardDisabled: boolean;
  readonly failureMessage: string | null;
}

export type ReviewScreenState =
  | { readonly kind: "opening" }
  | { readonly kind: "typing"; readonly typing: ReviewTypingView }
  | { readonly kind: "matching"; readonly matching: ReviewMatchingView }
  | { readonly kind: "result"; readonly result: ReviewResultView }
  | {
      readonly kind: "nothing";
      readonly message: string;
      readonly practice: ReviewLink;
      readonly home: ReviewLink;
    }
  | { readonly kind: "failed"; readonly retry: "start" | "finish"; readonly message: string };

export interface ReviewScreenControllerDependencies {
  readonly port: ReviewScreenPort;
  readonly now: () => Date;
  readonly createAttemptId: () => string;
  readonly onChange: (state: ReviewScreenState) => void;
}

type PendingWrite =
  | {
      readonly kind: "type";
      readonly sessionId: string;
      readonly attemptId: string;
      readonly submission: TypingCardSubmission;
    }
  | { readonly kind: "expose"; readonly sessionId: string; readonly wordIds: readonly string[] }
  | {
      readonly kind: "attempt";
      readonly completesBoard: boolean;
      readonly input: ReviewScreenMatchInput;
    };

type OpenedReview = Extract<ReviewScreenStart, { kind: "opened" }>;

interface ReviewWriteHandlers {
  readonly generation: () => number;
  readonly halted: () => boolean;
  readonly owns: (write: PendingWrite) => boolean;
  readonly onTyped: (feedback: ReviewScreenTypingResult) => void;
  readonly onBoardCompleted: () => Promise<void>;
  readonly onFailed: () => void;
}

class ReviewWriteLane {
  private pending: PendingWrite[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly port: ReviewScreenPort) {}

  reset(): void {
    this.pending = [];
  }

  has(kind: PendingWrite["kind"]): boolean {
    return this.pending.some((write) => write.kind === kind);
  }

  settle(): Promise<PromiseSettledResult<void>[]> {
    return Promise.allSettled([...this.inFlight]);
  }

  enqueue(write: PendingWrite, handlers: ReviewWriteHandlers): Promise<void> {
    this.pending.push(write);
    if (handlers.halted()) {
      return Promise.resolve();
    }
    return this.send(write, handlers);
  }

  async resend(handlers: ReviewWriteHandlers): Promise<void> {
    await Promise.all(this.pending.slice().map((write) => this.send(write, handlers)));
  }

  private send(write: PendingWrite, handlers: ReviewWriteHandlers): Promise<void> {
    const generation = handlers.generation();
    const tracked = this.perform(write).then(
      async (feedback) => {
        if (generation !== handlers.generation() || !handlers.owns(write)) {
          return;
        }
        this.pending = this.pending.filter((queued) => queued !== write);
        if (write.kind === "type" && feedback !== null) {
          handlers.onTyped(feedback);
        }
        if (write.kind === "attempt" && write.completesBoard) {
          await handlers.onBoardCompleted();
        }
      },
      () => {
        if (generation !== handlers.generation()) {
          return;
        }
        handlers.onFailed();
      },
    );
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
    return tracked;
  }

  private async perform(write: PendingWrite): Promise<ReviewScreenTypingResult | null> {
    if (write.kind === "type") {
      return this.port.type({
        sessionId: write.sessionId,
        attemptId: write.attemptId,
        wordId: write.submission.wordId,
        kind: write.submission.kind,
        typed: write.submission.typed,
        usedHint: write.submission.usedHint,
        responseTimeMs: write.submission.responseTimeMs,
      });
    }
    if (write.kind === "expose") {
      await this.port.expose(write.sessionId, write.wordIds);
      return null;
    }
    await this.port.match(write.input);
    return null;
  }
}

class ReviewSessionPlan {
  private current: ReviewScreenState = { kind: "opening" };
  private activeSessionId: string | null = null;
  private resultSessionId: string | null = null;
  private gameSessionId: string | null = null;
  private typingCount = 0;
  private matchingCount = 0;
  private distractorCount = 0;
  private typingRemaining = 0;
  private matched = new Set<string>();
  private handoff: ReviewScreenTypingResult | null = null;

  constructor(
    private readonly now: () => Date,
    private readonly publishChange: (state: ReviewScreenState) => void,
    private readonly resetWrites: () => void,
  ) {}

  get state(): ReviewScreenState {
    return this.current;
  }

  isBusy(): boolean {
    return this.current.kind === "typing" || this.current.kind === "matching";
  }

  prepareStart(): void {
    this.handoff = null;
  }

  publish(state: ReviewScreenState): void {
    this.current = state;
    this.publishChange(state);
  }

  resultId(): string | null {
    return this.resultSessionId;
  }

  rememberResult(sessionId: string | null): void {
    this.resultSessionId = sessionId;
  }

  applyOpening(opening: ReviewScreenStart): "finish" | "stay" {
    if (opening.kind === "nothing") {
      this.activeSessionId = null;
      this.publish({
        kind: "nothing",
        message: REVIEW_NOTHING_MESSAGE,
        practice: REVIEW_PRACTICE_ACTION,
        home: REVIEW_HOME_ACTION,
      });
      return "stay";
    }
    this.remember(opening);
    if (opening.prompt !== null && opening.stage === "TYPING") {
      this.publishTyping(this.typingState(opening.sessionId, opening.prompt, null));
      return "stay";
    }
    if (opening.matchingWords.length > 0 && opening.gameSessionId !== null) {
      this.enterMatching(opening.matchingWords);
      return "stay";
    }
    if (opening.result !== null) {
      this.showFinished(opening.result);
      return "stay";
    }
    return "finish";
  }

  createTypingWrite(submission: TypingCardSubmission, createAttemptId: () => string): PendingWrite | null {
    const typing = typingViewOf(this.current);
    if (typing === null || typing.halted || typing.result !== null || this.activeSessionId === null) {
      return null;
    }
    return {
      kind: "type",
      sessionId: this.activeSessionId,
      attemptId: createAttemptId(),
      submission,
    };
  }

  continueTyping(): "finish" | "stay" {
    const typing = typingViewOf(this.current);
    const feedback = this.handoff;
    if (typing === null || feedback === null || typing.halted || typing.result === null) {
      return "stay";
    }
    this.handoff = null;
    if (feedback.stage === "MATCHING" && feedback.matchingWords.length > 0) {
      this.gameSessionId = feedback.gameSessionId ?? this.gameSessionId;
      this.enterMatching(feedback.matchingWords);
      return "stay";
    }
    if (feedback.stage === "TYPING" && feedback.prompt !== null) {
      this.publishTyping(this.typingState(typing.sessionId, feedback.prompt, null));
      return "stay";
    }
    if (feedback.result !== null) {
      this.showFinished(feedback.result);
      return "stay";
    }
    return "finish";
  }

  recordAttempt(attempt: ReviewBoardAttempt): PendingWrite | null {
    const matching = matchingViewOf(this.current);
    if (matching === null || this.matched.size >= matching.words.length) {
      return null;
    }
    const completesBoard = this.completes(attempt, matching.words.length);
    if (attempt.isCorrect && !this.matched.has(attempt.promptWordId)) {
      this.matched.add(attempt.promptWordId);
    }
    this.publishMatching({
      ...matching,
      progress: this.progress("MATCHING"),
      boardDisabled: matching.halted || this.matched.size >= matching.words.length,
    });
    return {
      kind: "attempt",
      completesBoard,
      input: {
        sessionId: matching.gameSessionId,
        attemptId: attempt.attemptId,
        promptWordId: attempt.promptWordId,
        selectedWordId: attempt.selectedWordId,
        responseTimeMs: attempt.responseTimeMs,
      },
    };
  }

  createExposure(wordIds: readonly string[]): PendingWrite | null {
    const matching = matchingViewOf(this.current);
    if (matching === null || wordIds.length === 0) {
      return null;
    }
    return { kind: "expose", sessionId: matching.gameSessionId, wordIds: [...wordIds] };
  }

  applyTyping(feedback: ReviewScreenTypingResult): void {
    const typing = typingViewOf(this.current);
    if (typing === null) {
      return;
    }
    this.handoff = feedback;
    this.typingRemaining = feedback.typingRemaining;
    if (feedback.gameSessionId !== null) {
      this.gameSessionId = feedback.gameSessionId;
    }
    this.publishTyping({
      ...typing,
      result: {
        outcome: feedback.outcome,
        expected: feedback.expected,
        exampleSentence: feedback.exampleSentence,
      },
      progress: this.progress("TYPING"),
      halted: false,
      failureMessage: null,
    });
  }

  beginFinish(): string | null {
    const sessionId = this.activeSessionId;
    if (sessionId === null) {
      return null;
    }
    this.activeSessionId = null;
    return sessionId;
  }

  showFinished(result: ReviewSessionResultView): void {
    this.activeSessionId = null;
    this.handoff = null;
    this.resetWrites();
    this.publish({ kind: "result", result: reviewResultView(result, this.now()) });
  }

  owns(write: PendingWrite): boolean {
    const sessionId = write.kind === "attempt" ? write.input.sessionId : write.sessionId;
    if (write.kind === "type") {
      return sessionId === this.activeSessionId;
    }
    return sessionId === this.gameSessionId;
  }

  isHalted(): boolean {
    return stageHalted(this.current);
  }

  halt(): void {
    const next = haltedStage(this.current);
    if (next !== null) {
      this.publish(next);
    }
  }

  clearHalt(): void {
    const next = clearedStage(this.current, this.matched.size);
    if (next !== null) {
      this.publish(next);
    }
  }

  abandonOnLeave(): string | null {
    const activeSessionId = this.activeSessionId;
    const resultSessionId = this.resultSessionId;
    const current = this.current;
    this.activeSessionId = null;
    this.resultSessionId = null;
    this.handoff = null;
    this.current = { kind: "opening" };
    if (current.kind === "typing" || current.kind === "matching") {
      return activeSessionId;
    }
    if (current.kind === "failed" && current.retry === "finish") {
      return resultSessionId;
    }
    return null;
  }

  private remember(opening: OpenedReview): void {
    this.activeSessionId = opening.sessionId;
    this.gameSessionId = opening.gameSessionId;
    this.typingCount = opening.typingCount;
    this.matchingCount = opening.matchingCount;
    this.distractorCount = opening.distractorCount;
    this.typingRemaining = opening.typingRemaining;
    this.matched = new Set();
    this.handoff = null;
    this.resetWrites();
  }

  private enterMatching(words: readonly Word[]): void {
    const sessionId = this.activeSessionId;
    const gameSessionId = this.gameSessionId;
    if (sessionId === null || gameSessionId === null) {
      return;
    }
    this.typingRemaining = 0;
    this.matched = new Set();
    this.publishMatching({
      sessionId,
      gameSessionId,
      words,
      progress: this.progress("MATCHING"),
      halted: false,
      boardDisabled: false,
      failureMessage: null,
    });
  }

  private completes(attempt: ReviewBoardAttempt, total: number): boolean {
    return (
      attempt.isCorrect && !this.matched.has(attempt.promptWordId) && this.matched.size + 1 >= total
    );
  }

  private typingState(
    sessionId: string,
    prompt: TypingCardPrompt,
    result: ReviewTypingView["result"],
  ): ReviewTypingView {
    return {
      sessionId,
      prompt,
      result,
      progress: this.progress("TYPING"),
      halted: false,
      failureMessage: null,
    };
  }

  private progress(stage: "TYPING" | "MATCHING"): ReviewProgressView {
    const total = this.typingCount + this.matchingCount + this.distractorCount;
    const typed = Math.max(0, this.typingCount - this.typingRemaining);
    const completed = Math.min(total, typed + this.matched.size);
    return reviewProgressView({
      stage,
      hasTyping: this.typingCount > 0,
      hasMatching: this.matchingCount + this.distractorCount > 0,
      completed,
      total,
    });
  }

  private publishTyping(typing: ReviewTypingView): void {
    this.publish({ kind: "typing", typing });
  }

  private publishMatching(matching: ReviewMatchingView): void {
    this.publish({ kind: "matching", matching });
  }
}

export class ReviewScreenController {
  private generation = 0;
  private gate = false;
  private readonly writes: ReviewWriteLane;
  private readonly plan: ReviewSessionPlan;
  private readonly dependencies: ReviewScreenControllerDependencies;

  constructor(dependencies: ReviewScreenControllerDependencies) {
    this.dependencies = dependencies;
    this.writes = new ReviewWriteLane(dependencies.port);
    this.plan = new ReviewSessionPlan(
      dependencies.now,
      (state) => {
        dependencies.onChange(state);
      },
      () => {
        this.writes.reset();
      },
    );
  }

  get state(): ReviewScreenState {
    return this.plan.state;
  }

  async start(): Promise<void> {
    if (this.plan.isBusy()) {
      return;
    }
    if (this.plan.state.kind === "opening" && this.gate) {
      return;
    }
    this.gate = true;
    const generation = this.generation;
    this.plan.prepareStart();
    this.writes.reset();
    this.plan.publish({ kind: "opening" });
    try {
      const opening = await this.dependencies.port.start();
      if (generation !== this.generation) {
        if (opening.kind === "opened") {
          await quietly(() => this.dependencies.port.abandon(opening.sessionId));
        }
        return;
      }
      if (this.plan.applyOpening(opening) === "finish") {
        await this.finishActive();
      }
    } catch {
      this.publishFor(generation, {
        kind: "failed",
        retry: "start",
        message: REVIEW_START_FAILED_MESSAGE,
      });
    } finally {
      if (generation === this.generation) {
        this.gate = false;
      }
    }
  }

  submitTyping(submission: TypingCardSubmission): Promise<void> {
    if (this.writes.has("type")) {
      return Promise.resolve();
    }
    const write = this.plan.createTypingWrite(submission, this.dependencies.createAttemptId);
    if (write === null) {
      return Promise.resolve();
    }
    return this.writes.enqueue(write, this.handlers());
  }

  async advance(): Promise<void> {
    if (this.plan.continueTyping() === "finish") {
      await this.finishActive();
    }
  }

  cardsReady(wordIds: readonly string[]): Promise<void> {
    return this.expose(wordIds);
  }

  pairsEntered(wordIds: readonly string[]): Promise<void> {
    return this.expose(wordIds);
  }

  attempt(attempt: ReviewBoardAttempt): Promise<void> {
    const write = this.plan.recordAttempt(attempt);
    if (write === null) {
      return Promise.resolve();
    }
    return this.writes.enqueue(write, this.handlers());
  }

  async retry(): Promise<void> {
    const state = this.plan.state;
    if (state.kind === "failed") {
      await this.retryFailed(state.retry);
      return;
    }
    if ((state.kind !== "typing" && state.kind !== "matching") || !this.plan.isHalted()) {
      return;
    }
    const generation = this.generation;
    await this.writes.settle();
    if (generation !== this.generation || !this.plan.isHalted()) {
      return;
    }
    this.plan.clearHalt();
    await this.writes.resend(this.handlers());
  }

  async leave(): Promise<void> {
    this.generation += 1;
    this.gate = false;
    const sessionId = this.plan.abandonOnLeave();
    this.writes.reset();
    if (sessionId !== null) {
      await quietly(() => this.dependencies.port.abandon(sessionId));
    }
  }

  private expose(wordIds: readonly string[]): Promise<void> {
    const write = this.plan.createExposure(wordIds);
    if (write === null) {
      return Promise.resolve();
    }
    return this.writes.enqueue(write, this.handlers());
  }

  private async retryFailed(retry: "start" | "finish"): Promise<void> {
    const sessionId = this.plan.resultId();
    if (retry === "finish" && sessionId !== null) {
      await this.showResult(sessionId);
      return;
    }
    await this.start();
  }

  private async finishActive(): Promise<void> {
    const sessionId = this.plan.beginFinish();
    if (sessionId === null) {
      return;
    }
    this.writes.reset();
    await this.showResult(sessionId);
  }

  private async showResult(sessionId: string): Promise<void> {
    const generation = this.generation;
    this.plan.rememberResult(sessionId);
    try {
      const outcome = await this.dependencies.port.finish(sessionId);
      if (generation !== this.generation) {
        return;
      }
      this.plan.rememberResult(null);
      this.plan.showFinished(outcome);
    } catch {
      this.publishFor(generation, {
        kind: "failed",
        retry: "finish",
        message: REVIEW_RESULT_FAILED_MESSAGE,
      });
    }
  }

  private handlers(): ReviewWriteHandlers {
    return {
      generation: () => this.generation,
      halted: () => this.plan.isHalted(),
      owns: (write) => this.plan.owns(write),
      onTyped: (feedback) => {
        this.plan.applyTyping(feedback);
      },
      onBoardCompleted: () => this.finishActive(),
      onFailed: () => {
        this.plan.halt();
      },
    };
  }

  private publishFor(generation: number, state: ReviewScreenState): void {
    if (generation === this.generation) {
      this.plan.publish(state);
    }
  }
}

function typingViewOf(state: ReviewScreenState): ReviewTypingView | null {
  return state.kind === "typing" ? state.typing : null;
}

function matchingViewOf(state: ReviewScreenState): ReviewMatchingView | null {
  return state.kind === "matching" ? state.matching : null;
}

function stageHalted(state: ReviewScreenState): boolean {
  if (state.kind === "typing") {
    return state.typing.halted;
  }
  if (state.kind === "matching") {
    return state.matching.halted;
  }
  return false;
}

function haltedStage(state: ReviewScreenState): ReviewScreenState | null {
  if (state.kind === "typing" && !state.typing.halted) {
    return {
      kind: "typing",
      typing: { ...state.typing, halted: true, failureMessage: REVIEW_PERSIST_FAILED_MESSAGE },
    };
  }
  if (state.kind === "matching" && !state.matching.halted) {
    return {
      kind: "matching",
      matching: {
        ...state.matching,
        halted: true,
        boardDisabled: true,
        failureMessage: REVIEW_PERSIST_FAILED_MESSAGE,
      },
    };
  }
  return null;
}

function clearedStage(state: ReviewScreenState, matched: number): ReviewScreenState | null {
  if (state.kind === "typing") {
    return { kind: "typing", typing: { ...state.typing, halted: false, failureMessage: null } };
  }
  if (state.kind === "matching") {
    return {
      kind: "matching",
      matching: {
        ...state.matching,
        halted: false,
        failureMessage: null,
        boardDisabled: matched >= state.matching.words.length,
      },
    };
  }
  return null;
}

async function quietly(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch {
    // The screen is gone; the composition already logged the failed write.
  }
}

export function reviewProgressView(input: ReviewProgressInput): ReviewProgressView {
  const completed = Math.max(0, input.completed);
  const total = Math.max(0, input.total);
  const remaining = Math.max(0, total - completed);
  const stageLabel = stageLabelFor(input);
  const remainingLabel = formatRemaining(remaining);
  const progressLabel = `Progresso ${completed}/${total}`;
  return {
    stageLabel,
    progressLabel,
    remainingLabel,
    ratio: total === 0 ? 0 : completed / total,
    accessibilityLabel: progressAccessibility(stageLabel, remainingLabel, completed, total),
  };
}

export function reviewResultView(result: ReviewSessionResultView, now: Date): ReviewResultView {
  const title = result.status === "COMPLETED" ? "Revisão concluída" : "Revisão encerrada";
  const remainingLabel = formatRemainingDue(result.remainingDueToday);
  const nextReviewLabel = formatNextReviewLabel(result.nextReviewAt, result.timeZone, now);
  const score = `${countLabel(result.correctAnswers, "acerto", "acertos")} e ${countLabel(
    result.wrongAnswers,
    "erro",
    "erros",
  )}`;
  const continueReview = result.remainingDueToday > 0;
  return {
    title,
    correctAnswers: result.correctAnswers,
    wrongAnswers: result.wrongAnswers,
    remainingDueToday: result.remainingDueToday,
    nextReviewAt: result.nextReviewAt,
    remainingLabel,
    nextReviewLabel,
    announcement: `${title}. ${score}. ${remainingLabel}. ${nextReviewLabel}.`,
    continueReview,
    continueAction: continueReview ? REVIEW_CONTINUE_ACTION : null,
    homeAction: REVIEW_HOME_ACTION,
    rows: [
      { label: "Acertos", value: String(result.correctAnswers) },
      { label: "Erros", value: String(result.wrongAnswers) },
    ],
  };
}

function stageLabelFor(input: ReviewProgressInput): string {
  if (input.stage === "MATCHING") {
    return input.hasTyping ? "Etapa 2 — Associar" : "Etapa 1 — Associar";
  }
  return input.hasMatching ? "Etapa 1 de 2 — Digitar" : "Etapa 1 — Digitar";
}

function formatRemaining(remaining: number): string | null {
  if (remaining <= 0) {
    return null;
  }
  if (remaining === 1) {
    return "Falta 1 palavra";
  }
  return `Faltam ${remaining} palavras`;
}

function formatRemainingDue(remainingDueToday: number): string {
  if (remainingDueToday === 0) {
    return "Nenhuma palavra ainda vence hoje";
  }
  if (remainingDueToday === 1) {
    return "1 palavra ainda vence hoje";
  }
  return `${remainingDueToday} palavras ainda vencem hoje`;
}

function formatNextReviewLabel(nextReviewAt: string | null, timeZone: string, now: Date): string {
  const date = nextReviewAt === null ? null : new Date(nextReviewAt);
  if (date === null || Number.isNaN(date.getTime())) {
    return "Sem data de próxima revisão";
  }
  const reviewDay = localDateOf(date, timeZone);
  const today = localDateOf(now, timeZone);
  const tomorrow = localDateOf(startOfLocalDay(now, timeZone, 1), timeZone);
  if (reviewDay === today) {
    return "Próxima revisão hoje";
  }
  if (reviewDay === tomorrow) {
    return "Próxima revisão amanhã";
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
  return `Próxima revisão em ${formatted}`;
}

function progressAccessibility(
  stageLabel: string,
  remainingLabel: string | null,
  completed: number,
  total: number,
): string {
  const unit = total === 1 ? "palavra" : "palavras";
  const progress = `Progresso: ${completed} de ${total} ${unit}`;
  if (remainingLabel === null) {
    return `${stageLabel}. ${progress}.`;
  }
  return `${stageLabel}. ${remainingLabel}. ${progress}.`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
