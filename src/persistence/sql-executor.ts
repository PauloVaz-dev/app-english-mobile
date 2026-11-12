export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(statement: string): Promise<void>;
  getAll<Row>(statement: string, params?: readonly SqlValue[]): Promise<Row[]>;
  run(statement: string, params?: readonly SqlValue[]): Promise<void>;
}

export type RunInTransaction = (work: () => Promise<void>) => Promise<void>;
