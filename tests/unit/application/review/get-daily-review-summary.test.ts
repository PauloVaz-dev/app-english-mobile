import { beforeEach, describe, expect, it } from "vitest";

import { GetDailyReviewSummary } from "@/lib/application/review/get-daily-review-summary";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { createWord, type Clock, type Word } from "@/lib/domain/game/types";
import { DAILY_NEW_WORD_LIMIT } from "@/lib/domain/learning/daily-review-plan";
import { localDateOf } from "@/lib/domain/learning/local-day";
import {
  INITIAL_EASE_FACTOR,
  REVIEW_STATE_REPETITIONS,
  type ReviewSchedule,
} from "@/lib/domain/learning/review-schedule";
import { ReviewSummaryDouble } from "../../../support/review-summary-double";

const visitorId = "visitor-1";
const otherVisitorId = "visitor-2";
const now = new Date("2026-09-28T15:00:00.000Z");
const dueAt = new Date("2026-09-28T03:00:00.000Z");
const futureAt = new Date("2026-10-02T03:00:00.000Z");
const nearMidnight = new Date("2026-09-28T02:00:00.000Z");
const tokyoZone = "Asia/Tokyo";
const invalidZone = "Nowhere/City";
const scheduleLapses = 0;
const scheduleIntervalDays = 1;

describe("GetDailyReviewSummary", () => {
  let reader: ReviewSummaryDouble;
  let preferences: MemoryPreferences;
  let clock: Clock;

  beforeEach(() => {
    reader = new ReviewSummaryDouble();
    preferences = new MemoryPreferences();
    clock = { now: () => now };
  });

  it("summarizes due words, remaining new words and the next future review", async () => {
    seedCatalog(
      reader,
      [buildWord("due-a"), buildWord("due-b"), buildWord("new-a"), buildWord("later")],
      now,
    );
    reader.addSchedule(visitorId, "due-a", buildSchedule("REVIEW", dueAt));
    reader.addSchedule(visitorId, "due-b", buildSchedule("LEARNING", dueAt));
    reader.addSchedule(visitorId, "later", buildSchedule("REVIEW", futureAt));
    const summary = await summaryUseCase().execute({ visitorId });
    expect(summary).toEqual({
      dueCount: 2,
      newAvailable: 1,
      nextReviewAt: futureAt,
    });
  });

  it("counts new words already introduced on the visitor local day", async () => {
    clock = { now: () => nearMidnight };
    const localDate = localDateOf(nearMidnight, tokyoZone);
    const catalog = Array.from({ length: DAILY_NEW_WORD_LIMIT + 1 }, (_, index) => {
      return buildWord(`new-${index + 1}`);
    });
    seedCatalog(reader, catalog, nearMidnight);
    for (const entry of catalog.slice(0, DAILY_NEW_WORD_LIMIT)) {
      reader.addIntroduced(visitorId, localDate, entry.id);
    }
    await preferences.saveTimeZone(visitorId, tokyoZone, nearMidnight);
    const tokyo = await summaryUseCase().execute({ visitorId });
    const fallback = await summaryUseCase().execute({ visitorId: otherVisitorId });
    expect(localDate).toBe("2026-09-28");
    expect(tokyo).toMatchObject({ dueCount: 0, newAvailable: 0 });
    expect(fallback.newAvailable).toBe(DAILY_NEW_WORD_LIMIT);
  });

  it("falls back to the default time zone when the stored zone is invalid", async () => {
    clock = { now: () => nearMidnight };
    const catalog = Array.from({ length: DAILY_NEW_WORD_LIMIT + 1 }, (_, index) => {
      return buildWord(`new-${index + 1}`);
    });
    seedCatalog(reader, catalog, nearMidnight);
    const tokyoDate = localDateOf(nearMidnight, tokyoZone);
    for (const entry of catalog.slice(0, DAILY_NEW_WORD_LIMIT)) {
      reader.addIntroduced(visitorId, tokyoDate, entry.id);
    }
    await preferences.saveTimeZone(visitorId, invalidZone, nearMidnight);
    const summary = await summaryUseCase().execute({ visitorId });
    expect(summary.newAvailable).toBe(DAILY_NEW_WORD_LIMIT);
  });

  function summaryUseCase(): GetDailyReviewSummary {
    return new GetDailyReviewSummary({ reader, preferences, clock });
  }
});

class MemoryPreferences implements VisitorPreferences {
  private readonly zones = new Map<string, string>();
  private readonly seenAtByVisitor = new Map<string, Date>();

  async getTimeZone(visitorIdToRead: string): Promise<string | null> {
    return this.zones.get(visitorIdToRead) ?? null;
  }

  async saveTimeZone(visitorIdToSave: string, timeZone: string, seenAt: Date): Promise<void> {
    this.zones.set(visitorIdToSave, timeZone);
    this.seenAtByVisitor.set(visitorIdToSave, seenAt);
  }
}

function buildWord(id: string, english = id, portuguese = id): Word {
  return createWord({ id, english, portuguese });
}

function seedCatalog(reader: ReviewSummaryDouble, words: readonly Word[], origin: Date): void {
  for (const [index, entry] of words.entries()) {
    reader.addWord(entry, new Date(origin.getTime() + index));
  }
}

function buildSchedule(state: ReviewSchedule["state"], nextReviewAt: Date): ReviewSchedule {
  const repetitions = state === "REVIEW" ? REVIEW_STATE_REPETITIONS : scheduleLapses;
  return {
    state,
    repetitions,
    lapses: scheduleLapses,
    intervalDays: scheduleIntervalDays,
    easeFactor: INITIAL_EASE_FACTOR,
    nextReviewAt,
  };
}
