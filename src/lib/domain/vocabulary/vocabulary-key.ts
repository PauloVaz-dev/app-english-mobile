const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;
const KEY_SEPARATOR = "\u0000";

export function vocabularyKey(english: string, portuguese: string): string {
  return `${foldVocabularyText(english)}${KEY_SEPARATOR}${foldVocabularyText(portuguese)}`;
}

function foldVocabularyText(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase().replace(WHITESPACE, "");
}
