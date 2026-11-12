import type {
  VocabularyRepository,
  VocabularyStore,
} from "@/lib/application/vocabulary/ports/vocabulary-repository";
import type { Clock } from "@/lib/domain/game/types";
import { DuplicateVocabularyError, VocabularyEntry } from "@/lib/domain/vocabulary";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import { normalizeVocabularyText } from "../../prisma/seed-data";

const ACTIVE_WORD = 1;

const SELECT_ALL_WORDS = `
SELECT "id", "english", "portuguese", "exampleSentence", "active"
FROM "Word"
`;

const SELECT_WORD_BY_NORMALIZED_TEXT = `
SELECT "id", "english", "portuguese", "exampleSentence", "active"
FROM "Word"
WHERE "englishNormalized" = ? AND "portugueseNormalized" = ?
`;

const INSERT_WORD = `
INSERT INTO "Word" (
  "id", "english", "portuguese", "englishNormalized", "portugueseNormalized",
  "exampleSentence", "active", "createdAt", "updatedAt"
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

interface WordRow {
  id: string;
  english: string;
  portuguese: string;
  exampleSentence: string | null;
  active: number;
}

export class TransactionWithoutResultError extends Error {
  constructor() {
    super("The vocabulary transaction finished without a result.");
    this.name = "TransactionWithoutResultError";
  }
}

/**
 * Writes the catalog over the foundation's executor. The duplicate check
 * reads the whole catalog, inactive words included, inside the transaction.
 */
export class SqliteVocabularyRepository implements VocabularyRepository {
  private readonly executor: SqlExecutor;
  private readonly runInTransaction: RunInTransaction;
  private readonly clock: Clock;

  constructor(executor: SqlExecutor, runInTransaction: RunInTransaction, clock: Clock) {
    this.executor = executor;
    this.runInTransaction = runInTransaction;
    this.clock = clock;
  }

  async transaction<T>(work: (store: VocabularyStore) => Promise<T>): Promise<T> {
    let outcome: { readonly value: T } | undefined;
    await this.runInTransaction(async () => {
      outcome = { value: await work(this.createStore()) };
    });
    if (outcome === undefined) {
      throw new TransactionWithoutResultError();
    }
    return outcome.value;
  }

  private createStore(): VocabularyStore {
    return {
      listAll: async () => {
        const rows = await this.executor.getAll<WordRow>(SELECT_ALL_WORDS);
        return rows.map(toEntry);
      },
      insert: (entry) => this.insert(entry),
    };
  }

  private async insert(entry: VocabularyEntry): Promise<void> {
    const englishNormalized = normalizeVocabularyText(entry.english);
    const portugueseNormalized = normalizeVocabularyText(entry.portuguese);
    const storedAt = this.clock.now().toISOString();
    try {
      await this.executor.run(INSERT_WORD, [
        entry.id,
        entry.english,
        entry.portuguese,
        englishNormalized,
        portugueseNormalized,
        entry.exampleSentence,
        ACTIVE_WORD,
        storedAt,
        storedAt,
      ]);
    } catch (error) {
      const existing = await this.findByNormalizedText(englishNormalized, portugueseNormalized);
      if (existing !== null && existing.id !== entry.id) {
        throw new DuplicateVocabularyError(existing.identity());
      }
      throw error;
    }
  }

  /** A unique index violation is read back so the duplicate names the stored word. */
  private async findByNormalizedText(
    englishNormalized: string,
    portugueseNormalized: string,
  ): Promise<VocabularyEntry | null> {
    const rows = await this.executor.getAll<WordRow>(SELECT_WORD_BY_NORMALIZED_TEXT, [
      englishNormalized,
      portugueseNormalized,
    ]);
    const row = rows[0];
    return row === undefined ? null : toEntry(row);
  }
}

function toEntry(row: WordRow): VocabularyEntry {
  return VocabularyEntry.restore({
    id: row.id,
    active: Number(row.active) === ACTIVE_WORD,
    texts: {
      english: row.english,
      portuguese: row.portuguese,
      exampleSentence: row.exampleSentence,
    },
  });
}
