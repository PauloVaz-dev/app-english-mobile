import { describe, expect, it } from "vitest";

import { InvalidGameSessionError } from "@/lib/domain/game/errors";
import {
  type GameAnswerRow,
  type GameSessionRow,
  type GameSessionWordRow,
  toGameSessionSnapshot,
  toSessionReviewFacts,
} from "@/persistence/sqlite-game-session-repository";

const STARTED_AT = "2026-11-12T12:00:00.000Z";

function sessionRow(overrides: Partial<GameSessionRow> = {}): GameSessionRow {
  return {
    id: "session-1",
    visitorId: "visitor-1",
    mode: "FREE",
    status: "ACTIVE",
    targetWords: 3,
    correctAnswers: 1,
    wrongAnswers: 1,
    startedAt: STARTED_AT,
    finishedAt: null,
    durationMs: null,
    ...overrides,
  };
}

function wordRows(): GameSessionWordRow[] {
  return ["c", "a", "b"].map((letter, index) => ({
    wordId: `word-${letter}`,
    sequence: [2, 0, 1][index] ?? 0,
    presentedAt: index === 2 ? null : "2026-11-12T12:00:01.000Z",
    completedAt: letter === "a" ? "2026-11-12T12:00:05.000Z" : null,
    graded: 0,
    english: `english ${letter}`,
    portuguese: `portugues ${letter}`,
    exampleSentence: null,
    active: 1,
  }));
}

function answerRows(): GameAnswerRow[] {
  return [
    {
      attemptId: "attempt-2",
      sequence: 1,
      promptWordId: "word-a",
      selectedWordId: "word-a",
      isCorrect: 1,
      responseTimeMs: 4_000,
      createdAt: "2026-11-12T12:00:05.000Z",
    },
    {
      attemptId: "attempt-1",
      sequence: 0,
      promptWordId: "word-a",
      selectedWordId: "word-c",
      isCorrect: 0,
      responseTimeMs: 2_000,
      createdAt: "2026-11-12T12:00:03.000Z",
    },
  ];
}

describe("game session rows", () => {
  it("turns stored rows into an ordered session snapshot", () => {
    const snapshot = toGameSessionSnapshot({
      session: sessionRow(),
      words: wordRows(),
      answers: answerRows(),
    });
    expect(snapshot.mode).toBe("FREE");
    expect(snapshot.startedAt).toEqual(new Date(STARTED_AT));
    expect(snapshot.finishedAt).toBeNull();
    expect(snapshot.words.map(({ word, sequence }) => [word.id, sequence])).toEqual([
      ["word-a", 0],
      ["word-b", 1],
      ["word-c", 2],
    ]);
    expect(snapshot.words.map(({ graded }) => graded)).toEqual([false, false, false]);
    expect(snapshot.words[0]?.completedAt).toEqual(new Date("2026-11-12T12:00:05.000Z"));
    expect(snapshot.words[1]?.presentedAt).toBeNull();
    expect(snapshot.words[0]?.word.active).toBe(true);
    expect(snapshot.attempts).toEqual([
      {
        attemptId: "attempt-1",
        promptWordId: "word-a",
        selectedWordId: "word-c",
        isCorrect: false,
        responseTimeMs: 2_000,
        occurredAt: new Date("2026-11-12T12:00:03.000Z"),
      },
      {
        attemptId: "attempt-2",
        promptWordId: "word-a",
        selectedWordId: "word-a",
        isCorrect: true,
        responseTimeMs: 4_000,
        occurredAt: new Date("2026-11-12T12:00:05.000Z"),
      },
    ]);
  });

  it("refuses an unknown mode or status", () => {
    expect(() =>
      toGameSessionSnapshot({
        session: sessionRow({ mode: "SPEED" }),
        words: wordRows(),
        answers: [],
      }),
    ).toThrow(InvalidGameSessionError);
    expect(() =>
      toGameSessionSnapshot({
        session: sessionRow({ status: "PAUSED" }),
        words: wordRows(),
        answers: [],
      }),
    ).toThrow(InvalidGameSessionError);
  });

  it("builds the result facts in word order with every attempt", () => {
    const facts = toSessionReviewFacts(wordRows(), answerRows(), new Map());
    expect(facts.words).toEqual([
      { wordId: "word-a", english: "english a", portuguese: "portugues a" },
      { wordId: "word-b", english: "english b", portuguese: "portugues b" },
      { wordId: "word-c", english: "english c", portuguese: "portugues c" },
    ]);
    expect(facts.attempts).toEqual([
      { promptWordId: "word-a", isCorrect: false, responseTimeMs: 2_000 },
      { promptWordId: "word-a", isCorrect: true, responseTimeMs: 4_000 },
    ]);
  });
});
