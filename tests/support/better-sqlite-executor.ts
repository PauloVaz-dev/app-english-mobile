import Database from "better-sqlite3";

import type { RunInTransaction, SqlExecutor, SqlValue } from "@/persistence/sql-executor";

export interface MigrationTrace {
  executor: SqlExecutor;
  runInTransaction: RunInTransaction;
  events: string[];
}

export function createBetterSqliteExecutor(database: Database.Database): SqlExecutor {
  return {
    async exec(statement: string): Promise<void> {
      database.exec(statement);
    },
    async getAll<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]> {
      return database.prepare(statement).all(...bindValues(params)) as Row[];
    },
    async run(statement: string, params?: readonly SqlValue[]): Promise<void> {
      database.prepare(statement).run(...bindValues(params));
    },
  };
}

export function traceBetterSqliteMigration(database: Database.Database): MigrationTrace {
  const events: string[] = [];
  let insideTransaction = false;
  const baseExecutor = createBetterSqliteExecutor(database);
  const executor: SqlExecutor = {
    async exec(statement: string): Promise<void> {
      const scope = insideTransaction ? "transaction" : "connection";
      events.push(`${scope}:${statement}`);
      await baseExecutor.exec(statement);
    },
    getAll: (statement, params) => baseExecutor.getAll(statement, params),
    run: (statement, params) => baseExecutor.run(statement, params),
  };
  const runInTransaction: RunInTransaction = async (work) => {
    insideTransaction = true;
    events.push("transaction:BEGIN");
    database.exec("BEGIN");
    try {
      await work();
      database.exec("COMMIT");
      events.push("transaction:COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      events.push("transaction:ROLLBACK");
      throw error;
    } finally {
      insideTransaction = false;
    }
  };
  return { executor, runInTransaction, events };
}

export function runBetterSqliteTransaction(database: Database.Database): RunInTransaction {
  return async (work) => {
    database.exec("BEGIN");
    try {
      await work();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

function bindValues(params: readonly SqlValue[] | undefined): SqlValue[] {
  if (params === undefined) {
    return [];
  }
  return [...params];
}
