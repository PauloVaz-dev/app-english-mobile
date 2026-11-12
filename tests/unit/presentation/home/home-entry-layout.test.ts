import { describe, expect, it } from "vitest";

import { formatReviewCounts, type HomeReviewSummaryView } from "@/lib/presentation/review/home-review-copy";
import { homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";

const PENDING_SUMMARY: HomeReviewSummaryView = {
  dueCount: 20,
  newAvailable: 10,
  nothingToReviewTitle: null,
  nextReviewDetail: null,
};

const EMPTY_SUMMARY: HomeReviewSummaryView = {
  dueCount: 0,
  newAvailable: 0,
  nothingToReviewTitle: "Nada para revisar hoje",
  nextReviewDetail: "próxima revisão amanhã",
};

describe("home entry layout", () => {
  it("describes the opening blocks and puts the real count inside the card", () => {
    const layout = homeEntryLayout(PENDING_SUMMARY);

    expect(layout.badge).toBe("Vocabulário que fica");
    expect(layout.titleLead).toBe("Treine palavras.");
    expect(layout.titleEmphasis).toBe("Lembre de verdade.");
    expect(layout.intro).toContain("Sem cadastro");
    expect(layout.cardLabel).toBe("Revisão de hoje");
    expect(layout.cardSummary).toBe(formatReviewCounts(20, 10));
    expect(layout.cardDetail).toBeNull();
    expect(layout.actions.map((action) => action.label)).toEqual([
      "Revisar hoje",
      "Treino livre",
      "Desafio",
      "Palavras",
    ]);
    expect(layout.actions[0]?.emphasis).toBe("primary");
    expect(layout.actions.slice(1).every((action) => action.emphasis === "secondary")).toBe(true);
  });

  it("puts the empty state inside the card", () => {
    const layout = homeEntryLayout(EMPTY_SUMMARY);

    expect(layout.cardSummary).toBe("Nada para revisar hoje");
    expect(layout.cardDetail).toBe("próxima revisão amanhã");
  });
});
