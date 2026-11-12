import { InvalidReviewCandidateError } from "./errors";
import { DIFFICULTIES, type ReviewCandidate } from "./types";

export function normalizeReviewCandidate(
  candidate: ReviewCandidate,
): ReviewCandidate {
  const wordId = requireText(candidate.wordId, "wordId");
  const english = requireText(candidate.english, "english");
  const portuguese = requireText(candidate.portuguese, "portuguese");
  const wrongAnswers = requireNonNegativeInteger(
    candidate.wrongAnswers,
    "wrongAnswers",
  );
  const timeToCorrectMs =
    candidate.timeToCorrectMs === null
      ? null
      : requireNonNegativeInteger(candidate.timeToCorrectMs, "timeToCorrectMs");
  if (
    candidate.difficulty !== null &&
    !DIFFICULTIES.includes(candidate.difficulty)
  ) {
    throw new InvalidReviewCandidateError("Invalid review difficulty.");
  }
  return Object.freeze({
    wordId,
    english,
    portuguese,
    wrongAnswers,
    timeToCorrectMs,
    difficulty: candidate.difficulty,
  });
}

export function collectDistinctCandidates(
  input: readonly ReviewCandidate[],
): readonly ReviewCandidate[] {
  const wordIds = new Set<string>();
  return input.map((candidate) => {
    const normalized = normalizeReviewCandidate(candidate);
    if (wordIds.has(normalized.wordId)) {
      throw new InvalidReviewCandidateError(
        `Duplicate review candidate: ${normalized.wordId}.`,
      );
    }
    wordIds.add(normalized.wordId);
    return normalized;
  });
}

export function compareReviewText(left: string, right: string): number {
  const normalizedLeft = left.normalize("NFKD").toLowerCase();
  const normalizedRight = right.normalize("NFKD").toLowerCase();
  if (normalizedLeft < normalizedRight) {
    return -1;
  }
  if (normalizedLeft > normalizedRight) {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidReviewCandidateError(
      `${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidReviewCandidateError(
      `${field} must be a non-negative safe integer.`,
    );
  }
  return value;
}
