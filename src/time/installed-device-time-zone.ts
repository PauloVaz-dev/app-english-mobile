import { getCalendars } from "expo-localization";
import { AppState } from "react-native";

import {
  applyDeviceTimeZone,
  watchForegroundTimeZone,
  type DeviceCalendar,
  type InstalledTimeZoneInput,
} from "@/time/device-time-zone";

const FIRST_CALENDAR_INDEX = 0;

export async function applyInstalledTimeZone(input: InstalledTimeZoneInput): Promise<string> {
  const calendars = await readInstalledCalendars();
  return applyDeviceTimeZone({
    visitorId: input.visitorId,
    readCalendars: () => calendars,
    preferences: input.preferences,
    seenAt: input.seenAt,
  });
}

export async function readInstalledCalendars(): Promise<readonly DeviceCalendar[]> {
  const calendar = getCalendars()[FIRST_CALENDAR_INDEX];
  return [{ timeZone: calendar.timeZone }];
}

export async function watchInstalledForeground(reread: () => void): Promise<() => void> {
  return watchForegroundTimeZone(
    {
      addEventListener(type, listener) {
        const subscription = AppState.addEventListener(type, (nextState) => {
          listener(nextState);
        });
        return {
          remove() {
            subscription.remove();
          },
        };
      },
    },
    reread,
  );
}
