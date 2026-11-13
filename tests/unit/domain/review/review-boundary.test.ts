/// <reference types="node" />

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const reviewDirectory = path.join(sourceRoot, "lib/domain/review");
const persistenceDirectory = path.join(sourceRoot, "persistence");
const LEARNING_RULES = [
  "lib/domain/learning/typing-answer.ts",
  "lib/domain/learning/typing-review.ts",
  "lib/domain/learning/matching-review.ts",
] as const;

const FORBIDDEN_PACKAGES = [
  /^expo(-[^/]+)?(\/.*)?$/,
  /^@expo\//,
  /^react-native(-[^/]+)?(\/.*)?$/,
  /^@react-native/,
  /^better-sqlite3(\/.*)?$/,
  /^@prisma\//,
];

describe("review rule boundary", () => {
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
        "fastest-levenshtein",
        "./errors",
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

  it("keeps the copied review rules free of Expo, React Native and the database", () => {
    const files = [
      ...listTypeScriptFiles(reviewDirectory),
      ...LEARNING_RULES.map((relativeFile) => path.join(sourceRoot, relativeFile)),
    ];
    expect(files.length).toBe(LEARNING_RULES.length + 3);
    expect(scan(files)).toEqual([]);
  });

  it("accepts the pure edit-distance import in the typing correction", () => {
    const file = path.join(sourceRoot, "lib/domain/learning/typing-answer.ts");
    expect(moduleSpecifiers(readFileSync(file, "utf8"))).toContain("fastest-levenshtein");
    expect(scan([file])).toEqual([]);
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
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    Array.from(stripped.matchAll(pattern), (match) => match[1] ?? ""),
  );
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
