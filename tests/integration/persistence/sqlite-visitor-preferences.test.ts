import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { LocalLearner } from "@/identity/local-learner";
import { migrate } from "@/persistence/migrate";
import {
  InvalidVisitorActivityError,
  InvalidVisitorTimeZoneError,
  SqliteVisitorPreferences,
} from "@/persistence/sqlite-visitor-preferences";
import type { SqlExecutor } from "@/persistence/sql-executor";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const VISITOR_ID = "visitor-local";
const MISSING_VISITOR_ID = "visitor-missing";
const CREATED_AT = "2026-11-12T10:00:00.000Z";
const FIRST_SEEN_AT = "2026-11-12T12:00:00.000Z";
const LATER_SEEN_AT = "2026-11-12T18:00:00.000Z";
const EARLIER_SEEN_AT = "2026-11-12T11:00:00.000Z";
const FIRST_ZONE = "America/Sao_Paulo";
const SECOND_ZONE = "Europe/Lisbon";
const REJECTED_ZONE = "Nowhere/City";
const EMPTY_ZONE = "";
const SINGLE_LEARNER_COUNT = 1;

describe("sqlite visitor preferences", () => {
  it("returns the last valid time zone after the file is closed and opened", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearner(filePath);
      await useFile(filePath, async (preferences) => {
        expect(await preferences.getTimeZone(VISITOR_ID)).toBeNull();
        await preferences.saveTimeZone(VISITOR_ID, FIRST_ZONE, new Date(FIRST_SEEN_AT));
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(FIRST_ZONE);
      });
      await useFile(filePath, async (preferences, database) => {
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(FIRST_ZONE);
        await preferences.saveTimeZone(VISITOR_ID, SECOND_ZONE, new Date(LATER_SEEN_AT));
        expect(readVisitor(database)).toEqual({
          id: VISITOR_ID,
          lastSeenAt: LATER_SEEN_AT,
          timeZone: SECOND_ZONE,
        });
      });
      await useFile(filePath, async (preferences, database) => {
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(SECOND_ZONE);
        expect(readVisitor(database)).toEqual({
          id: VISITOR_ID,
          lastSeenAt: LATER_SEEN_AT,
          timeZone: SECOND_ZONE,
        });
        expect(readLearnerCount(database)).toBe(SINGLE_LEARNER_COUNT);
      });
    });
  });

  it("does not replace a stored time zone when the new value is rejected", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearner(filePath);
      await useFile(filePath, async (preferences) => {
        await preferences.saveTimeZone(VISITOR_ID, FIRST_ZONE, new Date(FIRST_SEEN_AT));
      });
      await useFile(filePath, async (preferences, database) => {
        await expect(
          preferences.saveTimeZone(VISITOR_ID, REJECTED_ZONE, new Date(LATER_SEEN_AT)),
        ).rejects.toBeInstanceOf(InvalidVisitorTimeZoneError);
        await expect(
          preferences.saveTimeZone(VISITOR_ID, EMPTY_ZONE, new Date(LATER_SEEN_AT)),
        ).rejects.toBeInstanceOf(InvalidVisitorTimeZoneError);
        await expect(
          preferences.saveTimeZone(VISITOR_ID, FIRST_ZONE, new Date("not-a-date")),
        ).rejects.toBeInstanceOf(InvalidVisitorActivityError);
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(FIRST_ZONE);
        expect(readVisitor(database)).toEqual({
          id: VISITOR_ID,
          lastSeenAt: FIRST_SEEN_AT,
          timeZone: FIRST_ZONE,
        });
      });
      await useFile(filePath, async (preferences) => {
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(FIRST_ZONE);
      });
    });
  });

  it("keeps the later activity time when an older sighting arrives", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearner(filePath);
      await useFile(filePath, async (preferences) => {
        await preferences.saveTimeZone(VISITOR_ID, FIRST_ZONE, new Date(LATER_SEEN_AT));
        await preferences.saveTimeZone(VISITOR_ID, SECOND_ZONE, new Date(EARLIER_SEEN_AT));
      });
      await useFile(filePath, async (preferences, database) => {
        expect(await preferences.getTimeZone(VISITOR_ID)).toBe(SECOND_ZONE);
        expect(readVisitor(database)).toEqual({
          id: VISITOR_ID,
          lastSeenAt: LATER_SEEN_AT,
          timeZone: SECOND_ZONE,
        });
      });
    });
  });

  it("does not create a learner when the visitor is missing", async () => {
    await withDatabaseFile(async (filePath) => {
      await createLearner(filePath);
      await useFile(filePath, async (preferences, database) => {
        await expect(
          preferences.saveTimeZone(MISSING_VISITOR_ID, FIRST_ZONE, new Date(FIRST_SEEN_AT)),
        ).rejects.toThrow("Visitor was not stored.");
        expect(await preferences.getTimeZone(MISSING_VISITOR_ID)).toBeNull();
        expect(readLearnerCount(database)).toBe(SINGLE_LEARNER_COUNT);
        expect(readVisitor(database).timeZone).toBeNull();
      });
    });
  });
});

async function createLearner(filePath: string): Promise<void> {
  const database = new Database(filePath);
  try {
    const executor = createBetterSqliteExecutor(database);
    await migrate(executor, runBetterSqliteTransaction(database));
    const learner = new LocalLearner(executor, {
      createVisitorId: () => VISITOR_ID,
      now: () => new Date(CREATED_AT),
    });
    await learner.ensure();
  } finally {
    database.close();
  }
}

async function useFile(
  filePath: string,
  work: (preferences: SqliteVisitorPreferences, database: Database.Database) => Promise<void>,
): Promise<void> {
  const database = new Database(filePath);
  try {
    const executor: SqlExecutor = createBetterSqliteExecutor(database);
    await work(new SqliteVisitorPreferences(executor), database);
  } finally {
    database.close();
  }
}

function readVisitor(database: Database.Database): StoredVisitor {
  return database
    .prepare(
      `SELECT "id", "lastSeenAt", "timeZone"
       FROM "AnonymousVisitor"
       WHERE "id" = ?`,
    )
    .get(VISITOR_ID) as StoredVisitor;
}

function readLearnerCount(database: Database.Database): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS "total" FROM "AnonymousVisitor"`)
    .get() as CountRow;
  return row.total;
}

interface StoredVisitor {
  id: string;
  lastSeenAt: string;
  timeZone: string | null;
}

interface CountRow {
  total: number;
}
