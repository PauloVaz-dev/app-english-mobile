import * as Crypto from "expo-crypto";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { bootstrapEnglishDatabase } from "@/persistence/bootstrap-english-database";
import {
  createExpoSqliteExecutor,
  type ExpoSqliteConnection,
} from "@/persistence/expo-sqlite-executor";
import type { RunInTransaction, SqlExecutor, SqlValue } from "@/persistence/sql-executor";

export const ENGLISH_DATABASE_FILE = "english.db";

export interface EnglishDatabaseSession {
  executor: SqlExecutor;
  runInTransaction: RunInTransaction;
}

export function connectEnglishDatabase(): Promise<SQLiteDatabase> {
  return openDatabaseAsync(ENGLISH_DATABASE_FILE);
}

export function createEnglishDatabaseSession(database: SQLiteDatabase): EnglishDatabaseSession {
  return {
    executor: createExpoSqliteExecutor(adaptExpoDatabase(database)),
    runInTransaction: (work) => database.withTransactionAsync(work),
  };
}

export async function openEnglishDatabase(): Promise<SQLiteDatabase> {
  const database = await connectEnglishDatabase();
  const session = createEnglishDatabaseSession(database);
  await bootstrapEnglishDatabase({
    executor: session.executor,
    runInTransaction: session.runInTransaction,
    createVisitorId: () => Crypto.randomUUID(),
    now: () => new Date(),
  });
  return database;
}

function adaptExpoDatabase(database: SQLiteDatabase): ExpoSqliteConnection {
  return {
    execAsync(statement: string): Promise<void> {
      return database.execAsync(statement);
    },
    getAllAsync<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]> {
      if (params === undefined) {
        return database.getAllAsync<Row>(statement);
      }
      return database.getAllAsync<Row>(statement, [...params]);
    },
    async runAsync(statement: string, params?: readonly SqlValue[]): Promise<void> {
      if (params === undefined) {
        await database.runAsync(statement);
        return;
      }
      await database.runAsync(statement, [...params]);
    },
  };
}
