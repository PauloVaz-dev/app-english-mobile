import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { LocalLearner } from "@/identity/local-learner";
import { migrate } from "@/persistence/migrate";
import type { SqlExecutor } from "@/persistence/sql-executor";
import {
  createBetterSqliteExecutor,
  runBetterSqliteTransaction,
} from "../../support/better-sqlite-executor";
import { withDatabaseFile } from "../../support/temporary-database";

const FIRST_INSTANT = "2026-11-12T15:00:00.000Z";
const OLDER_INSTANT = "2026-11-12T08:00:00.000Z";
const NEWER_INSTANT = "2026-11-12T18:00:00.000Z";
const FIRST_VISITOR_ID = "visitor-first";
const SECOND_VISITOR_ID = "visitor-second";
const OLDER_VISITOR_ID = "visitor-older";
const NEWER_VISITOR_ID = "visitor-newer";

describe("local learner", () => {
  it("returns the same id on the second ensure", async () => {
    await withMigratedDatabase(async (database, executor) => {
      const visitorIds = [FIRST_VISITOR_ID, SECOND_VISITOR_ID];
      let position = 0;
      const learner = new LocalLearner(executor, {
        createVisitorId: () => {
          const visitorId = visitorIds[position];
          position += 1;
          if (visitorId === undefined) {
            throw new Error("Visitor id sequence is exhausted.");
          }
          return visitorId;
        },
        now: () => new Date(FIRST_INSTANT),
      });
      const firstIdentity = await learner.ensure();
      const secondIdentity = await learner.ensure();
      expect(firstIdentity).toEqual({ visitorId: FIRST_VISITOR_ID });
      expect(secondIdentity).toEqual({ visitorId: FIRST_VISITOR_ID });
      expect(position).toBe(1);
      expect(readVisitors(database)).toEqual([
        {
          id: FIRST_VISITOR_ID,
          createdAt: FIRST_INSTANT,
          lastSeenAt: FIRST_INSTANT,
          timeZone: null,
        },
      ]);
    });
  });

  it("returns the oldest visitor and does not insert another", async () => {
    await withMigratedDatabase(async (database, executor) => {
      await insertVisitor(executor, NEWER_VISITOR_ID, NEWER_INSTANT);
      await insertVisitor(executor, OLDER_VISITOR_ID, OLDER_INSTANT);
      const learner = new LocalLearner(executor, {
        createVisitorId: () => {
          throw new Error("Visitor id must not be created when a learner already exists.");
        },
        now: () => new Date(FIRST_INSTANT),
      });
      const identity = await learner.ensure();
      expect(identity).toEqual({ visitorId: OLDER_VISITOR_ID });
      expect(readVisitors(database)).toEqual([
        {
          id: NEWER_VISITOR_ID,
          createdAt: NEWER_INSTANT,
          lastSeenAt: NEWER_INSTANT,
          timeZone: null,
        },
        {
          id: OLDER_VISITOR_ID,
          createdAt: OLDER_INSTANT,
          lastSeenAt: OLDER_INSTANT,
          timeZone: null,
        },
      ]);
    });
  });
});

async function withMigratedDatabase(
  verify: (database: Database.Database, executor: SqlExecutor) => Promise<void>,
): Promise<void> {
  await withDatabaseFile(async (filePath) => {
    const database = new Database(filePath);
    try {
      const executor = createBetterSqliteExecutor(database);
      await migrate(executor, runBetterSqliteTransaction(database));
      await verify(database, executor);
    } finally {
      database.close();
    }
  });
}

function readVisitors(database: Database.Database): StoredVisitor[] {
  return database
    .prepare(
      `SELECT "id", "createdAt", "lastSeenAt", "timeZone"
       FROM "AnonymousVisitor"
       ORDER BY "id" ASC`,
    )
    .all() as StoredVisitor[];
}

async function insertVisitor(executor: SqlExecutor, visitorId: string, instant: string): Promise<void> {
  await executor.run(
    `INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt") VALUES (?, ?, ?)`,
    [visitorId, instant, instant],
  );
}

interface StoredVisitor {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  timeZone: string | null;
}
