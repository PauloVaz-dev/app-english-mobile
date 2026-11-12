export const DIFFICULTIES = ["EASY", "NORMAL", "HARD"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export interface LearningProgressSnapshot {
  readonly timesShown: number;
  readonly correctCount: number;
  readonly wrongCount: number;
  readonly totalCorrectResponseTimeMs: number;
}

export interface LearningProgressMetrics {
  readonly accuracy: number;
  readonly averageCorrectResponseTimeMs: number | null;
}

export interface ReviewCandidate {
  readonly wordId: string;
  readonly english: string;
  readonly portuguese: string;
  readonly wrongAnswers: number;
  readonly timeToCorrectMs: number | null;
  readonly difficulty: Difficulty | null;
}
