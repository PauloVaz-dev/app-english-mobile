import type { Word } from "@/lib/domain/game/types";
import type { DueReviewWord } from "@/lib/domain/learning/daily-review-plan";
import type { ScheduledWordRef } from "@/lib/domain/learning/word-selection";

export interface DailyReviewSummary {
  readonly dueCount: number;
  readonly newAvailable: number;
  readonly nextReviewAt: Date | null;
}

export interface PlanInputs {
  readonly due: readonly DueReviewWord[];
  readonly newCandidates: readonly string[];
  readonly introducedToday: number;
}

export interface DailyReviewReader {
  summary(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewSummary>;
  loadPlanInputs(visitorId: string, now: Date, timeZone: string): Promise<PlanInputs>;
  findActiveWords(wordIds: readonly string[]): Promise<readonly Word[]>;
  listStudied(visitorId: string): Promise<readonly ScheduledWordRef[]>;
}
