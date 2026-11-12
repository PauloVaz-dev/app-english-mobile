import {
  DuplicateVocabularyError,
  findDuplicateEntry,
  parseVocabularyTexts,
  VocabularyEntry,
  type VocabularyTextInput,
} from "@/lib/domain/vocabulary";

import type { VocabularyRepository } from "./ports/vocabulary-repository";

export interface IdGenerator {
  generate(): string;
}

export interface CreatedWord {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence: string | null;
  readonly active: boolean;
}

/**
 * Adapted from the site's `CreateWord`. Invalid text throws
 * `InvalidVocabularyTextError` before any transaction; a duplicate, active or
 * not, throws `DuplicateVocabularyError` with the stored texts.
 */
export class CreateWord {
  constructor(
    private readonly dependencies: {
      readonly repository: VocabularyRepository;
      readonly idGenerator: IdGenerator;
    },
  ) {}

  async execute(input: VocabularyTextInput): Promise<CreatedWord> {
    const texts = parseVocabularyTexts(input);
    const entry = VocabularyEntry.create({
      id: this.dependencies.idGenerator.generate(),
      texts,
    });
    await this.dependencies.repository.transaction(async (store) => {
      const duplicate = findDuplicateEntry(await store.listAll(), entry.key());
      if (duplicate) {
        throw new DuplicateVocabularyError(duplicate.identity());
      }
      await store.insert(entry);
    });
    return toCreatedWord(entry);
  }
}

function toCreatedWord(entry: VocabularyEntry): CreatedWord {
  return {
    id: entry.id,
    english: entry.english,
    portuguese: entry.portuguese,
    exampleSentence: entry.exampleSentence,
    active: entry.active,
  };
}
