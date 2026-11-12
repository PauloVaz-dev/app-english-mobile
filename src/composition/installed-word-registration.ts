import { randomUUID } from "expo-crypto";

import { prepareHomeStudy } from "@/composition/prepare-home-study";
import {
  createPreparedWordRegistration,
  createWordRegistration,
  type WordRegistration,
  type WordRegistrationEvent,
} from "@/composition/word-registration";
import type { Clock } from "@/lib/domain/game/types";
import { logDeviceEvent } from "@/observability/device-event-log";
import { recordHomeOpenFailure } from "@/observability/home-open-log";
import {
  connectEnglishDatabase,
  createEnglishDatabaseSession,
} from "@/persistence/open-english-database";
import { SqliteVocabularyRepository } from "@/persistence/sqlite-vocabulary-repository";

const deviceClock: Clock = {
  now: () => new Date(),
};

/**
 * The word form's registration on the device, one per route: the database is
 * opened on the first call and every registration shares one queue, because
 * `withTransactionAsync` is not exclusive.
 */
export function createInstalledWordRegistration(): WordRegistration {
  return createPreparedWordRegistration({
    prepare: prepareInstalledWordRegistration,
    recordEvent: recordWordRegistrationEvent,
  });
}

async function prepareInstalledWordRegistration(): Promise<WordRegistration> {
  const database = await connectEnglishDatabase();
  const session = createEnglishDatabaseSession(database);
  await prepareHomeStudy({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: () => randomUUID(),
    instant: deviceClock.now(),
    recordEvent: recordHomeOpenFailure,
  });
  return createWordRegistration({
    repository: new SqliteVocabularyRepository(
      session.executor,
      session.runInTransaction,
      deviceClock,
    ),
    createId: () => randomUUID(),
    recordEvent: recordWordRegistrationEvent,
  });
}

function recordWordRegistrationEvent(event: WordRegistrationEvent): void {
  logDeviceEvent(event);
}
