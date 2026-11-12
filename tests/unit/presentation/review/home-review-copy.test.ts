import { describe, expect, it } from "vitest";

import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/lib/domain/learning/local-day";
import {
  formatReviewCounts,
  toHomeReviewSummaryView,
} from "@/lib/presentation/review/home-review-copy";
import type { DailyReviewSummary } from "@/lib/application/review/ports/daily-review-reader";

const NOW = new Date("2026-09-28T15:00:00.000Z");

describe("home review copy", () => {
  it("formats due and new counters with the product wording", () => {
    expect(formatReviewCounts(12, 10)).toBe("12 para revisar · 10 novas hoje");
    expect(formatReviewCounts(0, 1)).toBe("0 para revisar · 1 nova hoje");
    expect(formatReviewCounts(1, 0)).toBe("1 para revisar · 0 novas hoje");
  });

  it("keeps counters when there is anything to review", () => {
    const summary: DailyReviewSummary = {
      dueCount: 2,
      newAvailable: 1,
      nextReviewAt: new Date("2026-10-02T03:00:00.000Z"),
    };

    expect(toHomeReviewSummaryView(summary, NOW, DEFAULT_TIME_ZONE)).toEqual({
      dueCount: 2,
      newAvailable: 1,
      nothingToReviewTitle: null,
      nextReviewDetail: null,
    });
  });

  it("says there is nothing to review and names tomorrow in the visitor time zone", () => {
    const summary: DailyReviewSummary = {
      dueCount: 0,
      newAvailable: 0,
      nextReviewAt: startOfLocalDay(NOW, DEFAULT_TIME_ZONE, 1),
    };

    expect(toHomeReviewSummaryView(summary, NOW, DEFAULT_TIME_ZONE)).toEqual({
      dueCount: 0,
      newAvailable: 0,
      nothingToReviewTitle: "Nada para revisar hoje",
      nextReviewDetail: "próxima revisão amanhã",
    });
  });

  it("formats a later review date in the stored time zone", () => {
    const summary: DailyReviewSummary = {
      dueCount: 0,
      newAvailable: 0,
      nextReviewAt: new Date("2026-10-02T02:00:00.000Z"),
    };

    expect(
      toHomeReviewSummaryView(summary, NOW, DEFAULT_TIME_ZONE).nextReviewDetail,
    ).toBe("próxima revisão em 1 de outubro");
    expect(
      toHomeReviewSummaryView(summary, NOW, "Asia/Tokyo").nextReviewDetail,
    ).toBe("próxima revisão em 2 de outubro");
  });

  it("omits the next date when none is scheduled", () => {
    const summary: DailyReviewSummary = {
      dueCount: 0,
      newAvailable: 0,
      nextReviewAt: null,
    };

    expect(toHomeReviewSummaryView(summary, NOW, DEFAULT_TIME_ZONE)).toEqual({
      dueCount: 0,
      newAvailable: 0,
      nothingToReviewTitle: "Nada para revisar hoje",
      nextReviewDetail: null,
    });
  });
});
