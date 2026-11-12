import {
  LocalLearner,
  type LearnerIdentity,
  type StudyClock,
  type VisitorIdFactory,
} from "@/identity/local-learner";
import { migrate } from "@/persistence/migrate";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import { seedVocabulary } from "@/seed/seed-vocabulary";

export interface LocalDatabaseBootstrap {
  executor: SqlExecutor;
  runInTransaction: RunInTransaction;
  createVisitorId: VisitorIdFactory;
  now: StudyClock;
}

export async function bootstrapEnglishDatabase(
  session: LocalDatabaseBootstrap,
): Promise<LearnerIdentity> {
  await migrate(session.executor, session.runInTransaction);
  const learner = new LocalLearner(session.executor, {
    createVisitorId: session.createVisitorId,
    now: session.now,
  });
  let visitorId: string | undefined;
  await session.runInTransaction(async () => {
    const identity = await learner.ensure();
    visitorId = identity.visitorId;
    await seedVocabulary(session.executor, session.now);
  });
  if (visitorId === undefined) {
    throw new Error("Local learner was not stored.");
  }
  return { visitorId };
}
