import type { DailyReviewSummary } from "@/lib/application/review/ports/daily-review-reader";
import { localDateOf, startOfLocalDay } from "@/lib/domain/learning/local-day";

export interface HomeReviewSummaryView {
  readonly dueCount: number;
  readonly newAvailable: number;
  readonly nothingToReviewTitle: string | null;
  readonly nextReviewDetail: string | null;
}

export function formatReviewCounts(dueCount: number, newAvailable: number): string {
  const newLabel = newAvailable === 1 ? "nova" : "novas";
  return `${dueCount} para revisar · ${newAvailable} ${newLabel} hoje`;
}

export function toHomeReviewSummaryView(
  summary: DailyReviewSummary,
  now: Date,
  timeZone: string,
): HomeReviewSummaryView {
  if (summary.dueCount > 0 || summary.newAvailable > 0) {
    return {
      dueCount: summary.dueCount,
      newAvailable: summary.newAvailable,
      nothingToReviewTitle: null,
      nextReviewDetail: null,
    };
  }
  return {
    dueCount: summary.dueCount,
    newAvailable: summary.newAvailable,
    nothingToReviewTitle: "Nada para revisar hoje",
    nextReviewDetail: summary.nextReviewAt
      ? formatNextReviewDetail(summary.nextReviewAt, now, timeZone)
      : null,
  };
}

function formatNextReviewDetail(
  nextReviewAt: Date,
  now: Date,
  timeZone: string,
): string {
  const reviewDay = localDateOf(nextReviewAt, timeZone);
  const tomorrow = localDateOf(startOfLocalDay(now, timeZone, 1), timeZone);
  if (reviewDay === tomorrow) {
    return "próxima revisão amanhã";
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(nextReviewAt);
  return `próxima revisão em ${formatted}`;
}
