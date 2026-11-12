import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import {
  applyInstalledTimeZone,
  readInstalledCalendars,
  watchInstalledForeground,
} from "@/time/installed-device-time-zone";

const VISITOR_ID = "visitor-local";
const SEEN_AT = new Date("2026-11-12T18:00:00.000Z");
const DEVICE_ZONE = "America/Sao_Paulo";
const FOREGROUND = "active";
const BACKGROUND = "background";

const localization = vi.hoisted(() => {
  return {
    timeZone: "America/Sao_Paulo" as string | null,
  };
});

const foreground = vi.hoisted(() => {
  const listeners = new Set<(nextState: string) => void>();
  return {
    addEventListener(type: string, listener: (nextState: string) => void): { remove(): void } {
      if (type !== "change") {
        throw new Error("Unexpected app activity.");
      }
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    },
    emit(nextState: string): void {
      for (const listener of listeners) {
        listener(nextState);
      }
    },
    reset(): void {
      listeners.clear();
    },
  };
});

vi.mock("expo-localization", () => {
  return {
    getCalendars: () => {
      return [{ timeZone: localization.timeZone }];
    },
  };
});

vi.mock("react-native", () => {
  return {
    AppState: {
      addEventListener: foreground.addEventListener,
    },
  };
});

describe("installed device time zone", () => {
  beforeEach(() => {
    localization.timeZone = DEVICE_ZONE;
    foreground.reset();
  });

  it("reads the first calendar time zone from the device", async () => {
    await expect(readInstalledCalendars()).resolves.toEqual([{ timeZone: DEVICE_ZONE }]);
  });

  it("stores that calendar zone for the learner", async () => {
    const preferences = new MemoryPreferences();
    const timeZone = await applyInstalledTimeZone({
      visitorId: VISITOR_ID,
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe(DEVICE_ZONE);
    expect(preferences.saved).toEqual([
      { visitorId: VISITOR_ID, timeZone: DEVICE_ZONE, seenAt: SEEN_AT },
    ]);
  });

  it("does not store a null calendar zone", async () => {
    localization.timeZone = null;
    const preferences = new MemoryPreferences();
    const timeZone = await applyInstalledTimeZone({
      visitorId: VISITOR_ID,
      preferences,
      seenAt: SEEN_AT,
    });
    expect(timeZone).toBe("America/Sao_Paulo");
    expect(preferences.saved).toEqual([]);
  });

  it("rereads when the installed app returns to the foreground", async () => {
    let reads = 0;
    const stop = await watchInstalledForeground(() => {
      reads += 1;
    });
    foreground.emit(BACKGROUND);
    expect(reads).toBe(0);
    foreground.emit(FOREGROUND);
    expect(reads).toBe(1);
    stop();
    foreground.emit(FOREGROUND);
    expect(reads).toBe(1);
  });
});

class MemoryPreferences implements VisitorPreferences {
  readonly saved: SavedTimeZone[] = [];
  private stored: string | null = null;

  async getTimeZone(): Promise<string | null> {
    return this.stored;
  }

  async saveTimeZone(visitorId: string, timeZone: string, seenAt: Date): Promise<void> {
    this.stored = timeZone;
    this.saved.push({ visitorId, timeZone, seenAt });
  }
}

interface SavedTimeZone {
  visitorId: string;
  timeZone: string;
  seenAt: Date;
}
