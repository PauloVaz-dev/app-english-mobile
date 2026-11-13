import { distance } from "fastest-levenshtein";

export const TYPING_OUTCOMES = ["CORRECT", "ALMOST", "WRONG", "DONT_KNOW"] as const;
export type TypingOutcome = (typeof TYPING_OUTCOMES)[number];

const ALMOST_EDIT_DISTANCE = 1;
const MINIMUM_ALMOST_LENGTH = 4;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const REPEATED_SPACES = /\s+/g;

export function evaluateTypedAnswer(
  expected: string,
  typed: string,
): Exclude<TypingOutcome, "DONT_KNOW"> {
  const normalizedExpected = normalizeTypedAnswer(expected);
  const normalizedTyped = normalizeTypedAnswer(typed);
  if (normalizedExpected === normalizedTyped) {
    return "CORRECT";
  }
  const editDistance = distance(normalizedExpected, normalizedTyped);
  if (
    editDistance === ALMOST_EDIT_DISTANCE &&
    normalizedExpected.length >= MINIMUM_ALMOST_LENGTH
  ) {
    return "ALMOST";
  }
  return "WRONG";
}

function normalizeTypedAnswer(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(REPEATED_SPACES, " ");
}
