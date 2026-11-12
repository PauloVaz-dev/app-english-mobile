import { CHALLENGE_DURATION_MS } from "@/lib/domain/challenge/fixed-challenge";
import type { Word } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const ANNOUNCED_SECONDS = [30, 10] as const;
const PERCENT_DIGITS = 0;
const CLOCK_SECOND_DIGITS = 2;
const ROUND_START = { score: 0, streak: 0 } as const;

export const CHALLENGE_URGENT_SECONDS = 10;
export const CHALLENGE_TIME_UP_HOLD_MS = 1_500;
export const CHALLENGE_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;

export const CHALLENGE_TIME_UP_MESSAGE = "Tempo esgotado";
export const CHALLENGE_OPENING_MESSAGE = "Montando o desafio.";
export const CHALLENGE_INSUFFICIENT_MESSAGE =
  "Não há palavras ativas para montar o desafio. Volte à entrada e use outro treino.";
export const CHALLENGE_FAILED_MESSAGE = "Não foi possível salvar o desafio.";
export const CHALLENGE_WAITING_CARDS =
  "O tempo começa quando os primeiros cartões puderem ser tocados.";
export const CHALLENGE_EXHAUSTED_MESSAGE =
  "As palavras deste desafio acabaram: você acertou todas. O resultado aparece quando o tempo terminar.";
export const CHALLENGE_PERSIST_FAILED_MESSAGE =
  "Não foi possível salvar a última resposta. O tempo continua correndo.";
export const CHALLENGE_SCORE_LABEL = "Pontos";
export const CHALLENGE_STREAK_LABEL = "Sequência";
export const CHALLENGE_RESULT_TITLE = "Resultado";

export interface ChallengeAction {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export interface ChallengeResultAction extends ChallengeAction {
  readonly kind: "playAgain" | "home";
}

export const CHALLENGE_INTRO = {
  title: "Desafio 60s",
  lines: [
    "Você tem 60 segundos.",
    "Acerte o máximo de pares de português e inglês.",
    "Cada acerto vale pontos, e a sequência de acertos aumenta os pontos. Um erro zera a sequência.",
  ],
  calmerPath: "Prefere sem pressa? A revisão e o treino livre continuam na entrada.",
  startLabel: "Começar",
  start: {
    label: "Começar",
    accessibilityLabel: "Começar o desafio de 60 segundos",
  },
  leave: {
    label: "Sair",
    accessibilityLabel: "Sair do desafio e voltar para a entrada",
  },
  retry: {
    label: "Tentar de novo",
    accessibilityLabel: "Tentar de novo",
  },
} as const;

export const CHALLENGE_RESULT_ACTIONS: readonly ChallengeResultAction[] = [
  { kind: "playAgain", label: "Jogar de novo", accessibilityLabel: "Jogar o desafio de novo" },
  { kind: "home", label: "Voltar à entrada", accessibilityLabel: "Voltar para a entrada" },
];

export interface ChallengeOutcome {
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
  readonly accuracy: number;
  readonly bestStreak: number;
  readonly score: number;
  readonly previousBest: number | null;
  readonly isNewRecord: boolean;
}

export interface ChallengeResultRow {
  readonly label: string;
  readonly value: string;
}

export interface ChallengeResultView {
  readonly rows: readonly ChallengeResultRow[];
  readonly isNewRecord: boolean;
  readonly recordText: string;
}

export interface ChallengeClockView {
  readonly waiting: boolean;
  readonly seconds: number;
  readonly label: string;
  readonly urgent: boolean;
  readonly urgentText: string | null;
  readonly expired: boolean;
  readonly accessibilityLabel: string;
}

export type ChallengeRetry = "start" | "begin" | "expire";

export interface ChallengeRoundState {
  readonly kind: "round";
  readonly challengeId: string;
  /** Drawn words, handed to the PairBoard once per round. */
  readonly words: readonly Word[];
  readonly deadline: Date | null;
  readonly score: number;
  readonly streak: number;
  /** A write failed: the board is blocked until "Tentar de novo". The clock keeps running. */
  readonly halted: boolean;
  /** Every drawn word was hit before zero: the board is empty until the deadline. */
  readonly exhausted: boolean;
}

export type ChallengeScreenState =
  | { readonly kind: "intro" }
  | { readonly kind: "opening" }
  | ChallengeRoundState
  | { readonly kind: "timeUp"; readonly challengeId: string }
  | { readonly kind: "result"; readonly result: ChallengeResultView }
  | { readonly kind: "insufficientCatalog" }
  | { readonly kind: "failed"; readonly retry: ChallengeRetry };

export type ChallengeOpeningOutcome =
  | { readonly kind: "opened"; readonly challengeId: string; readonly words: readonly Word[] }
  | { readonly kind: "insufficientCatalog" };

/** What the PairBoard hands over on every attempt. Hit or miss is decided by the session. */
export interface ChallengeBoardAttempt {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
}

export interface ChallengeScreenAttempt extends ChallengeBoardAttempt {
  readonly challengeId: string;
}

/** `late`: the session refused the attempt because the round was already over. */
export type ChallengeAttemptOutcome =
  | {
      readonly kind: "accepted";
      readonly score: number;
      readonly streak: number;
      readonly correctAnswers: number;
    }
  | { readonly kind: "late" };

export interface ChallengeScreenPort {
  start(): Promise<ChallengeOpeningOutcome>;
  begin(challengeId: string, now: Date): Promise<void>;
  attempt(input: ChallengeScreenAttempt, now: Date): Promise<ChallengeAttemptOutcome>;
  expire(challengeId: string, now: Date): Promise<ChallengeOutcome>;
  abandon(challengeId: string, now: Date): Promise<void>;
}

interface ActiveRound {
  readonly challengeId: string;
  readonly words: readonly Word[];
  readonly deadline: Date | null;
}

interface PendingAttempt {
  readonly input: ChallengeScreenAttempt;
  readonly tappedAt: Date;
}

export interface ChallengeScreenControllerDependencies {
  readonly port: ChallengeScreenPort;
  readonly now: () => Date;
  readonly wait: (ms: number) => Promise<void>;
  readonly onChange: (state: ChallengeScreenState) => void;
}

export function challengeClockView(deadline: Date | null, now: Date): ChallengeClockView {
  const waiting = deadline === null;
  const remainingMs = waiting
    ? CHALLENGE_DURATION_MS
    : Math.max(0, deadline.getTime() - now.getTime());
  const seconds = Math.ceil(remainingMs / MS_PER_SECOND);
  const urgent = !waiting && seconds <= CHALLENGE_URGENT_SECONDS;
  return {
    waiting,
    seconds,
    label: formatClock(seconds),
    urgent,
    urgentText: urgent ? urgentText(seconds) : null,
    expired: !waiting && remainingMs === 0,
    accessibilityLabel: `Tempo restante: ${secondsText(seconds)}`,
  };
}

/** The board takes no tap at zero, while a write waits for retry, or once the words ran out. */
export function challengeBoardDisabled(round: ChallengeRoundState, now: Date): boolean {
  return round.halted || round.exhausted || challengeClockView(round.deadline, now).expired;
}

export function challengeTimeAnnouncement(previousSeconds: number, seconds: number): string | null {
  if (previousSeconds > 0 && seconds === 0) {
    return CHALLENGE_TIME_UP_MESSAGE;
  }
  const crossed = ANNOUNCED_SECONDS.some((mark) => previousSeconds > mark && seconds <= mark);
  if (!crossed || seconds === 0) {
    return null;
  }
  return remainingText(seconds);
}

export function challengeResultView(outcome: ChallengeOutcome): ChallengeResultView {
  return {
    rows: [
      { label: "Acertos", value: String(outcome.correctAnswers) },
      { label: "Pontuação", value: String(outcome.score) },
      { label: "Precisão", value: `${outcome.accuracy.toFixed(PERCENT_DIGITS)}%` },
      { label: "Maior sequência", value: String(outcome.bestStreak) },
    ],
    isNewRecord: outcome.isNewRecord,
    recordText: recordText(outcome),
  };
}

/**
 * Drives the challenge route: intro, round, time up, result and the
 * insufficient catalog. The PairBoard decides hits on the spot and never
 * waits; this controller hands each board attempt to the challenge session,
 * one write at a time and in tap order, and takes points and streak from
 * what the session returns. The expiry and the exit wait for the attempts
 * already tapped, so only attempts accepted before zero count.
 */
export class ChallengeScreenController {
  private current: ChallengeScreenState = { kind: "intro" };
  private generation = 0;
  private active: ActiveRound | null = null;
  private pending: PendingAttempt[] = [];
  private writes: Promise<void> = Promise.resolve();
  private readonly dependencies: ChallengeScreenControllerDependencies;

  constructor(dependencies: ChallengeScreenControllerDependencies) {
    this.dependencies = dependencies;
  }

  get state(): ChallengeScreenState {
    return this.current;
  }

  async start(): Promise<void> {
    const kind = this.current.kind;
    if (kind === "opening" || kind === "round" || kind === "timeUp") {
      return;
    }
    this.generation += 1;
    const generation = this.generation;
    this.pending = [];
    this.publish({ kind: "opening" });
    let opening: ChallengeOpeningOutcome;
    try {
      opening = await this.dependencies.port.start();
    } catch {
      this.publishFor(generation, { kind: "failed", retry: "start" });
      return;
    }
    if (generation !== this.generation) {
      if (opening.kind === "opened") {
        await this.quietly(() => this.dependencies.port.abandon(opening.challengeId, this.now()));
      }
      return;
    }
    if (opening.kind === "insufficientCatalog") {
      this.publish({ kind: "insufficientCatalog" });
      return;
    }
    this.active = { challengeId: opening.challengeId, words: opening.words, deadline: null };
    this.publishWaitingRound(this.active);
  }

  /** Called by the board when the first cards can be touched: the 60 seconds start here. */
  cardsReady(): Promise<void> {
    const state = this.current;
    if (state.kind !== "round" || state.deadline !== null) {
      return Promise.resolve();
    }
    const generation = this.generation;
    const now = this.now();
    const deadline = new Date(now.getTime() + CHALLENGE_DURATION_MS);
    this.active = { challengeId: state.challengeId, words: state.words, deadline };
    this.publish({ ...state, deadline });
    return this.queue(async () => {
      try {
        await this.dependencies.port.begin(state.challengeId, now);
      } catch {
        if (generation === this.generation) {
          this.active = { challengeId: state.challengeId, words: state.words, deadline: null };
          this.pending = [];
          this.publish({ kind: "failed", retry: "begin" });
        }
      }
    });
  }

  /** Called by the board on every attempt; the board never awaits it. */
  attempt(attempt: ChallengeBoardAttempt): Promise<void> {
    const round = this.runningRound();
    if (round === null || round.deadline === null) {
      return Promise.resolve();
    }
    const item: PendingAttempt = {
      input: {
        challengeId: round.challengeId,
        attemptId: attempt.attemptId,
        promptWordId: attempt.promptWordId,
        selectedWordId: attempt.selectedWordId,
      },
      tappedAt: this.now(),
    };
    this.pending.push(item);
    if (round.halted) {
      return Promise.resolve();
    }
    return this.queue(() => this.send(item));
  }

  async refresh(): Promise<void> {
    const state = this.current;
    if (state.kind !== "round" || state.deadline === null) {
      return;
    }
    if (this.now().getTime() < state.deadline.getTime()) {
      return;
    }
    await this.expire(state.challengeId);
  }

  async retry(): Promise<void> {
    const state = this.current;
    if (state.kind === "round") {
      await this.resend(state);
      return;
    }
    if (state.kind !== "failed") {
      return;
    }
    const active = this.active;
    if (state.retry === "start" || active === null) {
      this.current = { kind: "intro" };
      await this.start();
      return;
    }
    if (state.retry === "begin") {
      this.publishWaitingRound(active);
      await this.cardsReady();
      return;
    }
    await this.expire(active.challengeId);
  }

  async leave(): Promise<void> {
    this.generation += 1;
    const state = this.current;
    const active = this.active;
    this.current = { kind: "intro" };
    this.active = null;
    this.pending = [];
    if (active === null || state.kind === "timeUp") {
      return;
    }
    const { challengeId, deadline } = active;
    const now = this.now();
    if (deadline !== null && now.getTime() >= deadline.getTime()) {
      await this.queue(() => this.quietly(() => this.dependencies.port.expire(challengeId, now)));
      return;
    }
    await this.queue(() => this.quietly(() => this.dependencies.port.abandon(challengeId, now)));
  }

  private async expire(challengeId: string): Promise<void> {
    const generation = this.generation;
    const now = this.now();
    this.publish({ kind: "timeUp", challengeId });
    const tapped = this.pending.slice();
    for (const item of tapped) {
      void this.queue(() => this.send(item));
    }
    let outcome: ChallengeOutcome;
    try {
      [outcome] = await Promise.all([
        this.queue(() => this.dependencies.port.expire(challengeId, now)),
        this.dependencies.wait(CHALLENGE_TIME_UP_HOLD_MS),
      ]);
    } catch {
      this.publishFor(generation, { kind: "failed", retry: "expire" });
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.active = null;
    this.pending = [];
    this.publish({ kind: "result", result: challengeResultView(outcome) });
  }

  private async resend(round: ChallengeRoundState): Promise<void> {
    if (!round.halted) {
      return;
    }
    this.publish({ ...round, halted: false });
    const tapped = this.pending.slice();
    await Promise.all(tapped.map((item) => this.queue(() => this.send(item))));
  }

  private async send(item: PendingAttempt): Promise<void> {
    const state = this.current;
    if (!this.pending.includes(item) || (state.kind === "round" && state.halted)) {
      return;
    }
    const generation = this.generation;
    let outcome: ChallengeAttemptOutcome;
    try {
      outcome = await this.dependencies.port.attempt(item.input, item.tappedAt);
    } catch {
      if (generation === this.generation) {
        this.halt();
      }
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.pending = this.pending.filter((queued) => queued !== item);
    const round = this.runningRound();
    if (outcome.kind === "late" || round === null) {
      return;
    }
    this.publish({
      ...round,
      score: outcome.score,
      streak: outcome.streak,
      exhausted: outcome.correctAnswers >= round.words.length,
    });
  }

  private halt(): void {
    const round = this.runningRound();
    if (round !== null && !round.halted) {
      this.publish({ ...round, halted: true });
    }
  }

  private runningRound(): ChallengeRoundState | null {
    const state = this.current;
    if (state.kind !== "round" || state.challengeId !== this.active?.challengeId) {
      return null;
    }
    return state;
  }

  /** Runs the session writes one at a time, in the order they were asked for. */
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.then(work);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private publishWaitingRound(active: ActiveRound): void {
    this.publish({
      kind: "round",
      challengeId: active.challengeId,
      words: active.words,
      deadline: null,
      ...ROUND_START,
      halted: false,
      exhausted: false,
    });
  }

  private now(): Date {
    return this.dependencies.now();
  }

  private publishFor(generation: number, state: ChallengeScreenState): void {
    if (generation === this.generation) {
      this.publish(state);
    }
  }

  private publish(state: ChallengeScreenState): void {
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

function recordText(outcome: ChallengeOutcome): string {
  if (outcome.isNewRecord && outcome.previousBest === null) {
    return "Recorde novo! É o seu primeiro desafio concluído.";
  }
  if (outcome.isNewRecord) {
    return `Recorde novo! O anterior era ${outcome.previousBest} pontos.`;
  }
  if (outcome.previousBest === null) {
    return "";
  }
  if (outcome.score === outcome.previousBest) {
    return `Você empatou com o seu recorde de ${outcome.previousBest} pontos.`;
  }
  return `Seu recorde continua ${outcome.previousBest} pontos.`;
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(rest).padStart(CLOCK_SECOND_DIGITS, "0")}`;
}

function secondsText(seconds: number): string {
  return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
}

function remainingText(seconds: number): string {
  return seconds === 1 ? "Falta 1 segundo" : `Faltam ${secondsText(seconds)}`;
}

function urgentText(seconds: number): string {
  if (seconds === 0) {
    return CHALLENGE_TIME_UP_MESSAGE;
  }
  return remainingText(seconds);
}
