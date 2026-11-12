import {
  createGameBoard,
  resolveBoardSelection,
  type BoardSelection,
  type GameBoard,
  type GameCard,
} from "@/lib/domain/game/game-engine";
import type { RandomSource, Word } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";

/**
 * Pure state of the PairBoard port. Hits, misses and replacement come from
 * the copied game engine; this module only adds selection, the moment each
 * pair entered the board, feedback and the copy read by the screen reader.
 * It knows nothing about sessions, the database, scoring or timers.
 */

export type PairBoardLanguage = GameCard["language"];
export type PairBoardFeedbackTone = "correct" | "incorrect";
export type PairBoardCardStatus = "idle" | "selected" | "incorrect" | "disabled";

export const PAIR_BOARD_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;
export const PAIR_BOARD_FEEDBACK_MS = 1_200;
export const PAIR_BOARD_ENTER_ANIMATION_MS = 180;
export const PAIR_BOARD_COLUMN_TITLES: Readonly<Record<PairBoardLanguage, string>> = {
  portuguese: "Português",
  english: "Inglês",
};
export const PAIR_BOARD_CARD_HINT = "Toque para escolher este cartão.";
export const PAIR_BOARD_FEEDBACK = {
  correct: { icon: "✓", title: "Acertou" },
  incorrect: { icon: "✕", title: "Não combina" },
} as const;
const MISS_DETAIL = "Tente de novo.";

export interface PairBoardAttempt {
  readonly attemptId: string;
  readonly promptWordId: string;
  readonly selectedWordId: string;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
}

export interface PairBoardFeedback {
  readonly id: number;
  readonly tone: PairBoardFeedbackTone;
  readonly detail: string;
}

export interface PairBoardState {
  readonly board: GameBoard;
  readonly ready: boolean;
  readonly disabled: boolean;
  readonly selectedPortugueseId: string | null;
  readonly selectedEnglishId: string | null;
  readonly missedPortugueseId: string | null;
  readonly missedEnglishId: string | null;
  /** When each visible pair entered the board. Presentation only: never used for response time. */
  readonly pairEnteredAtMs: Readonly<Record<string, number>>;
  /** First tap of the attempt in progress (response time measurement version 2). */
  readonly attemptStartedAtMs: number | null;
  readonly feedback: PairBoardFeedback | null;
  readonly feedbackCount: number;
}

export type PairBoardEffect =
  | { readonly type: "ready"; readonly wordIds: readonly string[] }
  | { readonly type: "pairs_entered"; readonly wordIds: readonly string[] }
  | { readonly type: "attempt"; readonly attempt: PairBoardAttempt }
  | { readonly type: "announce"; readonly message: string };

export interface PairBoardTransition {
  readonly state: PairBoardState;
  readonly effects: readonly PairBoardEffect[];
}

export interface PairBoardSelectInput {
  readonly wordId: string;
  readonly language: PairBoardLanguage;
  readonly nowMs: number;
  readonly createAttemptId: () => string;
  readonly random: RandomSource;
}

export interface PairBoardCardView {
  readonly status: PairBoardCardStatus;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly text: string;
  readonly accessibilityLabel: string;
}

export interface PairBoardFeedbackView {
  readonly tone: PairBoardFeedbackTone;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
}

export function createPairBoardState(words: readonly Word[], random: RandomSource): PairBoardState {
  return {
    board: createGameBoard(words, random),
    ready: false,
    disabled: false,
    selectedPortugueseId: null,
    selectedEnglishId: null,
    missedPortugueseId: null,
    missedEnglishId: null,
    pairEnteredAtMs: {},
    attemptStartedAtMs: null,
    feedback: null,
    feedbackCount: 0,
  };
}

export function markPairBoardReady(state: PairBoardState, nowMs: number): PairBoardTransition {
  if (state.ready || state.disabled) {
    return { state, effects: [] };
  }
  const wordIds = state.board.portugueseCards.map((card) => card.wordId);
  return {
    state: { ...state, ready: true, pairEnteredAtMs: stampEntries({}, wordIds, nowMs) },
    effects: [{ type: "ready", wordIds }],
  };
}

export function setPairBoardDisabled(state: PairBoardState, disabled: boolean): PairBoardState {
  if (state.disabled === disabled) {
    return state;
  }
  return disabled ? { ...clearSelection(state), disabled } : { ...state, disabled };
}

export function clearPairBoardFeedback(state: PairBoardState, feedbackId: number): PairBoardState {
  if (state.feedback?.id !== feedbackId) {
    return state;
  }
  return { ...state, feedback: null, missedPortugueseId: null, missedEnglishId: null };
}

export function selectPairBoardCard(
  state: PairBoardState,
  input: PairBoardSelectInput,
): PairBoardTransition {
  if (!state.ready || state.disabled || !isVisible(state.board, input.wordId, input.language)) {
    return { state, effects: [] };
  }
  const tapped = startAttemptClock(
    state,
    toggleSelection({ ...state, missedPortugueseId: null, missedEnglishId: null }, input),
    input.nowMs,
  );
  if (tapped.selectedPortugueseId === null || tapped.selectedEnglishId === null) {
    return { state: tapped, effects: [] };
  }
  const selection = {
    promptWordId: tapped.selectedPortugueseId,
    selectedWordId: tapped.selectedEnglishId,
  };
  return resolveAttempt(tapped, selection, input);
}

export function pairBoardCardView(state: PairBoardState, card: GameCard): PairBoardCardView {
  const status = cardStatus(state, card);
  return {
    status,
    selected: status === "selected",
    disabled: status === "disabled",
    text: card.text,
    accessibilityLabel: `${PAIR_BOARD_COLUMN_TITLES[card.language]}: ${card.text}. ${STATUS_LABELS[status]}`,
  };
}

export function pairBoardFeedbackView(
  feedback: PairBoardFeedback | null,
): PairBoardFeedbackView | null {
  if (feedback === null) {
    return null;
  }
  return { tone: feedback.tone, ...PAIR_BOARD_FEEDBACK[feedback.tone], detail: feedback.detail };
}

const STATUS_LABELS: Readonly<Record<PairBoardCardStatus, string>> = {
  idle: "Não selecionado.",
  selected: "Selecionado.",
  incorrect: "Não combinou.",
  disabled: "Indisponível.",
};

function cardStatus(state: PairBoardState, card: GameCard): PairBoardCardStatus {
  if (!state.ready || state.disabled) {
    return "disabled";
  }
  const isPortuguese = card.language === "portuguese";
  const selectedId = isPortuguese ? state.selectedPortugueseId : state.selectedEnglishId;
  if (selectedId === card.wordId) {
    return "selected";
  }
  const missedId = isPortuguese ? state.missedPortugueseId : state.missedEnglishId;
  return missedId === card.wordId ? "incorrect" : "idle";
}

function toggleSelection(state: PairBoardState, input: PairBoardSelectInput): PairBoardState {
  if (input.language === "portuguese") {
    const next = state.selectedPortugueseId === input.wordId ? null : input.wordId;
    return { ...state, selectedPortugueseId: next };
  }
  const next = state.selectedEnglishId === input.wordId ? null : input.wordId;
  return { ...state, selectedEnglishId: next };
}

function resolveAttempt(
  state: PairBoardState,
  { promptWordId, selectedWordId }: BoardSelection,
  input: PairBoardSelectInput,
): PairBoardTransition {
  const resolution = resolveBoardSelection(
    state.board,
    { promptWordId, selectedWordId },
    input.random,
  );
  const attempt: PairBoardAttempt = {
    attemptId: input.createAttemptId(),
    promptWordId,
    selectedWordId,
    isCorrect: resolution.isCorrect,
    responseTimeMs: elapsedSinceFirstTap(state, input.nowMs),
  };
  const feedbackId = state.feedbackCount + 1;
  const cleared = { ...clearSelection(state), feedbackCount: feedbackId };
  if (!resolution.isCorrect) {
    return {
      state: {
        ...cleared,
        missedPortugueseId: promptWordId,
        missedEnglishId: selectedWordId,
        feedback: { id: feedbackId, tone: "incorrect", detail: MISS_DETAIL },
      },
      effects: [
        { type: "attempt", attempt },
        { type: "announce", message: `${PAIR_BOARD_FEEDBACK.incorrect.title}. ${MISS_DETAIL}` },
      ],
    };
  }
  return applyHit({
    previous: state,
    cleared,
    board: resolution.board,
    attempt,
    nowMs: input.nowMs,
  });
}

interface HitInput {
  readonly previous: PairBoardState;
  readonly cleared: PairBoardState;
  readonly board: GameBoard;
  readonly attempt: PairBoardAttempt;
  readonly nowMs: number;
}

function applyHit({ previous, cleared, board, attempt, nowMs }: HitInput): PairBoardTransition {
  const pairText = matchedPairText(previous.board, attempt.promptWordId);
  const previousIds = new Set(previous.board.portugueseCards.map((card) => card.wordId));
  const enteredIds = board.portugueseCards
    .map((card) => card.wordId)
    .filter((wordId) => !previousIds.has(wordId));
  const remainingEntries = Object.fromEntries(
    Object.entries(previous.pairEnteredAtMs).filter(([wordId]) => wordId !== attempt.promptWordId),
  );
  const effects: PairBoardEffect[] = [{ type: "attempt", attempt }];
  if (enteredIds.length > 0) {
    effects.push({ type: "pairs_entered", wordIds: enteredIds });
  }
  effects.push({ type: "announce", message: `${PAIR_BOARD_FEEDBACK.correct.title}: ${pairText}.` });
  return {
    state: {
      ...cleared,
      board,
      pairEnteredAtMs: stampEntries(remainingEntries, enteredIds, nowMs),
      feedback: { id: cleared.feedbackCount, tone: "correct", detail: pairText },
    },
    effects,
  };
}

function matchedPairText(board: GameBoard, wordId: string): string {
  const english = board.englishCards.find((card) => card.wordId === wordId)?.text ?? "";
  const portuguese = board.portugueseCards.find((card) => card.wordId === wordId)?.text ?? "";
  return `${english} é ${portuguese}`;
}

/**
 * Response time version 2, as in the site: the clock starts on the first tap
 * made with nothing selected and keeps running through swaps in the same
 * language. Emptying the selection stops it; the next first tap restarts it.
 */
function startAttemptClock(
  before: PairBoardState,
  after: PairBoardState,
  nowMs: number,
): PairBoardState {
  if (after.selectedPortugueseId === null && after.selectedEnglishId === null) {
    return { ...after, attemptStartedAtMs: null };
  }
  const wasIdle = before.selectedPortugueseId === null && before.selectedEnglishId === null;
  const startedAtMs = wasIdle ? nowMs : (before.attemptStartedAtMs ?? nowMs);
  return { ...after, attemptStartedAtMs: startedAtMs };
}

function elapsedSinceFirstTap(state: PairBoardState, nowMs: number): number {
  const startedAtMs = state.attemptStartedAtMs ?? nowMs;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}

function stampEntries(
  entries: Readonly<Record<string, number>>,
  wordIds: readonly string[],
  nowMs: number,
): Record<string, number> {
  const next: Record<string, number> = { ...entries };
  for (const wordId of wordIds) {
    next[wordId] = nowMs;
  }
  return next;
}

function clearSelection(state: PairBoardState): PairBoardState {
  return {
    ...state,
    selectedPortugueseId: null,
    selectedEnglishId: null,
    attemptStartedAtMs: null,
  };
}

function isVisible(board: GameBoard, wordId: string, language: PairBoardLanguage): boolean {
  const cards = language === "portuguese" ? board.portugueseCards : board.englishCards;
  return cards.some((card) => card.wordId === wordId);
}

export interface PairBoardCallbacks {
  readonly onReady: (enteredWordIds: readonly string[]) => void;
  readonly onPairsEntered: (wordIds: readonly string[]) => void;
  /** Called on every attempt and never awaited: feedback does not wait for it. */
  readonly onAttempt: (attempt: PairBoardAttempt) => void;
}

export interface PairBoardControllerOptions {
  readonly words: readonly Word[];
  readonly random: RandomSource;
  readonly now: () => number;
  readonly createAttemptId: () => string;
  readonly announce: (message: string) => void;
  readonly onChange: (state: PairBoardState) => void;
}

const NO_CALLBACKS: PairBoardCallbacks = {
  onReady: () => undefined,
  onPairsEntered: () => undefined,
  onAttempt: () => undefined,
};

/**
 * Holds the board state outside React so the effects (callbacks and
 * announcements) run once per tap, after the state is updated.
 */
export class PairBoardController {
  private current: PairBoardState;
  private callbacks: PairBoardCallbacks = NO_CALLBACKS;

  constructor(private readonly options: PairBoardControllerOptions) {
    this.current = createPairBoardState(options.words, options.random);
  }

  get state(): PairBoardState {
    return this.current;
  }

  setCallbacks(callbacks: PairBoardCallbacks): void {
    this.callbacks = callbacks;
  }

  ready(): void {
    this.apply(markPairBoardReady(this.current, this.options.now()));
  }

  select(wordId: string, language: PairBoardLanguage): void {
    this.apply(
      selectPairBoardCard(this.current, {
        wordId,
        language,
        nowMs: this.options.now(),
        createAttemptId: this.options.createAttemptId,
        random: this.options.random,
      }),
    );
  }

  setDisabled(disabled: boolean): void {
    this.apply({ state: setPairBoardDisabled(this.current, disabled), effects: [] });
  }

  clearFeedback(feedbackId: number): void {
    this.apply({ state: clearPairBoardFeedback(this.current, feedbackId), effects: [] });
  }

  private apply({ state, effects }: PairBoardTransition): void {
    if (state !== this.current) {
      this.current = state;
      this.options.onChange(state);
    }
    for (const effect of effects) {
      this.emit(effect);
    }
  }

  private emit(effect: PairBoardEffect): void {
    switch (effect.type) {
      case "ready":
        this.callbacks.onReady(effect.wordIds);
        return;
      case "pairs_entered":
        this.callbacks.onPairsEntered(effect.wordIds);
        return;
      case "attempt":
        this.callbacks.onAttempt(effect.attempt);
        return;
      case "announce":
        this.options.announce(effect.message);
        return;
    }
  }
}
