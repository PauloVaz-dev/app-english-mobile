import type { Difficulty } from "@/lib/domain/learning/types";

export interface ReviewWordView {
  readonly wordId: string;
  readonly english: string;
  readonly portuguese: string;
  readonly wrongAnswers: number;
  readonly timeToCorrectMs: number | null;
  readonly difficulty: Difficulty | null;
}

export interface SessionResultLists {
  readonly reviewWords: readonly ReviewWordView[];
  readonly praiseWords: readonly ReviewWordView[];
}

export const EMPTY_SESSION_RESULT_LISTS: SessionResultLists = Object.freeze({
  reviewWords: [],
  praiseWords: [],
});
