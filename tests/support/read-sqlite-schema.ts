import Database from "better-sqlite3";

import type {
  ColumnExpectation,
  ForeignKeyExpectation,
  IndexExpectation,
} from "./expected-sqlite-schema";

const SQLITE_TRUE = 1;
const FIRST_FOREIGN_KEY_COLUMN = 0;

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyRow {
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

interface IndexListRow {
  name: string;
  unique: number;
  origin: string;
}

interface IndexInfoRow {
  seqno: number;
  name: string;
}

export function readTableNames(database: Database.Database): string[] {
  const rows = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function readColumns(database: Database.Database, tableName: string): ColumnExpectation[] {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all() as TableInfoRow[];
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    notNull: row.notnull === SQLITE_TRUE,
    primaryKey: row.pk,
    defaultValue: row.dflt_value,
  }));
}

export function readForeignKeys(
  database: Database.Database,
  tableName: string,
): ForeignKeyExpectation[] {
  const rows = database
    .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`)
    .all() as ForeignKeyRow[];
  return rows
    .filter((row) => row.seq === FIRST_FOREIGN_KEY_COLUMN)
    .map((row) => ({
      from: row.from,
      table: row.table,
      to: row.to,
      onDelete: row.on_delete as ForeignKeyExpectation["onDelete"],
      onUpdate: row.on_update as ForeignKeyExpectation["onUpdate"],
    }))
    .sort((left, right) => left.from.localeCompare(right.from));
}

export function readIndexes(database: Database.Database, tableName: string): IndexExpectation[] {
  const listed = database
    .prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
    .all() as IndexListRow[];
  return listed
    .filter((index) => index.origin === "c")
    .map((index) => ({
      name: index.name,
      unique: index.unique === SQLITE_TRUE,
      columns: readIndexColumns(database, index.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readIndexColumns(database: Database.Database, indexName: string): string[] {
  const rows = database
    .prepare(`PRAGMA index_info(${quoteIdentifier(indexName)})`)
    .all() as IndexInfoRow[];
  return [...rows].sort((left, right) => left.seqno - right.seqno).map((row) => row.name);
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
