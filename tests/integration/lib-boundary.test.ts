/// <reference types="node" />

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FORBIDDEN_PACKAGES = ["@prisma/client", "next"] as const;
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

interface ScanState {
  readonly directory: string;
  readonly aliasRoot: string | null;
  readonly seen: Set<string>;
  readonly violations: string[];
}

describe("study rule boundary", () => {
  it("flags prisma and next import specifiers", () => {
    expect(forbiddenIn('import { PrismaClient } from "@prisma/client";')).toEqual([
      "@prisma/client",
    ]);
    expect(forbiddenIn('export { default } from "next/server";')).toEqual(["next/server"]);
    expect(forbiddenIn('const client = require("@prisma/client/edge");')).toEqual([
      "@prisma/client/edge",
    ]);
    expect(forbiddenIn('await import("next");')).toEqual(["next"]);
  });

  it("follows a relative import outside the scanned directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "study-rules-"));
    try {
      const rules = path.join(root, "rules");
      mkdirSync(rules);
      writeFileSync(path.join(rules, "entry.ts"), 'import { value } from "../outside";\n');
      writeFileSync(path.join(root, "outside.ts"), 'import "@prisma/client";\n');
      expect(scanStudyRuleDirectory(rules, null)).toEqual([
        "../outside.ts imports @prisma/client",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the study rules copied into src/lib", () => {
    const studyRules = path.join(projectRoot, "src/lib");
    expect(scanStudyRuleDirectory(studyRules, projectRoot)).toEqual([]);
  });
});

function forbiddenIn(source: string): string[] {
  return moduleSpecifiers(source).filter(isForbiddenPackage);
}

function scanStudyRuleDirectory(directory: string, aliasRoot: string | null): string[] {
  const state: ScanState = {
    directory,
    aliasRoot,
    seen: new Set<string>(),
    violations: [],
  };
  for (const file of listTypeScriptFiles(directory)) {
    collectViolations(file, state);
  }
  return state.violations;
}

function collectViolations(file: string, state: ScanState): void {
  const resolvedFile = path.resolve(file);
  if (state.seen.has(resolvedFile)) {
    return;
  }
  state.seen.add(resolvedFile);
  const source = readFileSync(resolvedFile, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    recordSpecifier(resolvedFile, specifier, state);
  }
}

function recordSpecifier(file: string, specifier: string, state: ScanState): void {
  if (isForbiddenPackage(specifier)) {
    const relativeFile = path.relative(state.directory, file);
    state.violations.push(`${relativeFile} imports ${specifier}`);
    return;
  }
  const nextFile = resolveLocalModule(file, specifier, state.aliasRoot);
  if (nextFile) {
    collectViolations(nextFile, state);
  }
}

function moduleSpecifiers(source: string): string[] {
  const stripped = stripComments(source);
  const specifiers: string[] = [];
  collectPattern(stripped, /\bfrom\s+["']([^"']+)["']/g, specifiers);
  collectPattern(stripped, /\bimport\s+["']([^"']+)["']/g, specifiers);
  collectPattern(stripped, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, specifiers);
  collectPattern(stripped, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, specifiers);
  return specifiers;
}

function collectPattern(source: string, pattern: RegExp, specifiers: string[]): void {
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
    match = pattern.exec(source);
  }
}

function stripComments(source: string): string {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlock.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isForbiddenPackage(specifier: string): boolean {
  return FORBIDDEN_PACKAGES.some((packageName) => {
    return specifier === packageName || specifier.startsWith(`${packageName}/`);
  });
}

function resolveLocalModule(fromFile: string, specifier: string, aliasRoot: string | null): string | null {
  if (specifier.startsWith(".")) {
    return resolveExisting(path.resolve(path.dirname(fromFile), specifier));
  }
  if (specifier.startsWith("@/") && aliasRoot) {
    return resolveExisting(path.join(aliasRoot, "src", specifier.slice(2)));
  }
  return null;
}

function resolveExisting(basePath: string): string | null {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (isFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isTypeScriptFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isTypeScriptFile(name: string): boolean {
  return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts");
}
