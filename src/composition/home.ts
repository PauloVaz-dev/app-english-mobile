import { prepareHomeStudy } from "@/composition/prepare-home-study";
import type { VisitorIdFactory } from "@/identity/local-learner";
import { GetDailyReviewSummary } from "@/lib/application/review/get-daily-review-summary";
import type {
  DailyReviewReader,
  DailyReviewSummary,
} from "@/lib/application/review/ports/daily-review-reader";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import type { Clock } from "@/lib/domain/game/types";
import {
  toHomeReviewSummaryView,
  type HomeReviewSummaryView,
} from "@/lib/presentation/review/home-review-copy";
import {
  HOME_SUMMARY_FAILED,
  failHomeOpen,
  type HomeEventRecorder,
} from "@/observability/home-open-log";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import { applyDeviceTimeZone, type ReadDeviceCalendars } from "@/time/device-time-zone";

export interface HomeComposition {
  load(now?: Date): Promise<HomeReviewSummaryView>;
}

export interface HomeCompositionDependencies {
  executor: SqlExecutor;
  runInTransaction: RunInTransaction;
  createVisitorId: VisitorIdFactory;
  readCalendars: ReadDeviceCalendars;
  reader: DailyReviewReader;
  preferences: VisitorPreferences;
  clock: Clock;
  recordEvent: HomeEventRecorder;
}

export interface StartHomeEntryInput {
  reload: () => void;
  watchForeground: (reload: () => void) => Promise<() => void>;
}

interface StoredLearner {
  dependencies: HomeCompositionDependencies;
  visitorId: string;
  instant: Date;
}

interface ReadHomeReviewInput extends StoredLearner {
  timeZone: string;
}

export function createHomeComposition(dependencies: HomeCompositionDependencies): HomeComposition {
  return {
    load(now?: Date) {
      return loadHomeReview(dependencies, now);
    },
  };
}

export function startHomeEntry(input: StartHomeEntryInput): Promise<() => void> {
  input.reload();
  return input.watchForeground(input.reload);
}

async function loadHomeReview(
  dependencies: HomeCompositionDependencies,
  now: Date | undefined,
): Promise<HomeReviewSummaryView> {
  const instant = resolveStudyInstant(dependencies.clock, now);
  const visitorId = await prepareHomeStudy({
    executor: dependencies.executor,
    runInTransaction: dependencies.runInTransaction,
    createVisitorId: dependencies.createVisitorId,
    instant,
    recordEvent: dependencies.recordEvent,
  });
  const timeZone = await rememberDeviceTimeZone({ dependencies, visitorId, instant });
  return readHomeReviewView({ dependencies, visitorId, instant, timeZone });
}

function resolveStudyInstant(clock: Clock, now: Date | undefined): Date {
  if (now === undefined) {
    return clock.now();
  }
  return now;
}

async function rememberDeviceTimeZone(input: StoredLearner): Promise<string> {
  try {
    return await applyDeviceTimeZone({
      visitorId: input.visitorId,
      readCalendars: input.dependencies.readCalendars,
      preferences: input.dependencies.preferences,
      seenAt: input.instant,
    });
  } catch (cause) {
    throw failHomeOpen({
      event: HOME_SUMMARY_FAILED,
      cause,
      recordEvent: input.dependencies.recordEvent,
    });
  }
}

async function readHomeReviewView(input: ReadHomeReviewInput): Promise<HomeReviewSummaryView> {
  try {
    const summary = await readDailySummary(input);
    return toHomeReviewSummaryView(summary, input.instant, input.timeZone);
  } catch (cause) {
    throw failHomeOpen({
      event: HOME_SUMMARY_FAILED,
      cause,
      recordEvent: input.dependencies.recordEvent,
    });
  }
}

function readDailySummary(input: ReadHomeReviewInput): Promise<DailyReviewSummary> {
  const useCase = new GetDailyReviewSummary({
    reader: input.dependencies.reader,
    preferences: input.dependencies.preferences,
    clock: {
      now: () => input.instant,
    },
  });
  return useCase.execute({ visitorId: input.visitorId });
}
