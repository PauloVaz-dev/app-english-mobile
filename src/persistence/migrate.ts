import { VERSION_ONE_SQL } from "@/persistence/schema-version-one";
import type { RunInTransaction, SqlExecutor } from "@/persistence/sql-executor";

export const SUPPORTED_SCHEMA_VERSION = 1;

const EMPTY_SCHEMA_VERSION = 0;
const FOREIGN_KEYS_STATEMENT = "PRAGMA foreign_keys = ON";
const JOURNAL_MODE_STATEMENT = "PRAGMA journal_mode = WAL";
const USER_VERSION_STATEMENT = "PRAGMA user_version";
const SET_USER_VERSION_STATEMENT = `PRAGMA user_version = ${SUPPORTED_SCHEMA_VERSION}`;

export class NewerSchemaError extends Error {
  readonly name = "NewerSchemaError";

  constructor(readonly version: number) {
    super(`Schema version ${version} is newer than supported version ${SUPPORTED_SCHEMA_VERSION}.`);
  }
}

interface UserVersionRow {
  user_version: number;
}

export async function migrate(
  executor: SqlExecutor,
  runInTransaction: RunInTransaction,
): Promise<void> {
  await enableStoragePragmas(executor);
  const version = await readSchemaVersion(executor);
  if (version > SUPPORTED_SCHEMA_VERSION) {
    throw new NewerSchemaError(version);
  }
  if (version === SUPPORTED_SCHEMA_VERSION) {
    return;
  }
  await applyVersionOne(executor, runInTransaction);
}

async function enableStoragePragmas(executor: SqlExecutor): Promise<void> {
  await executor.exec(FOREIGN_KEYS_STATEMENT);
  await executor.exec(JOURNAL_MODE_STATEMENT);
}

async function readSchemaVersion(executor: SqlExecutor): Promise<number> {
  const rows = await executor.getAll<UserVersionRow>(USER_VERSION_STATEMENT);
  const row = rows[0];
  if (row === undefined) {
    return EMPTY_SCHEMA_VERSION;
  }
  return row.user_version;
}

async function applyVersionOne(
  executor: SqlExecutor,
  runInTransaction: RunInTransaction,
): Promise<void> {
  await runInTransaction(async () => {
    await executor.exec(VERSION_ONE_SQL);
    await executor.exec(SET_USER_VERSION_STATEMENT);
  });
}
