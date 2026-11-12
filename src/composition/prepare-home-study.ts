import { LocalLearner, type VisitorIdFactory } from "@/identity/local-learner";
import {
  HOME_MIGRATION_FAILED,
  HOME_SEED_FAILED,
  failHomeOpen,
  type HomeEventRecorder,
} from "@/observability/home-open-log";
import { migrate } from "@/persistence/migrate";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";
import { seedVocabulary } from "@/seed/seed-vocabulary";

export interface PrepareHomeStudyInput {
  executor: SqlExecutor;
  runInTransaction: RunInTransaction;
  createVisitorId: VisitorIdFactory;
  instant: Date;
  recordEvent: HomeEventRecorder;
}

export async function prepareHomeStudy(input: PrepareHomeStudyInput): Promise<string> {
  await runHomeMigration(input);
  return runHomeSeed(input);
}

async function runHomeMigration(input: PrepareHomeStudyInput): Promise<void> {
  try {
    await migrate(input.executor, input.runInTransaction);
  } catch (cause) {
    throw failHomeOpen({
      event: HOME_MIGRATION_FAILED,
      cause,
      recordEvent: input.recordEvent,
    });
  }
}

async function runHomeSeed(input: PrepareHomeStudyInput): Promise<string> {
  try {
    return await storeLearnerAndSeed(input);
  } catch (cause) {
    throw failHomeOpen({
      event: HOME_SEED_FAILED,
      cause,
      recordEvent: input.recordEvent,
    });
  }
}

async function storeLearnerAndSeed(input: PrepareHomeStudyInput): Promise<string> {
  const learner = new LocalLearner(input.executor, {
    createVisitorId: input.createVisitorId,
    now: () => input.instant,
  });
  let visitorId: string | undefined;
  await input.runInTransaction(async () => {
    const identity = await learner.ensure();
    visitorId = identity.visitorId;
    await seedVocabulary(input.executor, () => input.instant);
  });
  if (visitorId === undefined) {
    throw new Error("Local learner was not stored.");
  }
  return visitorId;
}
