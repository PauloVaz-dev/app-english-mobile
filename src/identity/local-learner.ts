import type { SqlExecutor } from "@/persistence/sql-executor";

const OLDEST_ROW_LIMIT = 1;

const OLDEST_VISITOR_STATEMENT = `
SELECT "id" AS "visitorId"
FROM "AnonymousVisitor"
ORDER BY "createdAt" ASC, "id" ASC
LIMIT ${OLDEST_ROW_LIMIT}
`;

const INSERT_VISITOR_STATEMENT = `
INSERT INTO "AnonymousVisitor" ("id", "createdAt", "lastSeenAt")
SELECT ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM "AnonymousVisitor")
`;

export interface LearnerIdentity {
  readonly visitorId: string;
}

export interface LearnerStore {
  ensure(): Promise<LearnerIdentity>;
}

export type VisitorIdFactory = () => string;

export type StudyClock = () => Date;

export interface LearnerDependencies {
  createVisitorId: VisitorIdFactory;
  now: StudyClock;
}

interface VisitorIdRow {
  visitorId: string;
}

export class LocalLearner implements LearnerStore {
  private readonly executor: SqlExecutor;
  private readonly dependencies: LearnerDependencies;

  constructor(executor: SqlExecutor, dependencies: LearnerDependencies) {
    this.executor = executor;
    this.dependencies = dependencies;
  }

  async ensure(): Promise<LearnerIdentity> {
    const existingVisitorId = await readOldestVisitorId(this.executor);
    if (existingVisitorId !== undefined) {
      return { visitorId: existingVisitorId };
    }
    await insertVisitorWhenEmpty(this.executor, this.dependencies);
    const visitorId = await readOldestVisitorId(this.executor);
    if (visitorId === undefined) {
      throw new Error("Local learner was not stored.");
    }
    return { visitorId };
  }
}

async function readOldestVisitorId(executor: SqlExecutor): Promise<string | undefined> {
  const rows = await executor.getAll<VisitorIdRow>(OLDEST_VISITOR_STATEMENT);
  return rows[0]?.visitorId;
}

async function insertVisitorWhenEmpty(
  executor: SqlExecutor,
  dependencies: LearnerDependencies,
): Promise<void> {
  const visitorId = dependencies.createVisitorId();
  const storedAt = dependencies.now().toISOString();
  await executor.run(INSERT_VISITOR_STATEMENT, [visitorId, storedAt, storedAt]);
}
