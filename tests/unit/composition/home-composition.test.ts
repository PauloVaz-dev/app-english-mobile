import { describe, expect, it } from "vitest";

import type {
  DailyReviewReader,
  DailyReviewSummary,
} from "@/lib/application/review/ports/daily-review-reader";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import { toHomeReviewSummaryView } from "@/lib/presentation/review/home-review-copy";
import {
  createHomeComposition,
  startHomeEntry,
  type HomeComposition,
} from "@/composition/home";
import {
  HOME_MIGRATION_FAILED,
  HOME_SEED_FAILED,
  HOME_SUMMARY_FAILED,
  HomeOpenError,
  recordHomeOpenFailure,
  type HomeOpenFailure,
} from "@/observability/home-open-log";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import type { RunInTransaction, SqlExecutor, SqlValue } from "@/persistence/sql-executor";

const VISITOR_ID = "visitor-home";
const STUDY_INSTANT = new Date("2026-09-28T15:00:00.000Z");
const LATER_REVIEW = new Date("2026-10-02T02:00:00.000Z");
const TOKYO_TIME_ZONE = "Asia/Tokyo";
const NEWER_SCHEMA_VERSION = 2;
const CURRENT_SCHEMA_VERSION = 1;

describe("home composition", () => {
  it("turns a pending summary from a fake reader into the existing view", async () => {
    const summary: DailyReviewSummary = {
      dueCount: 4,
      newAvailable: 3,
      nextReviewAt: LATER_REVIEW,
    };
    const reader = new FixedReviewReader(summary);
    const events: HomeOpenFailure[] = [];
    const store = new ScriptedStudyStore();
    const composition = createStudyComposition(store, reader, events, [{ timeZone: null }]);
    const view = await composition.load(STUDY_INSTANT);
    expect(view).toEqual(toHomeReviewSummaryView(summary, STUDY_INSTANT, DEFAULT_TIME_ZONE));
    expect(reader.calls).toEqual([
      { visitorId: VISITOR_ID, now: STUDY_INSTANT, timeZone: DEFAULT_TIME_ZONE },
    ]);
    expect(events).toEqual([]);
    const again = await composition.load(STUDY_INSTANT);
    const fromClock = await composition.load();
    expect(again).toEqual(view);
    expect(fromClock).toEqual(view);
    expect(reader.calls[1]?.visitorId).toBe(VISITOR_ID);
    expect(reader.calls[2]?.now).toEqual(STUDY_INSTANT);
    expect(store.visitor?.visitorId).toBe(VISITOR_ID);
  });

  it("turns an empty summary into the existing nothing-to-review view", async () => {
    const summary: DailyReviewSummary = {
      dueCount: 0,
      newAvailable: 0,
      nextReviewAt: LATER_REVIEW,
    };
    const reader = new FixedReviewReader(summary);
    const events: HomeOpenFailure[] = [];
    const store = new ScriptedStudyStore();
    const composition = createStudyComposition(store, reader, events, [{ timeZone: TOKYO_TIME_ZONE }]);
    const view = await composition.load(STUDY_INSTANT);
    expect(view).toEqual(toHomeReviewSummaryView(summary, STUDY_INSTANT, TOKYO_TIME_ZONE));
    expect(view.nothingToReviewTitle).toBe("Nada para revisar hoje");
    expect(reader.calls[0]?.timeZone).toBe(TOKYO_TIME_ZONE);
    expect(store.visitor?.timeZone).toBe(TOKYO_TIME_ZONE);
    expect(events).toEqual([]);
  });

  it("records a migration failure and retries without losing the learner", async () => {
    const summary: DailyReviewSummary = {
      dueCount: 1,
      newAvailable: 0,
      nextReviewAt: null,
    };
    const reader = new FixedReviewReader(summary);
    const events: HomeOpenFailure[] = [];
    const store = new ScriptedStudyStore();
    store.schemaVersion = NEWER_SCHEMA_VERSION;
    const composition = createStudyComposition(store, reader, events, [{ timeZone: null }]);
    await expect(composition.load(STUDY_INSTANT)).rejects.toBeInstanceOf(HomeOpenError);
    expect(events).toEqual([HOME_MIGRATION_FAILED]);
    expect(reader.calls).toEqual([]);
    expect(store.wordInserts).toBe(0);
    store.schemaVersion = CURRENT_SCHEMA_VERSION;
    const view = await composition.load(STUDY_INSTANT);
    expect(view).toEqual(toHomeReviewSummaryView(summary, STUDY_INSTANT, DEFAULT_TIME_ZONE));
    expect(events).toEqual([HOME_MIGRATION_FAILED]);
    expect(store.visitor?.visitorId).toBe(VISITOR_ID);
  });

  it("records a seed failure and succeeds on the next load", async () => {
    const summary: DailyReviewSummary = {
      dueCount: 0,
      newAvailable: 2,
      nextReviewAt: null,
    };
    const reader = new FixedReviewReader(summary);
    const events: HomeOpenFailure[] = [];
    const store = new ScriptedStudyStore();
    store.failWordInsert = true;
    const composition = createStudyComposition(store, reader, events, [{ timeZone: null }]);
    await expect(composition.load(STUDY_INSTANT)).rejects.toMatchObject({ event: HOME_SEED_FAILED });
    expect(events).toEqual([HOME_SEED_FAILED]);
    expect(reader.calls).toEqual([]);
    expect(store.visitor).toBeNull();
    store.failWordInsert = false;
    const view = await composition.load(STUDY_INSTANT);
    expect(view).toEqual(toHomeReviewSummaryView(summary, STUDY_INSTANT, DEFAULT_TIME_ZONE));
    expect(events).toEqual([HOME_SEED_FAILED]);
  });

  it("records a summary failure and retries the same summary", async () => {
    const summary: DailyReviewSummary = {
      dueCount: 2,
      newAvailable: 1,
      nextReviewAt: null,
    };
    const reader = new FixedReviewReader(summary);
    reader.fail = true;
    const events: HomeOpenFailure[] = [];
    const store = new ScriptedStudyStore();
    const composition = createStudyComposition(store, reader, events, [{ timeZone: null }]);
    await expect(composition.load(STUDY_INSTANT)).rejects.toMatchObject({ event: HOME_SUMMARY_FAILED });
    expect(events).toEqual([HOME_SUMMARY_FAILED]);
    expect(store.visitor?.visitorId).toBe(VISITOR_ID);
    reader.fail = false;
    const view = await composition.load(STUDY_INSTANT);
    expect(view).toEqual(toHomeReviewSummaryView(summary, STUDY_INSTANT, DEFAULT_TIME_ZONE));
    expect(reader.calls).toHaveLength(2);
    expect(events).toEqual([HOME_SUMMARY_FAILED]);
  });

  it("reloads when the entry opens and when it returns to the foreground", async () => {
    const reloads: string[] = [];
    let reread: (() => void) | undefined;
    const stop = await startHomeEntry({
      reload: () => {
        reloads.push("load");
      },
      watchForeground: async (reload) => {
        reread = reload;
        return () => {
          reread = undefined;
        };
      },
    });
    expect(reloads).toEqual(["load"]);
    reread?.();
    expect(reloads).toEqual(["load", "load"]);
    stop();
    reread?.();
    expect(reloads).toEqual(["load", "load"]);
  });

  it("writes one local line for a home failure and nothing on success", () => {
    const lines: unknown[][] = [];
    const write = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args);
    };
    recordHomeOpenFailure(HOME_SUMMARY_FAILED);
    console.error = write;
    expect(lines).toEqual([[HOME_SUMMARY_FAILED]]);
  });
});

function createStudyComposition(
  store: ScriptedStudyStore,
  reader: DailyReviewReader,
  events: HomeOpenFailure[],
  calendars: readonly { timeZone: string | null }[],
): HomeComposition {
  const executor = createScriptedExecutor(store);
  const preferences = new SqliteVisitorPreferences(executor);
  return createHomeComposition({
    executor,
    runInTransaction: scriptedTransaction(store),
    createVisitorId: () => VISITOR_ID,
    readCalendars: () => calendars,
    reader,
    preferences,
    clock: { now: () => STUDY_INSTANT },
    recordEvent: (event) => {
      events.push(event);
    },
  });
}

class FixedReviewReader implements DailyReviewReader {
  readonly calls: Array<{ visitorId: string; now: Date; timeZone: string }> = [];
  fail = false;
  private readonly storedSummary: DailyReviewSummary;

  constructor(storedSummary: DailyReviewSummary) {
    this.storedSummary = storedSummary;
  }

  async summary(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewSummary> {
    this.calls.push({ visitorId, now, timeZone });
    if (this.fail) {
      throw new Error("summary failed");
    }
    return this.storedSummary;
  }

  async loadPlanInputs(): Promise<never> {
    throw new Error("Review plan loading is not available.");
  }

  async findActiveWords(): Promise<never> {
    throw new Error("Active word loading is not available.");
  }

  async listStudied(): Promise<never> {
    throw new Error("Studied word listing is not available.");
  }
}

class ScriptedStudyStore {
  schemaVersion = 0;
  visitor: StoredVisitor | null = null;
  wordInserts = 0;
  failWordInsert = false;

  capture(): StudySnapshot {
    return {
      schemaVersion: this.schemaVersion,
      visitor: this.visitor === null ? null : { ...this.visitor },
      wordInserts: this.wordInserts,
    };
  }

  restore(snapshot: StudySnapshot): void {
    this.schemaVersion = snapshot.schemaVersion;
    this.visitor = snapshot.visitor;
    this.wordInserts = snapshot.wordInserts;
  }
}

function createScriptedExecutor(store: ScriptedStudyStore): SqlExecutor {
  return {
    async exec(statement: string): Promise<void> {
      if (statement.includes("user_version =")) {
        store.schemaVersion = CURRENT_SCHEMA_VERSION;
      }
    },
    async getAll<Row>(statement: string): Promise<Row[]> {
      return readScriptedRows(store, statement) as Row[];
    },
    async run(statement: string, params?: readonly SqlValue[]): Promise<void> {
      writeScriptedRow(store, statement, params);
    },
  };
}

function scriptedTransaction(store: ScriptedStudyStore): RunInTransaction {
  return async (work) => {
    const snapshot = store.capture();
    try {
      await work();
    } catch (error) {
      store.restore(snapshot);
      throw error;
    }
  };
}

function readScriptedRows(store: ScriptedStudyStore, statement: string): object[] {
  if (statement.includes("user_version")) {
    return [{ user_version: store.schemaVersion }];
  }
  if (store.visitor === null) {
    return [];
  }
  if (statement.includes("timeZone")) {
    return [{ timeZone: store.visitor.timeZone }];
  }
  if (statement.includes("lastSeenAt")) {
    return [{ lastSeenAt: store.visitor.lastSeenAt }];
  }
  if (statement.includes("AnonymousVisitor")) {
    return [{ visitorId: store.visitor.visitorId }];
  }
  return [];
}

function writeScriptedRow(
  store: ScriptedStudyStore,
  statement: string,
  params: readonly SqlValue[] | undefined,
): void {
  if (statement.includes("\"Word\"")) {
    if (store.failWordInsert) {
      throw new Error("seed failed");
    }
    store.wordInserts += 1;
    return;
  }
  if (statement.includes("INSERT") && statement.includes("AnonymousVisitor")) {
    store.visitor = {
      visitorId: String(params?.[0]),
      timeZone: null,
      lastSeenAt: String(params?.[2]),
    };
    return;
  }
  if (statement.includes("UPDATE") && store.visitor !== null) {
    store.visitor = {
      visitorId: store.visitor.visitorId,
      timeZone: String(params?.[0]),
      lastSeenAt: String(params?.[1]),
    };
  }
}

interface StoredVisitor {
  visitorId: string;
  timeZone: string | null;
  lastSeenAt: string;
}

interface StudySnapshot {
  schemaVersion: number;
  visitor: StoredVisitor | null;
  wordInserts: number;
}
