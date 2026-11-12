/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const vocabularyDirectory = path.join(sourceRoot, "lib/domain/vocabulary");
const persistenceDirectory = path.join(sourceRoot, "persistence");

const FORBIDDEN_PACKAGES = [
  /^expo(-[^/]+)?(\/.*)?$/,
  /^@expo\//,
  /^react-native(-[^/]+)?(\/.*)?$/,
  /^@react-native/,
  /^better-sqlite3(\/.*)?$/,
  /^@prisma\//,
];

describe("vocabulary domain boundary", () => {
  it("flags Expo, React Native and database imports", () => {
    expect(
      [
        "expo-sqlite",
        "expo-crypto",
        "expo",
        "@expo/vector-icons",
        "react-native",
        "react-native-reanimated",
        "@react-native/assets",
        "better-sqlite3",
        "@prisma/client",
        "./vocabulary-key",
        "vitest",
      ].filter(isForbiddenPackage),
    ).toEqual([
      "expo-sqlite",
      "expo-crypto",
      "expo",
      "@expo/vector-icons",
      "react-native",
      "react-native-reanimated",
      "@react-native/assets",
      "better-sqlite3",
      "@prisma/client",
    ]);
  });

  it("reads static, side-effect, dynamic and require specifiers", () => {
    expect(
      moduleSpecifiers(
        [
          'import { a } from "expo-sqlite";',
          'import "react-native";',
          'const b = await import("better-sqlite3");',
          'const c = require("expo-crypto");',
          '// import "ignored-in-comment";',
        ].join("\n"),
      ),
    ).toEqual(["expo-sqlite", "react-native", "better-sqlite3", "expo-crypto"]);
  });

  it("keeps src/lib/domain/vocabulary free of Expo, React Native and the database", () => {
    const files = listTypeScriptFiles(vocabularyDirectory);
    expect(files.length).toBeGreaterThan(0);
    expect(scan(files)).toEqual([]);
  });
});

function scan(entryFiles: readonly string[]): string[] {
  const seen = new Set<string>();
  const violations: string[] = [];
  const pending = [...entryFiles];
  while (pending.length > 0) {
    const file = path.resolve(pending.pop()!);
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const relativeFile = path.relative(projectRoot, file);
    if (file.startsWith(`${persistenceDirectory}${path.sep}`)) {
      violations.push(`${relativeFile} is persistence code`);
      continue;
    }
    for (const specifier of moduleSpecifiers(readFileSync(file, "utf8"))) {
      if (isForbiddenPackage(specifier)) {
        violations.push(`${relativeFile} imports ${specifier}`);
        continue;
      }
      const next = resolveLocalModule(file, specifier);
      if (next) {
        pending.push(next);
      }
    }
  }
  return violations;
}

function isForbiddenPackage(specifier: string): boolean {
  return FORBIDDEN_PACKAGES.some((pattern) => pattern.test(specifier));
}

function moduleSpecifiers(source: string): string[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const found: { index: number; specifier: string }[] = [];
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      found.push({ index: match.index ?? 0, specifier: match[1]! });
    }
  }
  return found.sort((left, right) => left.index - right.index).map((item) => item.specifier);
}

function resolveLocalModule(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return resolveExisting(path.resolve(path.dirname(fromFile), specifier));
  }
  if (specifier.startsWith("@/")) {
    return resolveExisting(path.join(sourceRoot, specifier.slice(2)));
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
  return candidates.find(isFile) ?? null;
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [fullPath] : [];
  });
}
