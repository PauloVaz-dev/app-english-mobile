import { describe, expect, it } from "vitest";

import {
  DailyReviewCapabilityError,
  SqliteDailyReviewReader,
} from "@/persistence/sqlite-daily-review-reader";
import type { SqlExecutor } from "@/persistence/sql-executor";

const visitorId = "visitor-1";
const now = new Date("2026-11-12T15:00:00.000Z");
const timeZone = "America/Sao_Paulo";
const wordId = "word-1";

describe("SqliteDailyReviewReader unsupported methods", () => {
  it("rejects review capabilities that are not part of the summary", async () => {
    const reader = new SqliteDailyReviewReader(unusedExecutor());
    await expect(reader.loadPlanInputs(visitorId, now, timeZone)).rejects.toThrow(
      DailyReviewCapabilityError,
    );
    await expect(reader.loadPlanInputs(visitorId, now, timeZone)).rejects.toThrow(
      "Loading the review plan is not available until the daily review feature.",
    );
    await expect(reader.findActiveWords([wordId])).rejects.toThrow(
      "Loading active words is not available until the daily review feature.",
    );
    await expect(reader.listStudied(visitorId)).rejects.toThrow(DailyReviewCapabilityError);
  });
});

function unusedExecutor(): SqlExecutor {
  return {
    async exec(): Promise<void> {
      throw new Error("Summary storage was called.");
    },
    async getAll(): Promise<never[]> {
      throw new Error("Summary storage was called.");
    },
    async run(): Promise<void> {
      throw new Error("Summary storage was called.");
    },
  };
}
