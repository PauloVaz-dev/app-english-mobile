/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const RULE_DIRECTORIES = ["lib/domain", "lib/application"] as const;
const PURE_DEPENDENCIES = new Set(["fastest-levenshtein"]);

const COPIED_GAME_RULES = [
  "lib/domain/game/game-engine.ts",
  "lib/domain/game/game-session.ts",
  "lib/domain/game/response-time-measurement.ts",
  "lib/domain/learning/attempt-progress.ts",
  "lib/domain/learning/review-candidate.ts",
  "lib/domain/learning/review-priority.ts",
  "lib/domain/learning/praise-priority.ts",
  "lib/application/game/build-session-review.ts",
  "lib/application/game/session-view.ts",
] as const;

describe("game rule boundary", () => {
  it("rejects Expo, React Native and database specifiers", () => {
    const file = path.join(sourceRoot, "lib/domain/game/example.ts");
    expect(outsideRules(file, "expo-sqlite")).toBe(true);
    expect(outsideRules(file, "expo")).toBe(true);
    expect(outsideRules(file, "react-native")).toBe(true);
    expect(outsideRules(file, "better-sqlite3")).toBe(true);
    expect(outsideRules(file, "@/persistence/sql-executor")).toBe(true);
    expect(outsideRules(file, "../../../persistence/sql-executor")).toBe(true);
    expect(outsideRules(file, "./errors")).toBe(false);
    expect(outsideRules(file, "@/lib/domain/learning/types")).toBe(false);
    expect(outsideRules(file, "@/lib/application/game/session-view")).toBe(false);
    expect(outsideRules(file, "fastest-levenshtein")).toBe(true);
    expect(
      outsideRules(
        path.join(sourceRoot, "lib/domain/learning/typing-answer.ts"),
        "fastest-levenshtein",
      ),
    ).toBe(false);
  });

  it("keeps every copied game rule inside domain and application", () => {
    for (const relativeFile of COPIED_GAME_RULES) {
      expect(importsOutsideRules(path.join(sourceRoot, relativeFile))).toEqual([]);
    }
  });

  it("keeps src/lib/domain and src/lib/application free of Expo, React Native and database", () => {
    const violations = RULE_DIRECTORIES.flatMap((directory) =>
      listTypeScriptFiles(path.join(sourceRoot, directory)).flatMap((file) =>
        importsOutsideRules(file).map(
          (specifier) => `${path.relative(sourceRoot, file)} imports ${specifier}`,
        ),
      ),
    );
    expect(violations).toEqual([]);
  });
});

function importsOutsideRules(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return moduleSpecifiers(source).filter((specifier) => outsideRules(file, specifier));
}

function outsideRules(file: string, specifier: string): boolean {
  if (PURE_DEPENDENCIES.has(specifier) && file.endsWith(`${path.sep}typing-answer.ts`)) {
    return false;
  }
  if (specifier.startsWith("@/")) {
    return !insideRules(path.join(sourceRoot, specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return !insideRules(path.resolve(path.dirname(file), specifier));
  }
  return true;
}

function insideRules(target: string): boolean {
  return RULE_DIRECTORIES.some((directory) => {
    const relative = path.relative(path.join(sourceRoot, directory), target);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function moduleSpecifiers(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => Array.from(stripped.matchAll(pattern), (match) => match[1]));
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [fullPath] : [];
  });
}
