import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/domain/learning/local-day";

export function acceptTimeZone(requested: string | undefined): string | null {
  if (requested === undefined) return null;
  const trimmed = requested.trim();
  if (trimmed.length === 0 || !isValidTimeZone(trimmed)) return null;
  return trimmed;
}

export function reviewTimeZone(input: {
  readonly requested: string | undefined;
  readonly stored: string | null;
}): string {
  const accepted = acceptTimeZone(input.requested);
  if (accepted) return accepted;
  if (input.stored && isValidTimeZone(input.stored)) return input.stored;
  return DEFAULT_TIME_ZONE;
}

export function requestedTimeZoneIsInvalid(requested: string | undefined): boolean {
  return requested !== undefined && acceptTimeZone(requested) === null;
}
