import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { isValidTimeZone } from "@/lib/domain/learning/local-day";
import type { SqlExecutor } from "@/persistence/sql-executor";

const SELECT_TIME_ZONE = `
SELECT "timeZone" AS "timeZone"
FROM "AnonymousVisitor"
WHERE "id" = ?
`;

const SELECT_LAST_SEEN = `
SELECT "lastSeenAt" AS "lastSeenAt"
FROM "AnonymousVisitor"
WHERE "id" = ?
`;

const UPDATE_TIME_ZONE = `
UPDATE "AnonymousVisitor"
SET "timeZone" = ?, "lastSeenAt" = ?
WHERE "id" = ?
`;

export class InvalidVisitorTimeZoneError extends Error {
  readonly name = "InvalidVisitorTimeZoneError";

  constructor() {
    super("Time zone must be a valid IANA name.");
  }
}

export class InvalidVisitorActivityError extends Error {
  readonly name = "InvalidVisitorActivityError";

  constructor() {
    super("Visitor activity time must be a valid date.");
  }
}

interface TimeZoneRow {
  timeZone: string | null;
}

interface LastSeenRow {
  lastSeenAt: string;
}

interface TimeZoneWrite {
  visitorId: string;
  timeZone: string;
  lastSeenAt: string;
}

export class SqliteVisitorPreferences implements VisitorPreferences {
  private readonly executor: SqlExecutor;

  constructor(executor: SqlExecutor) {
    this.executor = executor;
  }

  async getTimeZone(visitorId: string): Promise<string | null> {
    const rows = await this.executor.getAll<TimeZoneRow>(SELECT_TIME_ZONE, [visitorId]);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    return row.timeZone;
  }

  async saveTimeZone(visitorId: string, timeZone: string, seenAt: Date): Promise<void> {
    assertValidTimeZone(timeZone);
    assertSeenAt(seenAt);
    const storedSeenAt = await readLastSeenAt(this.executor, visitorId);
    if (storedSeenAt === undefined) {
      throw new Error("Visitor was not stored.");
    }
    const lastSeenAt = chooseLaterActivity(storedSeenAt, seenAt);
    await writeTimeZone(this.executor, { visitorId, timeZone, lastSeenAt });
  }
}

function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new InvalidVisitorTimeZoneError();
  }
}

function assertSeenAt(seenAt: Date): void {
  if (!(seenAt instanceof Date) || Number.isNaN(seenAt.getTime())) {
    throw new InvalidVisitorActivityError();
  }
}

async function readLastSeenAt(
  executor: SqlExecutor,
  visitorId: string,
): Promise<string | undefined> {
  const rows = await executor.getAll<LastSeenRow>(SELECT_LAST_SEEN, [visitorId]);
  return rows[0]?.lastSeenAt;
}

async function writeTimeZone(executor: SqlExecutor, write: TimeZoneWrite): Promise<void> {
  await executor.run(UPDATE_TIME_ZONE, [write.timeZone, write.lastSeenAt, write.visitorId]);
}

function chooseLaterActivity(stored: string, seenAt: Date): string {
  const storedAt = new Date(stored);
  if (storedAt.getTime() > seenAt.getTime()) {
    return stored;
  }
  return seenAt.toISOString();
}
