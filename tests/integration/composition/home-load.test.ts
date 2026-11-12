import { existsSync } from "node:fs";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createHomeComposition } from "@/composition/home";
import { DAILY_NEW_WORD_LIMIT } from "@/lib/domain/learning/daily-review-plan";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import { homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";
import {
  formatReviewCounts,
  toHomeReviewSummaryView,
  type HomeReviewSummaryView,
} from "@/lib/presentation/review/home-review-copy";
import {
  HOME_MIGRATION_FAILED,
  type HomeOpenFailure,
} from "@/observability/home-open-log";
import { SUPPORTED_SCHEMA_VERSION } from "@/persistence/migrate";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import { vocabularySeed } from "../../../prisma/seed-data";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-summary";
const STUDY_INSTANT = new Date("2026-11-12T15:00:00.000Z");
const SINGLE_LEARNER = 1;

describe("home composition load", () => {
  it("returns the same task summary and learner on two openings", async () => {
    await withDatabaseFile(async (filePath) => {
      const events: HomeOpenFailure[] = [];
      const first = await openHome(filePath, events);
      const second = await openHome(filePath, events);
      const expected = toHomeReviewSummaryView(
        {
          dueCount: 0,
          newAvailable: DAILY_NEW_WORD_LIMIT,
          nextReviewAt: null,
        },
        STUDY_INSTANT,
        DEFAULT_TIME_ZONE,
      );
      expect(first.view).toEqual(expected);
      expect(second.view).toEqual(first.view);
      expect(first.visitorIds).toEqual([VISITOR_ID]);
      expect(second.visitorIds).toEqual(first.visitorIds);
      expect(first.visitorIds).toHaveLength(SINGLE_LEARNER);
      expect(first.wordCount).toBe(vocabularySeed.length);
      expect(second.wordCount).toBe(first.wordCount);
      expect(first.timeZone).toBeNull();
      expect(events).toEqual([]);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  it("places the stored summary inside the entry card", async () => {
    await withDatabaseFile(async (filePath) => {
      const opened = await openHome(filePath, []);
      const layout = homeEntryLayout(opened.view);
      expect(layout.cardSummary).toBe(
        formatReviewCounts(opened.view.dueCount, opened.view.newAvailable),
      );
      expect(layout.cardSummary).not.toBe("20 para revisar · 10 novas hoje");
      expect(layout.cardLabel).toBe("Revisão de hoje");
    });
  });

  it("keeps the database after a failed opening and loads again", async () => {
    await withDatabaseFile(async (filePath) => {
      const events: HomeOpenFailure[] = [];
      const first = await openHome(filePath, events);
      const database = new Database(filePath);
      database.exec(`PRAGMA user_version = ${SUPPORTED_SCHEMA_VERSION + 1}`);
      database.close();
      await expect(openHome(filePath, events)).rejects.toMatchObject({
        event: HOME_MIGRATION_FAILED,
      });
      expect(events).toEqual([HOME_MIGRATION_FAILED]);
      expect(existsSync(filePath)).toBe(true);
      const preserved = new Database(filePath);
      try {
        expect(readVisitorIds(preserved)).toEqual(first.visitorIds);
        expect(readWordCount(preserved)).toBe(first.wordCount);
        preserved.exec(`PRAGMA user_version = ${SUPPORTED_SCHEMA_VERSION}`);
      } finally {
        preserved.close();
      }
      const restored = await openHome(filePath, events);
      expect(restored.view).toEqual(first.view);
      expect(restored.visitorIds).toEqual(first.visitorIds);
      expect(restored.wordCount).toBe(first.wordCount);
      expect(events).toEqual([HOME_MIGRATION_FAILED]);
    });
  });
});

async function openHome(filePath: string, events: HomeOpenFailure[]): Promise<OpenedHome> {
  const database = new Database(filePath);
  try {
    const executor = createBetterSqliteExecutor(database);
    const composition = createHomeComposition({
      executor,
      runInTransaction: runBetterSqliteTransaction(database),
      createVisitorId: () => VISITOR_ID,
      readCalendars: () => [{ timeZone: null }],
      reader: new SqliteDailyReviewReader(executor),
      preferences: new SqliteVisitorPreferences(executor),
      clock: { now: () => STUDY_INSTANT },
      recordEvent: (event) => {
        events.push(event);
      },
    });
    const view = await composition.load(STUDY_INSTANT);
    return {
      view,
      visitorIds: readVisitorIds(database),
      wordCount: readWordCount(database),
      timeZone: readTimeZone(database),
    };
  } finally {
    database.close();
  }
}

function readVisitorIds(database: Database.Database): string[] {
  const rows = database.prepare(`SELECT "id" AS "visitorId" FROM "AnonymousVisitor"`).all() as VisitorRow[];
  return rows.map((row) => row.visitorId);
}

function readWordCount(database: Database.Database): number {
  const row = database.prepare(`SELECT COUNT(*) AS "total" FROM "Word"`).get() as CountRow;
  return Number(row.total);
}

function readTimeZone(database: Database.Database): string | null {
  const row = database.prepare(`SELECT "timeZone" AS "timeZone" FROM "AnonymousVisitor"`).get() as TimeZoneRow;
  return row.timeZone;
}

interface OpenedHome {
  view: HomeReviewSummaryView;
  visitorIds: string[];
  wordCount: number;
  timeZone: string | null;
}

interface VisitorRow {
  visitorId: string;
}

interface CountRow {
  total: number;
}

interface TimeZoneRow {
  timeZone: string | null;
}
