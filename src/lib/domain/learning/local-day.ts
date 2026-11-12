import { InvalidReviewScheduleError } from "./errors";

/** Used when the learner's browser does not report a time zone. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function localDateOf(instant: Date, timeZone: string): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new InvalidReviewScheduleError("Instant must be a valid date.");
  }
  const parts = localParts(instant, timeZone);
  return formatCalendarDate(parts.year, parts.month, parts.day);
}

/**
 * Returns the instant at which the local calendar day `days` after the day of
 * `instant` begins in `timeZone`. Review dates are stored as these instants so
 * that "due today" follows the learner's calendar, not the server's.
 */
export function startOfLocalDay(
  instant: Date,
  timeZone: string,
  days = 0,
): Date {
  if (!Number.isInteger(days)) {
    throw new InvalidReviewScheduleError("Day offset must be an integer.");
  }
  const { year, month, day } = localParts(instant, timeZone);
  const wallClockMidnight = Date.UTC(year, month - 1, day + days);
  let candidate = wallClockMidnight - offsetMs(wallClockMidnight, timeZone);
  const correctedOffset = offsetMs(candidate, timeZone);
  candidate = wallClockMidnight - correctedOffset;
  return new Date(candidate);
}

function formatCalendarDate(year: number, month: number, day: number): string {
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

function offsetMs(instantMs: number, timeZone: string): number {
  const parts = localParts(new Date(instantMs), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - (instantMs - (instantMs % 1_000));
}

function localParts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour % 24,
    minute: values.minute,
    second: values.second,
  };
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) {
    return cached;
  }
  if (typeof timeZone !== "string" || timeZone.length === 0) {
    throw new InvalidReviewScheduleError("Time zone must be a non-empty string.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    throw new InvalidReviewScheduleError(`Unknown time zone: ${timeZone}.`);
  }
  formatters.set(timeZone, formatter);
  return formatter;
}
