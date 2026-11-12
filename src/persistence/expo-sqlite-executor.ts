import type { SqlExecutor, SqlValue } from "@/persistence/sql-executor";

export interface ExpoSqliteConnection {
  execAsync(statement: string): Promise<void>;
  getAllAsync<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]>;
  runAsync(statement: string, params?: readonly SqlValue[]): Promise<void>;
}

export function createExpoSqliteExecutor(connection: ExpoSqliteConnection): SqlExecutor {
  return {
    async exec(statement: string): Promise<void> {
      await connection.execAsync(statement);
    },
    async getAll<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]> {
      return connection.getAllAsync<Row>(statement, params);
    },
    async run(statement: string, params?: readonly SqlValue[]): Promise<void> {
      await connection.runAsync(statement, params);
    },
  };
}
