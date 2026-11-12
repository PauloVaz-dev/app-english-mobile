import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withDatabaseFile(verify: (filePath: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(path.join(tmpdir(), "english-schema-"));
  const filePath = path.join(directory, "english.db");
  try {
    await verify(filePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
