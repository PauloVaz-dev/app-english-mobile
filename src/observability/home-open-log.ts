export const HOME_MIGRATION_FAILED = "home.migration_failed";
export const HOME_SEED_FAILED = "home.seed_failed";
export const HOME_SUMMARY_FAILED = "home.summary_failed";

const HOME_OPEN_FAILURE = "Home opening failed.";

export type HomeOpenFailure =
  typeof HOME_MIGRATION_FAILED | typeof HOME_SEED_FAILED | typeof HOME_SUMMARY_FAILED;

export type HomeEventRecorder = (event: HomeOpenFailure) => void;

export class HomeOpenError extends Error {
  readonly name = "HomeOpenError";
  readonly event: HomeOpenFailure;

  constructor(event: HomeOpenFailure, cause: unknown) {
    super(HOME_OPEN_FAILURE);
    this.event = event;
    this.cause = cause;
  }
}

interface FailHomeOpenInput {
  event: HomeOpenFailure;
  cause: unknown;
  recordEvent: HomeEventRecorder;
}

export function failHomeOpen(input: FailHomeOpenInput): never {
  input.recordEvent(input.event);
  throw new HomeOpenError(input.event, input.cause);
}

export function recordHomeOpenFailure(event: HomeOpenFailure): void {
  console.error(event);
}
