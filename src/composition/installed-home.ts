import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import { createHomeComposition, startHomeEntry, type HomeComposition } from "@/composition/home";
import type { VisitorIdFactory } from "@/identity/local-learner";
import type { Clock } from "@/lib/domain/game/types";
import type { HomeReviewSummaryView } from "@/lib/presentation/review/home-review-copy";
import {
  HOME_MIGRATION_FAILED,
  failHomeOpen,
  recordHomeOpenFailure,
  type HomeEventRecorder,
} from "@/observability/home-open-log";
import {
  connectEnglishDatabase,
  createEnglishDatabaseSession,
} from "@/persistence/open-english-database";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import type { DeviceCalendar } from "@/time/device-time-zone";
import { readInstalledCalendars, watchInstalledForeground } from "@/time/installed-device-time-zone";

const MISSING_CALENDAR: readonly DeviceCalendar[] = [{ timeZone: null }];

export interface InstalledHomeResources {
  openDatabase: () => Promise<SQLiteDatabase>;
  readCalendars: () => Promise<readonly DeviceCalendar[]>;
  watchForeground: (reload: () => void) => Promise<() => void>;
  createVisitorId: VisitorIdFactory;
  clock: Clock;
  recordEvent: HomeEventRecorder;
}

export interface HomeEntry extends HomeComposition {
  listen(reload: () => void): Promise<() => void>;
}

export function createInstalledHomeEntry(
  resources: InstalledHomeResources = defaultInstalledHomeResources(),
): HomeEntry {
  const openDatabase = rememberDatabase(resources.openDatabase);
  return {
    load(now?: Date) {
      return loadInstalledHome(resources, openDatabase, now);
    },
    listen(reload: () => void) {
      return startHomeEntry({
        reload,
        watchForeground: resources.watchForeground,
      });
    },
  };
}

function defaultInstalledHomeResources(): InstalledHomeResources {
  return {
    openDatabase: connectEnglishDatabase,
    readCalendars: readInstalledCalendars,
    watchForeground: watchInstalledForeground,
    createVisitorId: () => Crypto.randomUUID(),
    clock: {
      now: () => new Date(),
    },
    recordEvent: recordHomeOpenFailure,
  };
}

function rememberDatabase(openDatabase: () => Promise<SQLiteDatabase>): () => Promise<SQLiteDatabase> {
  let pending: Promise<SQLiteDatabase> | null = null;
  return () => {
    if (pending === null) {
      pending = openDatabase().catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    }
    return pending;
  };
}

async function loadInstalledHome(
  resources: InstalledHomeResources,
  openDatabase: () => Promise<SQLiteDatabase>,
  now: Date | undefined,
): Promise<HomeReviewSummaryView> {
  const database = await openStoredDatabase(resources, openDatabase);
  const calendars = await readCalendarsOrFallback(resources.readCalendars);
  const session = createEnglishDatabaseSession(database);
  const composition = createHomeComposition({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: resources.createVisitorId,
    readCalendars: () => calendars,
    reader: new SqliteDailyReviewReader(session.executor),
    preferences: new SqliteVisitorPreferences(session.executor),
    clock: resources.clock,
    recordEvent: resources.recordEvent,
  });
  return composition.load(now);
}

async function openStoredDatabase(
  resources: InstalledHomeResources,
  openDatabase: () => Promise<SQLiteDatabase>,
): Promise<SQLiteDatabase> {
  try {
    return await openDatabase();
  } catch (cause) {
    throw failHomeOpen({
      event: HOME_MIGRATION_FAILED,
      cause,
      recordEvent: resources.recordEvent,
    });
  }
}

async function readCalendarsOrFallback(
  readCalendars: () => Promise<readonly DeviceCalendar[]>,
): Promise<readonly DeviceCalendar[]> {
  try {
    return await readCalendars();
  } catch {
    return MISSING_CALENDAR;
  }
}
