import { vocabularyKey } from "./vocabulary-key";
import type { VocabularyTexts } from "./vocabulary-text";

export interface VocabularyIdentity {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
}

export class DuplicateVocabularyError extends Error {
  readonly code = "DUPLICATE_VOCABULARY";

  constructor(readonly existing: VocabularyIdentity) {
    super("A vocabulary entry with the same English and Portuguese already exists.");
    this.name = "DuplicateVocabularyError";
  }
}

export class InvalidVocabularyEntryError extends Error {
  readonly code = "INVALID_VOCABULARY_ENTRY";

  constructor(message: string) {
    super(message);
    this.name = "InvalidVocabularyEntryError";
  }
}

export class VocabularyEntry {
  private constructor(
    readonly id: string,
    private readonly texts: VocabularyTexts,
    readonly active: boolean,
  ) {}

  static create(input: { readonly id: string; readonly texts: VocabularyTexts }): VocabularyEntry {
    return new VocabularyEntry(requireEntryId(input.id), input.texts, true);
  }

  static restore(input: {
    readonly id: string;
    readonly texts: VocabularyTexts;
    readonly active: boolean;
  }): VocabularyEntry {
    return new VocabularyEntry(requireEntryId(input.id), input.texts, input.active);
  }

  get english(): string {
    return this.texts.english;
  }

  get portuguese(): string {
    return this.texts.portuguese;
  }

  get exampleSentence(): string | null {
    return this.texts.exampleSentence;
  }

  key(): string {
    return vocabularyKey(this.english, this.portuguese);
  }

  identity(): VocabularyIdentity {
    return {
      id: this.id,
      english: this.english,
      portuguese: this.portuguese,
    };
  }

  withTexts(texts: VocabularyTexts): VocabularyEntry {
    return new VocabularyEntry(this.id, texts, this.active);
  }

  deactivate(): VocabularyEntry {
    return new VocabularyEntry(this.id, this.texts, false);
  }

  reactivate(): VocabularyEntry {
    return new VocabularyEntry(this.id, this.texts, true);
  }
}

export function findDuplicateEntry(
  entries: readonly VocabularyEntry[],
  key: string,
  exceptId?: string,
): VocabularyEntry | undefined {
  return entries.find((entry) => entry.id !== exceptId && entry.key() === key);
}

export function compareVocabularyEntries(left: VocabularyEntry, right: VocabularyEntry): number {
  const byEnglish = left.english.localeCompare(right.english, "en", {
    sensitivity: "base",
  });
  if (byEnglish !== 0) {
    return byEnglish;
  }
  return left.portuguese.localeCompare(right.portuguese, "pt", {
    sensitivity: "base",
  });
}

function requireEntryId(value: string): string {
  const id = value.trim();
  if (id.length === 0) {
    throw new InvalidVocabularyEntryError("Vocabulary entry id is required.");
  }
  return id;
}
