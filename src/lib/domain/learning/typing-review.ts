import {
  capReviewGrade,
  gradeAttempt,
  type ReviewGrade,
} from "./review-schedule";
import type { TypingOutcome } from "./typing-answer";

export interface TypingGradeInput {
  readonly outcome: TypingOutcome;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
}

export function gradeTypingAnswer(input: TypingGradeInput): ReviewGrade {
  switch (input.outcome) {
    case "WRONG":
    case "DONT_KNOW":
      return "AGAIN";
    case "ALMOST":
      return "HARD";
    case "CORRECT":
      return gradeCorrectTypingAnswer(input);
  }
}

function gradeCorrectTypingAnswer(input: TypingGradeInput): ReviewGrade {
  const timedGrade = gradeAttempt({
    promptWordId: "typed-answer",
    isCorrect: true,
    responseTimeMs: input.responseTimeMs,
  });
  if (input.usedHint) {
    return capReviewGrade(timedGrade, "HARD");
  }
  return timedGrade;
}
