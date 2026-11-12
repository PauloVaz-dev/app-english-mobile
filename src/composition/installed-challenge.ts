import { randomUUID } from "expo-crypto";

import {
  createChallengeComposition,
  createChallengeScreenPort,
  type ChallengeEvent,
  type PreparedChallenge,
} from "@/composition/challenge";
import { prepareHomeStudy } from "@/composition/prepare-home-study";
import type { Clock, RandomSource } from "@/lib/domain/game/types";
import type { ChallengeScreenPort } from "@/lib/presentation/challenge/challenge-screen";
import { recordHomeOpenFailure } from "@/observability/home-open-log";
import {
  connectEnglishDatabase,
  createEnglishDatabaseSession,
} from "@/persistence/open-english-database";
import { SqliteChallengeRepository } from "@/persistence/sqlite-challenge-repository";
import { SqliteWordCatalog } from "@/persistence/sqlite-word-catalog";
import { createDeviceSpeech } from "@/speech/device-speech";
import { logDeviceEvent } from "@/observability/device-event-log";

const deviceClock: Clock = {
  now: () => new Date(),
};

const deviceRandom: RandomSource = {
  next: () => Math.random(),
};

export function createInstalledChallengePort(): ChallengeScreenPort {
  return createChallengeScreenPort({ prepare: rememberPreparation(prepareInstalledChallenge) });
}

/** Attempt ids for the board, generated on the tap that forms the pair. */
export function createChallengeAttemptId(): string {
  return randomUUID();
}

/** The board shuffles the cards with the device random source. */
export const challengeBoardRandom: RandomSource = deviceRandom;

async function prepareInstalledChallenge(): Promise<PreparedChallenge> {
  const database = await connectEnglishDatabase();
  const session = createEnglishDatabaseSession(database);
  const visitorId = await prepareHomeStudy({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: () => randomUUID(),
    instant: deviceClock.now(),
    recordEvent: recordHomeOpenFailure,
  });
  const composition = createChallengeComposition({
    catalog: new SqliteWordCatalog(session.executor, deviceRandom, deviceClock),
    repository: new SqliteChallengeRepository(session.executor, session.runInTransaction),
    clock: deviceClock,
    createId: () => randomUUID(),
    recordEvent: recordChallengeEvent,
    speech: createDeviceSpeech(),
  });
  return { composition, visitorId };
}

function rememberPreparation(
  prepare: () => Promise<PreparedChallenge>,
): () => Promise<PreparedChallenge> {
  let pending: Promise<PreparedChallenge> | null = null;
  return () => {
    if (pending === null) {
      pending = prepare().catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    }
    return pending;
  };
}

function recordChallengeEvent(event: ChallengeEvent): void {
  logDeviceEvent(event);
}
