import { describe, expect, it } from "vitest";

import { InvalidReviewScheduleError } from "@/lib/domain/learning/errors";
import {
  isValidTimeZone,
  localDateOf,
  startOfLocalDay,
} from "@/lib/domain/learning/local-day";

describe("startOfLocalDay", () => {
  it("returns local midnight of the same day by default", () => {
    expect(
      startOfLocalDay(new Date("2026-09-24T15:45:00.000Z"), "America/Sao_Paulo"),
    ).toEqual(new Date("2026-09-24T03:00:00.000Z"));
  });

  it("uses the learner's date when it differs from the UTC date", () => {
    const nightInSaoPaulo = new Date("2026-09-25T01:00:00.000Z");

    expect(startOfLocalDay(nightInSaoPaulo, "America/Sao_Paulo", 1)).toEqual(
      new Date("2026-09-25T03:00:00.000Z"),
    );
    expect(startOfLocalDay(nightInSaoPaulo, "UTC", 1)).toEqual(
      new Date("2026-09-26T00:00:00.000Z"),
    );
  });

  it("crosses month boundaries and time zones east of UTC", () => {
    expect(
      startOfLocalDay(new Date("2026-09-30T20:00:00.000Z"), "Asia/Tokyo", 1),
    ).toEqual(new Date("2026-10-01T15:00:00.000Z"));
  });

  it("follows daylight saving changes", () => {
    const beforeChange = new Date("2026-03-07T18:00:00.000Z");

    expect(startOfLocalDay(beforeChange, "America/New_York", 2)).toEqual(
      new Date("2026-03-09T04:00:00.000Z"),
    );
  });

  it("rejects unknown time zones and fractional offsets", () => {
    const at = new Date("2026-09-24T12:00:00.000Z");

    expect(() => startOfLocalDay(at, "Nowhere/City")).toThrow(
      InvalidReviewScheduleError,
    );
    expect(() => startOfLocalDay(at, "UTC", 1.5)).toThrow(
      InvalidReviewScheduleError,
    );
  });
});

describe("localDateOf", () => {
  it("returns the São Paulo calendar day across local midnight", () => {
    expect(localDateOf(new Date("2026-09-25T02:59:59.999Z"), "America/Sao_Paulo")).toBe(
      "2026-09-24",
    );
    expect(localDateOf(new Date("2026-09-25T03:00:00.000Z"), "America/Sao_Paulo")).toBe(
      "2026-09-25",
    );
  });

  it("returns the Tokyo calendar day across local midnight", () => {
    expect(localDateOf(new Date("2026-09-24T14:59:59.999Z"), "Asia/Tokyo")).toBe(
      "2026-09-24",
    );
    expect(localDateOf(new Date("2026-09-24T15:00:00.000Z"), "Asia/Tokyo")).toBe(
      "2026-09-25",
    );
  });

  it("pads month and day and follows the zone of the same instant", () => {
    const instant = new Date("2026-01-05T03:00:00.000Z");

    expect(localDateOf(instant, "America/Sao_Paulo")).toBe("2026-01-05");
    expect(localDateOf(new Date("2026-09-24T15:00:00.000Z"), "America/Sao_Paulo")).toBe(
      "2026-09-24",
    );
    expect(localDateOf(new Date("2026-09-24T15:00:00.000Z"), "Asia/Tokyo")).toBe(
      "2026-09-25",
    );
  });

  it("rejects an invalid instant and an unknown time zone", () => {
    expect(() => localDateOf(new Date("invalid"), "America/Sao_Paulo")).toThrow(
      InvalidReviewScheduleError,
    );
    expect(() => localDateOf(new Date("2026-09-24T12:00:00.000Z"), "Nowhere/City")).toThrow(
      InvalidReviewScheduleError,
    );
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects anything else", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Nowhere/City")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
