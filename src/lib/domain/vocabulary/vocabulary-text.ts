export const MAX_VOCABULARY_TERM_LENGTH = 80;
export const MAX_EXAMPLE_SENTENCE_LENGTH = 240;

const REPEATED_SPACES = /\s+/g;

export const VOCABULARY_TEXT_FIELDS = [
  "english",
  "portuguese",
  "exampleSentence",
] as const;

export type VocabularyTextField = (typeof VOCABULARY_TEXT_FIELDS)[number];
export type VocabularyTextFailure = "required" | "too_long";

export class InvalidVocabularyTextError extends Error {
  readonly code = "INVALID_VOCABULARY_TEXT";
  readonly field: VocabularyTextField;
  readonly reason: VocabularyTextFailure;

  constructor(readonly issues: readonly VocabularyTextIssue[]) {
    const first = issues[0];
    super(`Vocabulary ${first?.field ?? "text"} is ${first?.reason ?? "invalid"}.`);
    this.name = "InvalidVocabularyTextError";
    this.field = first?.field ?? "english";
    this.reason = first?.reason ?? "required";
  }
}

export interface VocabularyTextIssue {
  readonly field: VocabularyTextField;
  readonly reason: VocabularyTextFailure;
}

export interface VocabularyTexts {
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence: string | null;
}

export interface VocabularyTextInput {
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence?: string | null;
}

export function parseVocabularyTexts(input: VocabularyTextInput): VocabularyTexts {
  const issues: VocabularyTextIssue[] = [];
  const english = readTerm(input.english, "english", issues);
  const portuguese = readTerm(input.portuguese, "portuguese", issues);
  const exampleSentence = readSentence(input.exampleSentence, issues);
  if (issues.length > 0 || english === null || portuguese === null) {
    throw new InvalidVocabularyTextError(issues);
  }
  return { english, portuguese, exampleSentence };
}

function readTerm(
  value: string,
  field: "english" | "portuguese",
  issues: VocabularyTextIssue[],
): string | null {
  const text = collapseSpaces(value);
  if (text.length === 0) {
    issues.push({ field, reason: "required" });
    return null;
  }
  if (text.length > MAX_VOCABULARY_TERM_LENGTH) {
    issues.push({ field, reason: "too_long" });
    return null;
  }
  return text;
}

function readSentence(
  value: string | null | undefined,
  issues: VocabularyTextIssue[],
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text = collapseSpaces(value);
  if (text.length === 0) {
    return null;
  }
  if (text.length > MAX_EXAMPLE_SENTENCE_LENGTH) {
    issues.push({ field: "exampleSentence", reason: "too_long" });
    return null;
  }
  return text;
}

function collapseSpaces(value: string): string {
  return value.trim().replace(REPEATED_SPACES, " ");
}
