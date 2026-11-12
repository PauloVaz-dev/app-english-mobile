import { randomUUID } from "expo-crypto";

import {
  createPracticeComposition,
  createPracticeScreenPort,
  type PracticeEvent,
  type PreparedPractice,
  recordPracticeSpeechFailure,
} from "@/composition/practice";
import { prepareHomeStudy } from "@/composition/prepare-home-study";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import type { PracticeScreenPort } from "@/lib/presentation/game/practice-screen";
import { recordHomeOpenFailure } from "@/observability/home-open-log";
import {
  connectEnglishDatabase,
  createEnglishDatabaseSession,
} from "@/persistence/open-english-database";
import { SqliteGameSessionRepository } from "@/persistence/sqlite-game-session-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { createDeviceSpeech } from "@/speech/device-speech";
import { logDeviceEvent } from "@/observability/device-event-log";

const deviceClock: Clock = {
  now: () => new Date(),
};

const deviceRandom: RandomSource = {
  next: () => Math.random(),
};

/**
 * Opens the practice once per route: the same composition keeps its queue
 * and pronunciation map for the whole match. A failed opening is retried on
 * the next call.
 */
export function createInstalledPractice(): () => Promise<PreparedPractice> {
  let pending: Promise<PreparedPractice> | null = null;
  return () => {
    if (pending === null) {
      pending = prepareInstalledPractice().catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    }
    return pending;
  };
}

/** The practice screen's port on the device, one composition per route. */
export function createInstalledPracticePort(): PracticeScreenPort {
  return createPracticeScreenPort({ prepare: createInstalledPractice() });
}

/** Attempt ids for the board, generated on the tap that forms the pair. */
export function createPracticeAttemptId(): string {
  return randomUUID();
}

/** The board shuffles the cards with the device random source. */
export const practiceBoardRandom: RandomSource = deviceRandom;

async function prepareInstalledPractice(): Promise<PreparedPractice> {
  const database = await connectEnglishDatabase();
  const session = createEnglishDatabaseSession(database);
  const visitorId = await prepareHomeStudy({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: () => randomUUID(),
    instant: deviceClock.now(),
    recordEvent: recordHomeOpenFailure,
  });
  const composition = createPracticeComposition({
    catalog: new SqliteWordCatalog(session.executor, deviceRandom, deviceClock),
    repository: new SqliteGameSessionRepository(
      session.executor,
      session.runInTransaction,
      deviceClock,
    ),
    clock: deviceClock,
    createId: () => randomUUID(),
    recordEvent: recordPracticeEvent,
    speech: createDeviceSpeech(recordPracticeSpeechFailure(recordPracticeEvent)),
  });
  return { composition, visitorId };
}

function recordPracticeEvent(event: PracticeEvent): void {
  logDeviceEvent(event);
}
