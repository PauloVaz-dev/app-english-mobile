const SPEECH_FAILED_SUFFIX = ".speech_failed";

export type DeviceEventLog = (event: string) => void;

/**
 * Logs the activity events on the device console. A missing voice engine is
 * an expected degradation (the round goes on), so `*.speech_failed` is a
 * warning shown once per event name: it must not cover the board with an
 * error overlay at every hit. Every other event stays an error.
 */
export function createDeviceEventLog(): DeviceEventLog {
  const warned = new Set<string>();
  return (event) => {
    if (!event.endsWith(SPEECH_FAILED_SUFFIX)) {
      console.error(event);
      return;
    }
    if (warned.has(event)) {
      return;
    }
    warned.add(event);
    console.warn(event);
  };
}

export const logDeviceEvent: DeviceEventLog = createDeviceEventLog();
