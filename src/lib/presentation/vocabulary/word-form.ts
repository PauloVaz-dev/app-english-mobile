import type { RegisterWordOutcome, WordRegistration } from "@/composition/word-registration";
import {
  InvalidVocabularyTextError,
  MAX_EXAMPLE_SENTENCE_LENGTH,
  MAX_VOCABULARY_TERM_LENGTH,
  parseVocabularyTexts,
  VOCABULARY_TEXT_FIELDS,
  type VocabularyTextField,
  type VocabularyTextIssue,
} from "@/lib/domain/vocabulary";
import { HOME_ENTRY_METRICS } from "@/lib/presentation/home/home-entry-layout";

export type WordFormField = VocabularyTextField;
export type WordFormValues = Readonly<Record<WordFormField, string>>;
export type WordFormErrors = Readonly<Partial<Record<WordFormField, string>>>;

export type WordFormNotice =
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

export interface WordFormState {
  readonly values: WordFormValues;
  readonly errors: WordFormErrors;
  readonly notice: WordFormNotice | null;
  readonly saving: boolean;
}

export interface WordFormAction {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export const WORD_FORM_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget;

export const WORD_FORM_TITLE = "Adicionar palavra nova";
export const WORD_FORM_INTRO =
  "Guarde uma palavra que você encontrou. Ela entra no seu estudo como palavra nova.";
export const WORD_FORM_FAILED_MESSAGE = "Não foi possível salvar. Tente de novo.";

export const WORD_FORM_BACK: WordFormAction = {
  label: "Voltar",
  accessibilityLabel: "Voltar para a entrada sem salvar",
};

const SUBMIT: WordFormAction = { label: "Adicionar", accessibilityLabel: "Adicionar a palavra" };
const RETRY: WordFormAction = {
  label: "Tentar de novo",
  accessibilityLabel: "Tentar adicionar a palavra de novo",
};
const SAVING: WordFormAction = { label: "Salvando…", accessibilityLabel: "Salvando a palavra" };

interface FieldCopy {
  readonly label: string;
  readonly marker: "obrigatório" | "opcional";
  readonly required: string | null;
  readonly tooLong: string;
}

const FIELD_COPY: Readonly<Record<WordFormField, FieldCopy>> = {
  english: {
    label: "Inglês",
    marker: "obrigatório",
    required: "Escreva a palavra em inglês.",
    tooLong: `Use no máximo ${MAX_VOCABULARY_TERM_LENGTH} caracteres em inglês.`,
  },
  portuguese: {
    label: "Português",
    marker: "obrigatório",
    required: "Escreva a tradução em português.",
    tooLong: `Use no máximo ${MAX_VOCABULARY_TERM_LENGTH} caracteres em português.`,
  },
  exampleSentence: {
    label: "Frase de exemplo",
    marker: "opcional",
    required: null,
    tooLong: `Use no máximo ${MAX_EXAMPLE_SENTENCE_LENGTH} caracteres na frase.`,
  },
};

const EMPTY_VALUES: WordFormValues = { english: "", portuguese: "", exampleSentence: "" };

export const INITIAL_WORD_FORM_STATE: WordFormState = {
  values: EMPTY_VALUES,
  errors: {},
  notice: null,
  saving: false,
};

export interface WordFormFieldView {
  readonly field: WordFormField;
  readonly label: string;
  readonly marker: FieldCopy["marker"];
  readonly accessibilityLabel: string;
  /** The field's error, read by the screen reader with the field. */
  readonly accessibilityHint: string | undefined;
  readonly value: string;
  readonly error: string | null;
}

export interface WordFormNoticeView {
  readonly tone: "success" | "alert";
  readonly message: string;
}

export interface WordFormView {
  readonly title: string;
  readonly intro: string;
  readonly fields: readonly WordFormFieldView[];
  readonly submit: WordFormAction & { readonly disabled: boolean };
  readonly notice: WordFormNoticeView | null;
}

export function wordFormView(state: WordFormState): WordFormView {
  return {
    title: WORD_FORM_TITLE,
    intro: WORD_FORM_INTRO,
    fields: VOCABULARY_TEXT_FIELDS.map((field) => {
      const copy = FIELD_COPY[field];
      const error = state.errors[field] ?? null;
      return {
        field,
        label: copy.label,
        marker: copy.marker,
        accessibilityLabel: `${copy.label}, ${copy.marker}`,
        accessibilityHint: error ?? undefined,
        value: state.values[field],
        error,
      };
    }),
    submit: { ...submitAction(state), disabled: state.saving },
    notice: noticeView(state.notice),
  };
}

function submitAction(state: WordFormState): WordFormAction {
  if (state.saving) {
    return SAVING;
  }
  return state.notice?.kind === "failed" ? RETRY : SUBMIT;
}

function noticeView(notice: WordFormNotice | null): WordFormNoticeView | null {
  if (notice === null) {
    return null;
  }
  return { tone: notice.kind === "success" ? "success" : "alert", message: notice.message };
}

export interface WordFormControllerDependencies {
  readonly registration: WordRegistration;
  readonly onChange: (state: WordFormState) => void;
  /** Moves the cursor to a field; called before any announcement. */
  readonly focus: (field: WordFormField) => void;
  readonly announce: (message: string) => void;
}

/**
 * Drives the new word form. Text is checked with the copied rules before the
 * database is touched; the composition answers created, invalid or duplicate,
 * and rejects on any other failure, which keeps the typed text for a retry.
 */
export class WordFormController {
  private current: WordFormState = INITIAL_WORD_FORM_STATE;
  private readonly dependencies: WordFormControllerDependencies;

  constructor(dependencies: WordFormControllerDependencies) {
    this.dependencies = dependencies;
  }

  get state(): WordFormState {
    return this.current;
  }

  change(field: WordFormField, value: string): void {
    const notice = this.current.notice?.kind === "success" ? null : this.current.notice;
    this.publish({ ...this.current, values: { ...this.current.values, [field]: value }, notice });
  }

  async submit(): Promise<void> {
    if (this.current.saving) {
      return;
    }
    const values = this.current.values;
    const issues = localIssues(values);
    if (issues.length > 0) {
      this.showIssues(issues);
      return;
    }
    this.publish({ values, errors: {}, notice: null, saving: true });
    let outcome: RegisterWordOutcome;
    try {
      outcome = await this.dependencies.registration.register(values);
    } catch {
      this.publish({
        ...this.current,
        saving: false,
        notice: { kind: "failed", message: WORD_FORM_FAILED_MESSAGE },
      });
      this.dependencies.announce(WORD_FORM_FAILED_MESSAGE);
      return;
    }
    switch (outcome.kind) {
      case "invalid":
        this.showIssues(outcome.issues);
        return;
      case "duplicate": {
        const { english, portuguese } = outcome.existing;
        const pair = `${english} — ${portuguese}`;
        const error = `Já cadastrada: ${pair}.`;
        this.publish({
          ...this.current,
          errors: { english: error, portuguese: error },
          notice: null,
          saving: false,
        });
        this.dependencies.focus("english");
        this.dependencies.announce(`Esta palavra já está cadastrada: ${pair}.`);
        return;
      }
      case "created": {
        const message = `Palavra adicionada: ${outcome.word.english} — ${outcome.word.portuguese}.`;
        this.publish({
          values: EMPTY_VALUES,
          errors: {},
          notice: { kind: "success", message },
          saving: false,
        });
        this.dependencies.focus("english");
        this.dependencies.announce(message);
        return;
      }
    }
  }

  private showIssues(issues: readonly VocabularyTextIssue[]): void {
    const errors: Partial<Record<WordFormField, string>> = {};
    for (const issue of issues) {
      errors[issue.field] ??= issueMessage(issue);
    }
    this.publish({ ...this.current, errors, notice: null, saving: false });
    const first = VOCABULARY_TEXT_FIELDS.find((field) => errors[field] !== undefined);
    if (first !== undefined) {
      this.dependencies.focus(first);
    }
  }

  private publish(state: WordFormState): void {
    this.current = state;
    this.dependencies.onChange(state);
  }
}

function localIssues(values: WordFormValues): readonly VocabularyTextIssue[] {
  try {
    parseVocabularyTexts(values);
    return [];
  } catch (cause) {
    if (cause instanceof InvalidVocabularyTextError) {
      return cause.issues;
    }
    throw cause;
  }
}

function issueMessage(issue: VocabularyTextIssue): string {
  const copy = FIELD_COPY[issue.field];
  return issue.reason === "too_long" ? copy.tooLong : (copy.required ?? copy.tooLong);
}
