import { existsSync } from "node:fs";

import Database from "better-sqlite3";
import { deleteDatabaseAsync, openDatabaseAsync } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { migrate, NewerSchemaError, SUPPORTED_SCHEMA_VERSION } from "@/persistence/migrate";
import { openEnglishDatabase } from "@/persistence/open-english-database";
import { vocabularySeed } from "../../../prisma/seed-data";
import { traceBetterSqliteMigration } from "../../support/better-sqlite-executor";
import { REQUIRED_TABLE_COUNT } from "../../support/expected-sqlite-schema";
import { withDatabaseFile } from "../../support/temporary-database";

const OPEN_TRANSACTION_COUNT = 2;
const SINGLE_LEARNER_COUNT = 1;
const INITIAL_WORD_COUNT = 32;

const cryptoDouble = vi.hoisted(() => {
  return {
    visitorId: "11111111-1111-4111-8111-111111111111",
  };
});

vi.mock("expo-sqlite", () => {
  return {
    openDatabaseAsync: vi.fn(),
    deleteDatabaseAsync: vi.fn(),
  };
});

vi.mock("expo-crypto", () => {
  return {
    randomUUID: () => cryptoDouble.visitorId,
  };
});

describe("newer schema version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails without deleting the database file", async () => {
    const storedVersion = SUPPORTED_SCHEMA_VERSION + 1;
    await withDatabaseFile(async (filePath) => {
      const prepared = new Database(filePath);
      prepared.exec(`CREATE TABLE "Preserved" ("note" TEXT NOT NULL)`);
      prepared.prepare(`INSERT INTO "Preserved" ("note") VALUES (?)`).run("keep");
      prepared.exec(`PRAGMA user_version = ${storedVersion}`);
      prepared.close();
      const database = new Database(filePath);
      try {
        const trace = traceBetterSqliteMigration(database);
        await expect(migrate(trace.executor, trace.runInTransaction)).rejects.toBeInstanceOf(
          NewerSchemaError,
        );
        expect(trace.events.some((event) => event.startsWith("transaction:"))).toBe(false);
        expect(trace.events.some((event) => event.includes("CREATE TABLE"))).toBe(false);
      } finally {
        database.close();
      }
      expect(existsSync(filePath)).toBe(true);
      const checked = new Database(filePath);
      try {
        expect(readUserVersion(checked)).toBe(storedVersion);
        expect(checked.prepare(`SELECT "note" FROM "Preserved"`).get()).toEqual({ note: "keep" });
        expect(
          checked.prepare(`SELECT name FROM sqlite_master WHERE name = 'Word'`).get(),
        ).toBeUndefined();
      } finally {
        checked.close();
      }
    });
  });

  it("applies version 1 when expo-sqlite opens a new file", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      const connection = createFakeConnection(database);
      const transaction = vi.spyOn(connection, "withTransactionAsync");
      vi.mocked(openDatabaseAsync).mockResolvedValue(connection as never);
      try {
        await openEnglishDatabase();
        expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
        expect(openDatabaseAsync).toHaveBeenCalledWith("english.db");
        expect(transaction).toHaveBeenCalledTimes(OPEN_TRANSACTION_COUNT);
        expect(readUserVersion(database)).toBe(SUPPORTED_SCHEMA_VERSION);
        const tables = database
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
          )
          .all();
        expect(tables).toHaveLength(REQUIRED_TABLE_COUNT);
        expect(deleteDatabaseAsync).not.toHaveBeenCalled();
      } finally {
        database.close();
      }
    });
  });

  it("stores the expo-crypto learner and the initial vocabulary", async () => {
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      vi.mocked(openDatabaseAsync).mockResolvedValue(createFakeConnection(database) as never);
      try {
        await openEnglishDatabase();
        const visitors = database
          .prepare(`SELECT "id" FROM "AnonymousVisitor"`)
          .all() as VisitorIdRow[];
        const words = database.prepare(`SELECT COUNT(*) AS "total" FROM "Word"`).get() as CountRow;
        expect(vocabularySeed).toHaveLength(INITIAL_WORD_COUNT);
        expect(visitors).toEqual([{ id: cryptoDouble.visitorId }]);
        expect(visitors).toHaveLength(SINGLE_LEARNER_COUNT);
        expect(words.total).toBe(INITIAL_WORD_COUNT);
        expect(deleteDatabaseAsync).not.toHaveBeenCalled();
      } finally {
        database.close();
      }
    });
  });

  it("opens english.db through expo-sqlite and keeps a newer file", async () => {
    const storedVersion = SUPPORTED_SCHEMA_VERSION + 1;
    await withDatabaseFile(async (filePath) => {
      const database = new Database(filePath);
      database.exec(`CREATE TABLE "Preserved" ("note" TEXT NOT NULL)`);
      database.prepare(`INSERT INTO "Preserved" ("note") VALUES (?)`).run("keep");
      database.exec(`PRAGMA user_version = ${storedVersion}`);
      vi.mocked(openDatabaseAsync).mockResolvedValue(createFakeConnection(database) as never);
      try {
        await expect(openEnglishDatabase()).rejects.toBeInstanceOf(NewerSchemaError);
        expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
        expect(openDatabaseAsync).toHaveBeenCalledWith("english.db");
        expect(deleteDatabaseAsync).not.toHaveBeenCalled();
      } finally {
        database.close();
      }
      expect(existsSync(filePath)).toBe(true);
      const checked = new Database(filePath);
      try {
        expect(readUserVersion(checked)).toBe(storedVersion);
        expect(checked.prepare(`SELECT "note" FROM "Preserved"`).get()).toEqual({ note: "keep" });
      } finally {
        checked.close();
      }
    });
  });
});

function createFakeConnection(database: Database.Database) {
  return {
    async execAsync(statement: string): Promise<void> {
      database.exec(statement);
    },
    async getAllAsync<Row>(statement: string, params?: readonly unknown[]): Promise<Row[]> {
      const prepared = database.prepare(statement);
      if (params === undefined) {
        return prepared.all() as Row[];
      }
      return prepared.all(...params) as Row[];
    },
    async runAsync(statement: string, params?: readonly unknown[]): Promise<void> {
      const prepared = database.prepare(statement);
      if (params === undefined) {
        prepared.run();
        return;
      }
      prepared.run(...params);
    },
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      database.exec("BEGIN");
      try {
        await task();
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function readUserVersion(database: Database.Database): number {
  const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

interface VisitorIdRow {
  id: string;
}

interface CountRow {
  total: number;
}
