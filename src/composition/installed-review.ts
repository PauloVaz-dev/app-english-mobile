import { randomUUID } from "expo-crypto";

import {
  createReviewComposition,
  createReviewScreenPort,
  recordReviewSpeechFailure,
  type ReviewComposition,
  type ReviewEvent,
} from "@/composition/review";
import { prepareHomeStudy } from "@/composition/prepare-home-study";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import type { ReviewScreenPort } from "@/lib/presentation/review/review-screen";
import { logDeviceEvent } from "@/observability/device-event-log";
import { recordHomeOpenFailure } from "@/observability/home-open-log";
import {
  connectEnglishDatabase,
  createEnglishDatabaseSession,
} from "@/persistence/open-english-database";
import { SqliteDailyReviewReader } from "@/persistence/sqlite-daily-review-reader";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteReviewSessionRepository } from "@/persistence/sqlite-review-session-repository";
import { SqliteVisitorPreferences } from "@/persistence/sqlite-visitor-preferences";
import { createDeviceSpeech } from "@/speech/device-speech";
import { applyInstalledTimeZone } from "@/time/installed-device-time-zone";

const deviceClock: Clock = {
  now: () => new Date(),
};

export interface PreparedReview {
  readonly composition: ReviewComposition;
  readonly visitorId: string;
}

/**
 * Opens the review once per route: the same composition keeps its queue
 * and pronunciation map for the whole session. A failed opening is retried
 * on the next call.
 */
export function createInstalledReview(): () => Promise<PreparedReview> {
  let pending: Promise<PreparedReview> | null = null;
  return () => {
    if (pending === null) {
      pending = prepareInstalledReview().catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    }
    return pending;
  };
}

async function prepareInstalledReview(): Promise<PreparedReview> {
  const database = await connectEnglishDatabase();
  const session = createEnglishDatabaseSession(database);
  const visitorId = await prepareHomeStudy({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: () => randomUUID(),
    instant: deviceClock.now(),
    recordEvent: recordHomeOpenFailure,
  });
  const preferences = new SqliteVisitorPreferences(session.executor);
  const composition = createReviewComposition({
    repository: new SqliteReviewSessionRepository(
      session.executor,
      session.runInTransaction,
      deviceClock,
    ),
    reader: new SqliteDailyReviewReader(session.executor),
    preferences,
    board: new SqliteGameSessionRepository(session.executor, session.runInTransaction, deviceClock),
    clock: deviceClock,
    createId: () => randomUUID(),
    resolveTimeZone: (visitorId) =>
      applyInstalledTimeZone({
        visitorId,
        preferences,
        seenAt: deviceClock.now(),
      }),
    recordEvent: recordReviewEvent,
    speech: createDeviceSpeech(recordReviewSpeechFailure(recordReviewEvent)),
  });
  return { composition, visitorId };
}

function recordReviewEvent(event: ReviewEvent): void {
  logDeviceEvent(event);
}

export function createInstalledReviewPort(): ReviewScreenPort {
  return createReviewScreenPort({ prepare: createInstalledReview() });
}

export function createReviewAttemptId(): string {
  return randomUUID();
}

export const reviewBoardRandom: RandomSource = {
  next: () => Math.random(),
};
