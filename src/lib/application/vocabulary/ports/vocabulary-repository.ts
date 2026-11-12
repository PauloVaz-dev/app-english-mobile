import type { VocabularyEntry } from "@/lib/domain/vocabulary";

export interface VocabularyStore {
  listAll(): Promise<readonly VocabularyEntry[]>;
  insert(entry: VocabularyEntry): Promise<void>;
}

export interface VocabularyRepository {
  transaction<T>(work: (store: VocabularyStore) => Promise<T>): Promise<T>;
}
