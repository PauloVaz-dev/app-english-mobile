import type { SqlExecutor } from "@/persistence/sql-executor";
import {
  normalizeVocabularyText,
  vocabularySeed,
  type VocabularySeedEntry,
} from "../../prisma/seed-data";

const INSERT_WORD_STATEMENT = `
INSERT INTO "Word" (
  "id",
  "english",
  "portuguese",
  "englishNormalized",
  "portugueseNormalized",
  "exampleSentence",
  "createdAt",
  "updatedAt"
)
SELECT ?, ?, ?, ?, ?, ?, ?, ?
WHERE NOT EXISTS (
  SELECT 1
  FROM "Word"
  WHERE "englishNormalized" = ? AND "portugueseNormalized" = ?
)
AND NOT EXISTS (
  SELECT 1
  FROM "Word"
  WHERE "id" = ?
)
`;

export async function seedVocabulary(executor: SqlExecutor, now: () => Date): Promise<void> {
  const storedAt = now().toISOString();
  for (const entry of vocabularySeed) {
    await insertWordWhenMissing(executor, entry, storedAt);
  }
}

async function insertWordWhenMissing(
  executor: SqlExecutor,
  entry: VocabularySeedEntry,
  storedAt: string,
): Promise<void> {
  const englishNormalized = normalizeVocabularyText(entry.english);
  const portugueseNormalized = normalizeVocabularyText(entry.portuguese);
  await executor.run(INSERT_WORD_STATEMENT, [
    entry.id,
    entry.english,
    entry.portuguese,
    englishNormalized,
    portugueseNormalized,
    entry.exampleSentence,
    storedAt,
    storedAt,
    englishNormalized,
    portugueseNormalized,
    entry.id,
  ]);
}
