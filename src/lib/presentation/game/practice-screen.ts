import type { ReviewWordView } from "@/lib/application/game/session-view";
import type { GameSessionStatus, Word } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const CLOCK_DIGITS = 2;
const PERFECT_ACCURACY_PERCENT = 100;

export const PRACTICE_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;

export const PRACTICE_OPENING_MESSAGE = "Montando o treino.";
export const PRACTICE_INSUFFICIENT_MESSAGE =
  "Não há palavras ativas suficientes para um treino de 20 palavras. Volte à entrada e use outra atividade.";
export const PRACTICE_START_FAILED_MESSAGE = "Não foi possível começar o treino.";
export const PRACTICE_RESULT_FAILED_MESSAGE = "Não foi possível abrir o resultado do treino.";
export const PRACTICE_PERSIST_FAILED_MESSAGE =
  "Não foi possível salvar a última resposta. A partida está pausada.";

export const PRACTICE_RESULT_TEXT = {
  title: "Treino concluído",
  reviewTitle: "Precisa revisar",
  reviewEmpty: "Nenhuma palavra precisa de revisão agora.",
  praiseTitle: "Mandou bem",
  praiseEmpty: "Nenhuma palavra se destacou nesta partida.",
} as const;

export interface PracticeAction {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export interface PracticeResultAction extends PracticeAction {
  readonly kind: "playAgain" | "home";
}

export const PRACTICE_INTRO = {
  title: "Treino livre",
  lines: [
    "Ligue o português ao inglês até concluir 20 palavras.",
    "Sem limite de tempo: o cronômetro só mostra quanto você levou.",
    "As respostas entram nas suas estatísticas e não mudam a sua revisão.",
  ],
  start: {
    label: "Começar",
    accessibilityLabel: "Começar o treino livre de 20 palavras",
  },
  leave: {
    label: "Sair",
    accessibilityLabel: "Sair do treino e voltar para a entrada",
  },
  retry: {
    label: "Tentar de novo",
    accessibilityLabel: "Tentar de novo",
  },
} as const;

export const PRACTICE_RESULT_ACTIONS: readonly PracticeResultAction[] = [
  { kind: "playAgain", label: "Jogar de novo", accessibilityLabel: "Jogar o treino livre de novo" },
  { kind: "home", label: "Voltar à entrada", accessibilityLabel: "Voltar para a entrada" },
];

/** What the board hands over on every attempt. */
export interface PracticeBoardAttempt {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export interface PracticeScreenAttempt {
  readonly sessionId: string;
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly responseTimeMs: number;
}

export interface PracticeAttemptOutcome {
  readonly status: GameSessionStatus;
}

export interface PracticeOutcome {
  readonly durationMs: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly averageResponseTimeMs: number;
  readonly reviewWords: readonly ReviewWordView[];
  readonly praiseWords: readonly ReviewWordView[];
}

export type PracticeOpeningOutcome =
  | {
      readonly kind: "opened";
      readonly sessionId: string;
      readonly targetWords: number;
      readonly words: readonly Word[];
    }
  | { readonly kind: "insufficientCatalog" };

export interface PracticeScreenPort {
  start(): Promise<PracticeOpeningOutcome>;
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  attempt(input: PracticeScreenAttempt): Promise<PracticeAttemptOutcome>;
  abandon(sessionId: string): Promise<void>;
  result(sessionId: string): Promise<PracticeOutcome>;
}

export interface PracticeMatchView {
  readonly sessionId: string;
  readonly words: readonly Word[];
  readonly targetWords: number;
  readonly startedAt: Date;
  /** Set at the last hit or when the match is left: the clock stops here. */
  readonly stoppedAt: Date | null;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  /** A write failed: the board is blocked until "Tentar de novo". */
  readonly halted: boolean;
}

export interface PracticeResultRow {
  readonly label: string;
  readonly value: string;
}

export interface PracticeResultWordItem {
  readonly key: string;
  readonly english: string;
  readonly portuguese: string;
  readonly details: readonly string[];
  readonly accessibilityLabel: string;
}

export interface PracticeResultSection {
  readonly title: string;
  readonly items: readonly PracticeResultWordItem[];
  readonly emptyText: string;
}

export interface PracticeResultView {
  readonly title: string;
  readonly rows: readonly PracticeResultRow[];
  readonly sections: readonly PracticeResultSection[];
}

export interface PracticeHeaderStat {
  readonly label: string;
  readonly value: string;
  readonly accessibilityLabel: string;
}

export interface PracticeHeaderView {
  readonly clock: { readonly label: string; readonly accessibilityLabel: string };
  readonly stats: readonly PracticeHeaderStat[];
  readonly boardDisabled: boolean;
}

export type PracticeRetry = "start" | "result";

export type PracticeScreenState =
  | { readonly kind: "intro" }
  | { readonly kind: "opening" }
  | { readonly kind: "match"; readonly match: PracticeMatchView }
  | { readonly kind: "result"; readonly result: PracticeResultView }
  | { readonly kind: "insufficientCatalog" }
  | { readonly kind: "failed"; readonly retry: PracticeRetry };

export interface PracticeScreenControllerDependencies {
  readonly port: PracticeScreenPort;
  readonly now: () => Date;
  readonly onChange: (state: PracticeScreenState) => void;
}

type PendingWrite =
  | { readonly kind: "expose"; readonly sessionId: string; readonly wordIds: readonly string[] }
  | { readonly kind: "attempt"; readonly input: PracticeScreenAttempt };

export function practiceHeaderView(match: PracticeMatchView, now: Date): PracticeHeaderView {
  const end = match.stoppedAt ?? now;
  const elapsedMs = Math.max(0, end.getTime() - match.startedAt.getTime());
  const completed = Math.min(match.correctAnswers, match.targetWords);
  return {
    clock: {
      label: formatClock(elapsedMs),
      accessibilityLabel: `Tempo decorrido: ${spokenDuration(elapsedMs)}`,
    },
    stats: [
      stat("Acertos", String(match.correctAnswers), String(match.correctAnswers)),
      stat("Erros", String(match.wrongAnswers), String(match.wrongAnswers)),
      stat(
        "Progresso",
        `${completed}/${match.targetWords}`,
        `${completed} de ${match.targetWords} palavras`,
      ),
    ],
    boardDisabled: match.halted || match.stoppedAt !== null,
  };
}

export function practiceResultView(outcome: PracticeOutcome): PracticeResultView {
  return {
    title: PRACTICE_RESULT_TEXT.title,
    rows: [
      { label: "Duração", value: formatClock(outcome.durationMs) },
      { label: "Acertos", value: String(outcome.correctAnswers) },
      { label: "Erros", value: String(outcome.wrongAnswers) },
      { label: "Precisão", value: formatPercent(outcome.accuracy) },
      { label: "Tempo médio", value: formatSeconds(outcome.averageResponseTimeMs) },
    ],
    sections: [
      {
        title: PRACTICE_RESULT_TEXT.reviewTitle,
        items: outcome.reviewWords.map(reviewItem),
        emptyText: PRACTICE_RESULT_TEXT.reviewEmpty,
      },
      {
        title: PRACTICE_RESULT_TEXT.praiseTitle,
        items: outcome.praiseWords.map(praiseItem),
        emptyText: PRACTICE_RESULT_TEXT.praiseEmpty,
      },
    ],
  };
}

/**
 * Drives the free practice route: intro, match, result and the insufficient
 * catalog. Writes go to the composition in board order and are never awaited
 * by the board. A failed write pauses the match; `retry` resends the failed
 * write and the ones behind it, in order, with the same `attemptId`.
 */
export class PracticeScreenController {
  private current: PracticeScreenState = { kind: "intro" };
  private generation = 0;
  private activeSessionId: string | null = null;
  private resultSessionId: string | null = null;
  private pending: PendingWrite[] = [];
  private readonly inFlight = new Set<Promise<void>>();
  private readonly dependencies: PracticeScreenControllerDependencies;

  constructor(dependencies: PracticeScreenControllerDependencies) {
    this.dependencies = dependencies;
  }

  get state(): PracticeScreenState {
    return this.current;
  }

  async start(): Promise<void> {
    if (this.current.kind === "opening" || this.current.kind === "match") {
      return;
    }
    const generation = this.nextGeneration();
    this.publish({ kind: "opening" });
    let opening: PracticeOpeningOutcome;
    try {
      opening = await this.dependencies.port.start();
    } catch {
      this.publishFor(generation, { kind: "failed", retry: "start" });
      return;
    }
    if (generation !== this.generation) {
      if (opening.kind === "opened") {
        await this.quietly(() => this.dependencies.port.abandon(opening.sessionId));
      }
      return;
    }
    if (opening.kind === "insufficientCatalog") {
      this.publish({ kind: "insufficientCatalog" });
      return;
    }
    this.activeSessionId = opening.sessionId;
    this.publish({
      kind: "match",
      match: {
        sessionId: opening.sessionId,
        words: opening.words,
        targetWords: opening.targetWords,
        startedAt: this.dependencies.now(),
        stoppedAt: null,
        correctAnswers: 0,
        wrongAnswers: 0,
        halted: false,
      },
    });
  }

  cardsReady(wordIds: readonly string[]): Promise<void> {
    return this.expose(wordIds);
  }

  pairsEntered(wordIds: readonly string[]): Promise<void> {
    return this.expose(wordIds);
  }

  attempt(attempt: PracticeBoardAttempt): Promise<void> {
    const match = this.activeMatch();
    if (match === null) {
      return Promise.resolve();
    }
    const correctAnswers = match.correctAnswers + (attempt.isCorrect ? 1 : 0);
    const reachedTarget = correctAnswers >= match.targetWords;
    this.publishMatch({
      ...match,
      correctAnswers,
      wrongAnswers: match.wrongAnswers + (attempt.isCorrect ? 0 : 1),
      stoppedAt: reachedTarget && match.stoppedAt === null ? this.dependencies.now() : match.stoppedAt,
    });
    return this.enqueue({
      kind: "attempt",
      input: {
        sessionId: match.sessionId,
        attemptId: attempt.attemptId,
        promptWordId: attempt.promptWordId,
        selectedWordId: attempt.selectedWordId,
        responseTimeMs: attempt.responseTimeMs,
      },
    });
  }

  async retry(): Promise<void> {
    const state = this.current;
    if (state.kind === "failed") {
      await this.retryFailure(state.retry);
      return;
    }
    if (state.kind !== "match" || !state.match.halted) {
      return;
    }
    const generation = this.generation;
    await Promise.allSettled([...this.inFlight]);
    const match = this.activeMatch();
    if (generation !== this.generation || match === null || !match.halted) {
      return;
    }
    this.publishMatch({ ...match, halted: false });
    await Promise.all(this.pending.slice().map((write) => this.send(write)));
  }

  async leave(): Promise<void> {
    this.nextGeneration();
    const sessionId = this.activeSessionId;
    this.activeSessionId = null;
    this.resultSessionId = null;
    this.pending = [];
    this.current = { kind: "intro" };
    if (sessionId !== null) {
      await this.quietly(() => this.dependencies.port.abandon(sessionId));
    }
  }

  private expose(wordIds: readonly string[]): Promise<void> {
    const match = this.activeMatch();
    if (match === null || wordIds.length === 0) {
      return Promise.resolve();
    }
    return this.enqueue({ kind: "expose", sessionId: match.sessionId, wordIds: [...wordIds] });
  }

  private enqueue(write: PendingWrite): Promise<void> {
    this.pending.push(write);
    if (this.activeMatch()?.halted === true) {
      return Promise.resolve();
    }
    return this.send(write);
  }

  private send(write: PendingWrite): Promise<void> {
    const generation = this.generation;
    const tracked = this.write(write).then(
      async (status) => {
        if (generation !== this.generation) {
          return;
        }
        this.pending = this.pending.filter((queued) => queued !== write);
        if (status === "COMPLETED") {
          await this.finish();
        }
      },
      () => {
        if (generation !== this.generation) {
          return;
        }
        this.halt();
      },
    );
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
    return tracked;
  }

  private async write(write: PendingWrite): Promise<GameSessionStatus> {
    if (write.kind === "expose") {
      await this.dependencies.port.expose(write.sessionId, write.wordIds);
      return "ACTIVE";
    }
    return (await this.dependencies.port.attempt(write.input)).status;
  }

  private halt(): void {
    const match = this.activeMatch();
    if (match !== null && !match.halted) {
      this.publishMatch({ ...match, halted: true });
    }
  }

  private async finish(): Promise<void> {
    const sessionId = this.activeSessionId;
    if (sessionId === null) {
      return;
    }
    this.activeSessionId = null;
    this.resultSessionId = sessionId;
    this.pending = [];
    await this.showResult(sessionId);
  }

  private async showResult(sessionId: string): Promise<void> {
    const generation = this.generation;
    let outcome: PracticeOutcome;
    try {
      outcome = await this.dependencies.port.result(sessionId);
    } catch {
      this.publishFor(generation, { kind: "failed", retry: "result" });
      return;
    }
    if (generation === this.generation) {
      this.resultSessionId = null;
      this.publish({ kind: "result", result: practiceResultView(outcome) });
    }
  }

  private async retryFailure(retry: PracticeRetry): Promise<void> {
    const sessionId = this.resultSessionId;
    if (retry === "result" && sessionId !== null) {
      await this.showResult(sessionId);
      return;
    }
    this.current = { kind: "intro" };
    await this.start();
  }

  private activeMatch(): PracticeMatchView | null {
    const state = this.current;
    if (state.kind !== "match" || state.match.sessionId !== this.activeSessionId) {
      return null;
    }
    return state.match;
  }

  private nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  private publishMatch(match: PracticeMatchView): void {
    this.publish({ kind: "match", match });
  }

  private publishFor(generation: number, state: PracticeScreenState): void {
    if (generation === this.generation) {
      this.publish(state);
    }
  }

  private publish(state: PracticeScreenState): void {
    this.current = state;
    this.dependencies.onChange(state);
  }

  private async quietly(work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch {
      // The screen is gone; the composition already logged the failed write.
    }
  }
}

function stat(label: string, value: string, spoken: string): PracticeHeaderStat {
  return { label, value, accessibilityLabel: `${label}: ${spoken}` };
}

function reviewItem(word: ReviewWordView): PracticeResultWordItem {
  const misses = word.wrongAnswers === 1 ? "1 erro" : `${word.wrongAnswers} erros`;
  const time = formatTimeToCorrect(word.timeToCorrectMs);
  return {
    key: word.wordId,
    english: word.english,
    portuguese: word.portuguese,
    details: [misses, time],
    accessibilityLabel: `${word.english}, ${word.portuguese}. ${misses}. Tempo até o acerto: ${time}.`,
  };
}

function praiseItem(word: ReviewWordView): PracticeResultWordItem {
  const accuracy = formatPercent(PERFECT_ACCURACY_PERCENT);
  const time = formatTimeToCorrect(word.timeToCorrectMs);
  return {
    key: word.wordId,
    english: word.english,
    portuguese: word.portuguese,
    details: [accuracy, time],
    accessibilityLabel: `${word.english}, ${word.portuguese}. Precisão: ${accuracy}. Tempo até o acerto: ${time}.`,
  };
}

/** Same format as the site result: whole number or one decimal. */
function formatPercent(accuracy: number): string {
  const value = Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0;
  return `${oneDecimal(value)}%`;
}

function formatSeconds(milliseconds: number): string {
  const value = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  return `${oneDecimal(value / MS_PER_SECOND)} s`;
}

function formatTimeToCorrect(milliseconds: number | null): string {
  return milliseconds === null ? "não concluída" : formatSeconds(milliseconds);
}

function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function spokenDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const secondsText = seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  if (minutes === 0) {
    return secondsText;
  }
  const minutesText = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  return `${minutesText} e ${secondsText}`;
}

function pad(value: number): string {
  return String(value).padStart(CLOCK_DIGITS, "0");
}
