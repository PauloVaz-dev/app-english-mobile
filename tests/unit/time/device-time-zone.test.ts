import { describe, expect, it } from "vitest";

import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/learning/local-day";
import {
  applyDeviceTimeZone,
  watchForegroundTimeZone,
  type DeviceCalendar,
  type ForegroundActivity,
} from "@/time/device-time-zone";

const VISITOR_ID = "visitor-local";
const OTHER_VISITOR_ID = "visitor-other";
const SEEN_AT = new Date("2026-11-12T18:00:00.000Z");
const STORED_ZONE = "Europe/Lisbon";
const DEVICE_ZONE = "America/Sao_Paulo";
const REJECTED_ZONE = "Nowhere/City";
const EMPTY_ZONE = "";
const FOREGROUND = "active";
const BACKGROUND = "background";
const TRANSITION = "inactive";

describe("device time zone", () => {
  it("stores a valid device zone when it differs from the stored zone", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, STORED_ZONE);
    const timeZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(DEVICE_ZONE),
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(DEVICE_ZONE);
    expect(preferences.saved).toEqual([
      { visitorId: VISITOR_ID, timeZone: DEVICE_ZONE, seenAt: SEEN_AT },
    ]);
    expect(await preferences.getTimeZone(VISITOR_ID)).toBe(DEVICE_ZONE);
    expect(await preferences.getTimeZone(OTHER_VISITOR_ID)).toBeNull();
  });

  it("does not write when the valid device zone is already stored", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, DEVICE_ZONE);
    const timeZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(DEVICE_ZONE),
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(DEVICE_ZONE);
    expect(preferences.saved).toEqual([]);
  });

  it("keeps the stored zone when the device zone is null", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, STORED_ZONE);
    const timeZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(null),
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(STORED_ZONE);
    expect(preferences.saved).toEqual([]);
    expect(await preferences.getTimeZone(VISITOR_ID)).toBe(STORED_ZONE);
  });

  it("keeps the stored zone when the device reports no calendar", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, STORED_ZONE);
    const timeZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => [],
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(STORED_ZONE);
    expect(preferences.saved).toEqual([]);
  });

  it("keeps the stored zone when the device zone is rejected", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, STORED_ZONE);
    const rejected = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(REJECTED_ZONE),
      preferences,
      seenAt: SEEN_AT,
    });
    const empty = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(EMPTY_ZONE),
      preferences,
      seenAt: SEEN_AT,
    });
    expect(rejected).toBe(STORED_ZONE);
    expect(empty).toBe(STORED_ZONE);
    expect(preferences.saved).toEqual([]);
    expect(await preferences.getTimeZone(VISITOR_ID)).toBe(STORED_ZONE);
  });

  it("uses America/Sao_Paulo when nothing valid is stored", async () => {
    const missing = new MemoryPreferences(VISITOR_ID, null);
    const invalidStored = new MemoryPreferences(VISITOR_ID, REJECTED_ZONE);
    const missingZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(null),
      preferences: missing,
      seenAt: SEEN_AT,
    });
    const invalidDevice = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(REJECTED_ZONE),
      preferences: missing,
      seenAt: SEEN_AT,
    });
    const invalidStoredZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(null),
      preferences: invalidStored,
      seenAt: SEEN_AT,
    });
    expect(missingZone).toBe(DEFAULT_TIME_ZONE);
    expect(invalidDevice).toBe(DEFAULT_TIME_ZONE);
    expect(invalidStoredZone).toBe(DEFAULT_TIME_ZONE);
    expect(missing.saved).toEqual([]);
    expect(invalidStored.saved).toEqual([]);
    expect(await invalidStored.getTimeZone(VISITOR_ID)).toBe(REJECTED_ZONE);
  });

  it("replaces an invalid stored zone with a valid device zone", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, REJECTED_ZONE);
    const timeZone = await applyDeviceTimeZone({
      visitorId: VISITOR_ID,
      readCalendars: () => reportedCalendars(DEVICE_ZONE),
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(DEVICE_ZONE);
    expect(await preferences.getTimeZone(VISITOR_ID)).toBe(DEVICE_ZONE);
  });

  it("rereads only when the app returns to the foreground", () => {
    const activity = new FakeActivity();
    let reads = 0;
    const stop = watchForegroundTimeZone(activity, () => {
      reads += 1;
    });
    activity.emit(BACKGROUND);
    activity.emit(TRANSITION);
    expect(reads).toBe(0);
    activity.emit(FOREGROUND);
    expect(reads).toBe(1);
    stop();
    activity.emit(FOREGROUND);
    expect(reads).toBe(1);
  });

  it("stores the device zone again when the app returns to the foreground", async () => {
    const preferences = new MemoryPreferences(VISITOR_ID, DEVICE_ZONE);
    const activity = new FakeActivity();
    let calendars = reportedCalendars(DEVICE_ZONE);
    let finished = Promise.resolve();
    watchForegroundTimeZone(activity, () => {
      finished = applyDeviceTimeZone({
        visitorId: VISITOR_ID,
        readCalendars: () => calendars,
        preferences,
        seenAt: SEEN_AT,
      }).then(() => undefined);
    });
    activity.emit(BACKGROUND);
    await finished;
    expect(preferences.saved).toEqual([]);
    calendars = reportedCalendars(STORED_ZONE);
    activity.emit(FOREGROUND);
    await finished;
    expect(preferences.saved).toEqual([
      { visitorId: VISITOR_ID, timeZone: STORED_ZONE, seenAt: SEEN_AT },
    ]);
    expect(await preferences.getTimeZone(VISITOR_ID)).toBe(STORED_ZONE);
  });
});

function reportedCalendars(timeZone: string | null): readonly DeviceCalendar[] {
  return [{ timeZone }];
}

class MemoryPreferences implements VisitorPreferences {
  readonly saved: SavedTimeZone[] = [];
  private readonly zones = new Map<string, string>();

  constructor(visitorId: string, timeZone: string | null) {
    if (timeZone !== null) {
      this.zones.set(visitorId, timeZone);
    }
  }

  async getTimeZone(visitorId: string): Promise<string | null> {
    return this.zones.get(visitorId) ?? null;
  }

  async saveTimeZone(visitorId: string, timeZone: string, seenAt: Date): Promise<void> {
    this.zones.set(visitorId, timeZone);
    this.saved.push({ visitorId, timeZone, seenAt });
  }
}

class FakeActivity implements ForegroundActivity {
  private listener: ((nextState: string) => void) | undefined;

  addEventListener(
    type: "change",
    listener: (nextState: string) => void,
  ): { remove(): void } {
    if (type !== "change") {
      throw new Error("Unexpected app activity.");
    }
    this.listener = listener;
    return {
      remove: () => {
        this.listener = undefined;
      },
    };
  }

  emit(nextState: string): void {
    this.listener?.(nextState);
  }
}

interface SavedTimeZone {
  visitorId: string;
  timeZone: string;
  seenAt: Date;
}
