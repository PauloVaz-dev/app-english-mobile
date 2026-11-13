import type { SQLiteDatabase } from "expo-sqlite";
import { describe, expect, it, vi } from "vitest";

import { createInstalledHomeEntry } from "@/composition/installed-home";

vi.mock("expo-sqlite", () => {
  return {
    openDatabaseAsync: vi.fn(),
  };
});

vi.mock("expo-crypto", () => {
  return {
    randomUUID: () => "visitor-home",
  };
});

vi.mock("expo-localization", () => {
  return {
    getCalendars: () => [{ timeZone: null }],
  };
});

vi.mock("react-native", () => {
  return {
    AppState: {
      addEventListener: () => ({ remove: () => undefined }),
    },
  };
});

const VISITOR_ID = "visitor-home";
const STORED_SCHEMA_VERSION = 1;
const SINGLE_TRANSACTION = 1;

describe("installed home entry", () => {
  it("opens twice without nesting the seed transaction", async () => {
    const database = new TransactionProbe();
    const entry = createInstalledHomeEntry({
      openDatabase: () => Promise.resolve(database.asConnection()),
      readCalendars: () => Promise.resolve([{ timeZone: null }]),
      watchForeground: () => Promise.resolve(() => undefined),
      createVisitorId: () => VISITOR_ID,
      clock: { now: () => new Date("2026-11-13T12:00:00.000Z") },
      recordEvent: () => undefined,
    });
    const first = entry.load();
    const second = entry.load();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(database.deepest).toBe(SINGLE_TRANSACTION);
  });
});

class TransactionProbe {
  deepest = 0;
  private depth = 0;

  asConnection(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }

  async execAsync(): Promise<void> {
    return undefined;
  }

  async getAllAsync<Row>(statement: string): Promise<Row[]> {
    if (statement.includes("user_version")) {
      return [{ user_version: STORED_SCHEMA_VERSION }] as Row[];
    }
    if (statement.includes('AS "visitorId"')) {
      return [{ visitorId: VISITOR_ID }] as Row[];
    }
    return [];
  }

  async runAsync(): Promise<void> {
    return undefined;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.depth += 1;
    this.deepest = Math.max(this.deepest, this.depth);
    if (this.depth > SINGLE_TRANSACTION) {
      this.depth -= 1;
      throw new Error("cannot start a transaction within a transaction");
    }
    await Promise.resolve();
    try {
      await task();
    } finally {
      this.depth -= 1;
    }
  }
}
