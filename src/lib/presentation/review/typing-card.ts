import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";

export const TYPING_CARD_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;
export const TYPING_CARD_OUTCOMES = ["CORRECT", "ALMOST", "WRONG", "DONT_KNOW"] as const;
export type TypingCardOutcome = (typeof TYPING_CARD_OUTCOMES)[number];

export const TYPING_CARD_PROMPT_LABEL = "Em português";
export const TYPING_CARD_FIELD_LABEL = "Digite em inglês";
export const TYPING_CARD_HINT_LABEL = "Dica";
export const TYPING_CARD_SKIP_LABEL = "Não sei";
export const TYPING_CARD_SEND_LABEL = "Enviar";
export const TYPING_CARD_NEXT_LABEL = "Continuar";
export const TYPING_CARD_EXAMPLE_LABEL = "Frase de exemplo";
export const TYPING_CARD_REINFORCEMENT = {
  label: "Reforço",
  detail: "Esta palavra volta só para praticar. A nota já foi registrada.",
} as const;

const TYPING_CARD_HINT_ACCESS = "Dica. Revela a primeira letra.";
const TYPING_CARD_SKIP_ACCESS = "Não sei. Envia sem texto.";
const TYPING_CARD_SEND_ACCESS = "Enviar a resposta";
const TYPING_CARD_NEXT_ACCESS = "Continuar para o próximo cartão";
const TYPING_CARD_FEEDBACK = {
  CORRECT: { icon: "✓", title: "Certo" },
  ALMOST: { icon: "≈", title: "Quase" },
  WRONG: { icon: "✕", title: "Errado" },
  DONT_KNOW: { icon: "?", title: "Não sei" },
} as const;

export interface TypingCardPrompt {
  readonly wordId: string;
  readonly portuguese: string;
  readonly firstLetter: string;
  readonly reinforcement: boolean;
}

export interface TypingCardSubmission {
  readonly wordId: string;
  readonly reinforcement: boolean;
  readonly kind: "answer" | "dont_know";
  readonly typed: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
}

export interface TypingCardResult {
  readonly outcome: TypingCardOutcome;
  readonly expected: string;
  readonly exampleSentence: string | null;
}

export type TypingCardPhase = "answering" | "pending" | "feedback" | "advancing";

export interface TypingCardState {
  readonly prompt: TypingCardPrompt;
  readonly phase: TypingCardPhase;
  readonly draft: string;
  readonly hintRevealed: boolean;
  readonly shownAtMs: number;
  readonly result: TypingCardResult | null;
}

export type TypingCardEffect =
  | { readonly type: "focus" }
  | { readonly type: "submit"; readonly submission: TypingCardSubmission }
  | { readonly type: "announce"; readonly message: string }
  | { readonly type: "continue" };

export interface TypingCardTransition {
  readonly state: TypingCardState;
  readonly effects: readonly TypingCardEffect[];
}

export interface TypingCardActionView {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
}

export interface TypingCardFeedbackView {
  readonly outcome: TypingCardOutcome;
  readonly icon: string;
  readonly title: string;
  readonly detail: string;
  readonly exampleSentence: string | null;
  readonly announcement: string;
}

export interface TypingCardView {
  readonly portuguese: string;
  readonly promptLabel: string;
  readonly fieldLabel: string;
  readonly draft: string;
  readonly hint: string | null;
  readonly reinforcement: { readonly label: string; readonly detail: string } | null;
  readonly answering: boolean;
  readonly hintAction: TypingCardActionView;
  readonly skipAction: TypingCardActionView;
  readonly sendAction: TypingCardActionView;
  readonly feedback: TypingCardFeedbackView | null;
}

export function openTypingCard(prompt: TypingCardPrompt, nowMs: number): TypingCardTransition {
  return {
    state: {
      prompt,
      phase: "answering",
      draft: "",
      hintRevealed: false,
      shownAtMs: nowMs,
      result: null,
    },
    effects: [{ type: "focus" }],
  };
}

export function changeTypingDraft(state: TypingCardState, text: string): TypingCardState {
  if (state.phase !== "answering" || state.draft === text) {
    return state;
  }
  return { ...state, draft: text };
}

export function revealTypingHint(state: TypingCardState): TypingCardState {
  if (state.phase !== "answering" || state.hintRevealed) {
    return state;
  }
  return { ...state, hintRevealed: true };
}

export function submitTypingAnswer(state: TypingCardState, nowMs: number): TypingCardTransition {
  return beginSubmission(state, nowMs, "answer");
}

export function submitTypingDontKnow(state: TypingCardState, nowMs: number): TypingCardTransition {
  return beginSubmission(state, nowMs, "dont_know");
}

export function showTypingResult(
  state: TypingCardState,
  result: TypingCardResult,
): TypingCardTransition {
  if (state.phase !== "pending") {
    return { state, effects: [] };
  }
  const stored = {
    outcome: result.outcome,
    expected: result.expected,
    exampleSentence: readExample(result.exampleSentence),
  };
  return {
    state: { ...state, phase: "feedback", result: stored },
    effects: [{ type: "announce", message: describeFeedback(stored).announcement }],
  };
}

export function continueTypingCard(state: TypingCardState): TypingCardTransition {
  if (state.phase !== "feedback") {
    return { state, effects: [] };
  }
  return { state: { ...state, phase: "advancing" }, effects: [{ type: "continue" }] };
}

export function buildTypingCardView(state: TypingCardState): TypingCardView {
  const answering = state.phase === "answering";
  const continuing = state.phase === "feedback";
  const canSend = answering && state.draft.trim().length > 0;
  return {
    portuguese: state.prompt.portuguese,
    promptLabel: TYPING_CARD_PROMPT_LABEL,
    fieldLabel: TYPING_CARD_FIELD_LABEL,
    draft: state.draft,
    hint: readHintLine(state),
    reinforcement: state.prompt.reinforcement ? TYPING_CARD_REINFORCEMENT : null,
    answering,
    hintAction: {
      label: TYPING_CARD_HINT_LABEL,
      accessibilityLabel: TYPING_CARD_HINT_ACCESS,
      disabled: !answering,
    },
    skipAction: {
      label: TYPING_CARD_SKIP_LABEL,
      accessibilityLabel: TYPING_CARD_SKIP_ACCESS,
      disabled: !answering,
    },
    sendAction: {
      label: readSendLabel(state.phase),
      accessibilityLabel: readSendAccess(state.phase),
      disabled: !canSend && !continuing,
    },
    feedback: readFeedback(state),
  };
}

export interface TypingCardCallbacks {
  readonly onSubmit: (submission: TypingCardSubmission) => void;
  readonly onContinue: () => void;
}

export interface TypingCardControllerOptions {
  readonly prompt: TypingCardPrompt;
  readonly now: () => number;
  readonly onChange: (state: TypingCardState) => void;
  readonly focus: () => void;
  readonly announce: (message: string) => void;
}

const NO_CALLBACKS: TypingCardCallbacks = {
  onSubmit: () => undefined,
  onContinue: () => undefined,
};

export class TypingCardController {
  private current: TypingCardState;
  private callbacks: TypingCardCallbacks = NO_CALLBACKS;
  private focused = false;

  constructor(private readonly options: TypingCardControllerOptions) {
    this.current = openTypingCard(options.prompt, options.now()).state;
  }

  get state(): TypingCardState {
    return this.current;
  }

  setCallbacks(callbacks: TypingCardCallbacks): void {
    this.callbacks = callbacks;
  }

  open(prompt: TypingCardPrompt): void {
    if (matchesTypingPrompt(this.current.prompt, prompt)) {
      this.focusOnce();
      return;
    }
    this.focused = true;
    this.apply(openTypingCard(prompt, this.options.now()));
  }

  changeDraft(text: string): void {
    this.replace(changeTypingDraft(this.current, text));
  }

  revealHint(): void {
    this.replace(revealTypingHint(this.current));
  }

  send(): void {
    this.apply(submitTypingAnswer(this.current, this.options.now()));
  }

  skip(): void {
    this.apply(submitTypingDontKnow(this.current, this.options.now()));
  }

  showResult(result: TypingCardResult): void {
    this.apply(showTypingResult(this.current, result));
  }

  next(): void {
    this.apply(continueTypingCard(this.current));
  }

  private focusOnce(): void {
    if (this.focused) {
      return;
    }
    this.focused = true;
    this.options.focus();
  }

  private replace(state: TypingCardState): void {
    if (state === this.current) {
      return;
    }
    this.current = state;
    this.options.onChange(state);
  }

  private apply(transition: TypingCardTransition): void {
    this.replace(transition.state);
    for (const effect of transition.effects) {
      this.emit(effect);
    }
  }

  private emit(effect: TypingCardEffect): void {
    switch (effect.type) {
      case "focus":
        this.options.focus();
        return;
      case "submit":
        this.callbacks.onSubmit(effect.submission);
        return;
      case "announce":
        this.options.announce(effect.message);
        return;
      case "continue":
        this.callbacks.onContinue();
        return;
    }
  }
}

function beginSubmission(
  state: TypingCardState,
  nowMs: number,
  kind: TypingCardSubmission["kind"],
): TypingCardTransition {
  if (state.phase !== "answering") {
    return { state, effects: [] };
  }
  const typed = kind === "dont_know" ? null : state.draft.trim();
  if (typed !== null && typed.length === 0) {
    return { state, effects: [] };
  }
  return {
    state: { ...state, phase: "pending", draft: typed ?? state.draft },
    effects: [
      {
        type: "submit",
        submission: {
          wordId: state.prompt.wordId,
          reinforcement: state.prompt.reinforcement,
          kind,
          typed,
          usedHint: state.hintRevealed,
          responseTimeMs: measureShownTime(state.shownAtMs, nowMs),
        },
      },
    ],
  };
}

function readHintLine(state: TypingCardState): string | null {
  if (!state.hintRevealed || state.phase === "feedback" || state.phase === "advancing") {
    return null;
  }
  return `A palavra começa com ${state.prompt.firstLetter}.`;
}

function readFeedback(state: TypingCardState): TypingCardFeedbackView | null {
  if (state.result === null || (state.phase !== "feedback" && state.phase !== "advancing")) {
    return null;
  }
  return describeFeedback(state.result);
}

function describeFeedback(result: TypingCardResult): TypingCardFeedbackView {
  const copy = TYPING_CARD_FEEDBACK[result.outcome];
  const detail = readOutcomeDetail(result.outcome, result.expected);
  return {
    outcome: result.outcome,
    icon: copy.icon,
    title: copy.title,
    detail,
    exampleSentence: result.exampleSentence,
    announcement: buildAnnouncement(copy.title, detail, result.exampleSentence),
  };
}

function readOutcomeDetail(outcome: TypingCardOutcome, expected: string): string {
  switch (outcome) {
    case "CORRECT":
      return `A palavra em inglês é ${expected}.`;
    case "ALMOST":
      return `A grafia correta é ${expected}.`;
    case "WRONG":
      return `A resposta correta é ${expected}.`;
    case "DONT_KNOW":
      return `Você pediu para ver a resposta. A palavra em inglês é ${expected}.`;
  }
}

function buildAnnouncement(title: string, detail: string, exampleSentence: string | null): string {
  const result = `${title}. ${detail}`;
  if (exampleSentence === null) {
    return result;
  }
  return `${result} ${TYPING_CARD_EXAMPLE_LABEL}: ${exampleSentence}`;
}

function readSendLabel(phase: TypingCardPhase): string {
  if (phase === "feedback" || phase === "advancing") {
    return TYPING_CARD_NEXT_LABEL;
  }
  return TYPING_CARD_SEND_LABEL;
}

function readSendAccess(phase: TypingCardPhase): string {
  if (phase === "feedback" || phase === "advancing") {
    return TYPING_CARD_NEXT_ACCESS;
  }
  return TYPING_CARD_SEND_ACCESS;
}

function readExample(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const sentence = value.trim();
  if (sentence.length === 0) {
    return null;
  }
  return sentence;
}

function measureShownTime(shownAtMs: number, nowMs: number): number {
  return Math.max(0, Math.round(nowMs - shownAtMs));
}

function matchesTypingPrompt(left: TypingCardPrompt, right: TypingCardPrompt): boolean {
  return left.wordId === right.wordId && left.reinforcement === right.reinforcement;
}
