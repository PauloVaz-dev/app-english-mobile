import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeviceEventLog } from "@/observability/device-event-log";

describe("device event log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns about a voice failure only once, without raising an error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = createDeviceEventLog();

    log("practice.speech_failed");
    log("practice.speech_failed");
    log("challenge.speech_failed");
    log("challenge.speech_failed");

    expect(warn.mock.calls).toEqual([["practice.speech_failed"], ["challenge.speech_failed"]]);
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps every other event as an error, every time", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = createDeviceEventLog();

    log("practice.persist_failed");
    log("practice.persist_failed");

    expect(error.mock.calls).toEqual([["practice.persist_failed"], ["practice.persist_failed"]]);
    expect(warn).not.toHaveBeenCalled();
  });
});
