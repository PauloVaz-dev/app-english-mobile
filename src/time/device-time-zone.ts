import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/domain/learning/local-day";

const FIRST_CALENDAR_INDEX = 0;
const FOREGROUND_ACTIVITY = "active";

export interface DeviceCalendar {
  readonly timeZone: string | null;
}

export type ReadDeviceCalendars = () => readonly DeviceCalendar[];

export interface DeviceTimeZoneInput {
  visitorId: string;
  readCalendars: ReadDeviceCalendars;
  preferences: VisitorPreferences;
  seenAt: Date;
}

export interface InstalledTimeZoneInput {
  visitorId: string;
  preferences: VisitorPreferences;
  seenAt: Date;
}

export interface ForegroundSubscription {
  remove(): void;
}

export interface ForegroundActivity {
  addEventListener(
    type: "change",
    listener: (nextState: string) => void,
  ): ForegroundSubscription;
}

interface DeviceTimeZoneSave {
  preferences: VisitorPreferences;
  visitorId: string;
  reported: string | null;
  stored: string | null;
  seenAt: Date;
}

export async function applyDeviceTimeZone(input: DeviceTimeZoneInput): Promise<string> {
  const reported = readReportedTimeZone(input.readCalendars());
  const stored = await input.preferences.getTimeZone(input.visitorId);
  const selected = chooseStudyTimeZone(reported, stored);
  await saveChangedDeviceTimeZone({
    preferences: input.preferences,
    visitorId: input.visitorId,
    reported,
    stored,
    seenAt: input.seenAt,
  });
  return selected;
}

export function watchForegroundTimeZone(
  source: ForegroundActivity,
  reread: () => void,
): () => void {
  const subscription = source.addEventListener("change", (nextState) => {
    if (nextState === FOREGROUND_ACTIVITY) {
      reread();
    }
  });
  return () => {
    subscription.remove();
  };
}

function readReportedTimeZone(calendars: readonly DeviceCalendar[]): string | null {
  const calendar = calendars[FIRST_CALENDAR_INDEX];
  if (calendar === undefined) {
    return null;
  }
  return calendar.timeZone;
}

function chooseStudyTimeZone(reported: string | null, stored: string | null): string {
  if (reported !== null && isValidTimeZone(reported)) {
    return reported;
  }
  if (stored !== null && isValidTimeZone(stored)) {
    return stored;
  }
  return DEFAULT_TIME_ZONE;
}

async function saveChangedDeviceTimeZone(input: DeviceTimeZoneSave): Promise<void> {
  if (input.reported === null || !isValidTimeZone(input.reported)) {
    return;
  }
  if (input.reported === input.stored) {
    return;
  }
  await input.preferences.saveTimeZone(input.visitorId, input.reported, input.seenAt);
}
