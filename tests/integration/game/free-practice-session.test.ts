import { describe, expect, it } from "vitest";

import { buildSessionReview } from "@/lib/application/game/build-session-review";
import { AttemptConflictError, SessionEndedError } from "@/lib/domain/game/errors";
import {
  createGameBoard,
  resolveBoardSelection,
  type GameBoard,
} from "@/lib/domain/game/game-engine";
import { GameSession } from "@/lib/domain/game/game-session";
import { BOARD_PAIR_LIMIT, createWord, type Word } from "@/lib/domain/game/types";
import {
  applyAttemptToProgress,
  assertAttemptProgressAllowed,
} from "@/lib/domain/learning/attempt-progress";
import { createLearningProgressSnapshot } from "@/lib/domain/learning/progress-metrics";
import type { LearningProgressSnapshot } from "@/lib/domain/learning/types";

import { FakeClock, SequenceRandom } from "../../unit/domain/game/fixtures";

const ENGLISH = [
  "apple",
  "bird",
  "cat",
  "dog",
  "egg",
  "fox",
  "goat",
  "hat",
  "ink",
  "jam",
  "kite",
  "lamp",
  "moon",
  "nest",
  "owl",
  "pen",
  "queen",
  "rain",
  "sun",
  "tree",
] as const;

const DEFAULT_CORRECT_MS = 3_000;
const WRONG_MS = 700;
const CORRECT_MS: Readonly<Record<string, number>> = {
  fox: 900,
  bird: 1_200,
  cat: 1_200,
  apple: 1_500,
  dog: 1_000,
  egg: 2_500,
  goat: 4_000,
  hat: 3_000,
  ink: 6_000,
};
const PLANNED_ERRORS: Readonly<Record<string, number>> = { egg: 2, goat: 1, hat: 1, dog: 1 };

function makeNamedWords(): Word[] {
  return ENGLISH.map((english) =>
    createWord({ id: `word-${english}`, english, portuguese: `pt-${english}` }),
  );
}

function visibleIds(board: GameBoard): string[] {
  return board.portugueseCards.map((card) => card.wordId);
}

function startFreeSession(words: readonly Word[], clock: FakeClock): GameSession {
  return GameSession.start(
    { id: "session-free", visitorId: "visitor-1", mode: "FREE", words },
    clock,
  );
}

describe("free practice session in memory", () => {
  it("plays 20 words from board to result with exposures, errors and replacement", () => {
    const clock = new FakeClock(new Date("2026-11-12T12:00:00Z"));
    const random = new SequenceRandom([0.31, 0.72, 0.05, 0.94, 0.5, 0.18, 0.66]);
    const words = makeNamedWords();
    const session = startFreeSession(words, clock);
    const progress = new Map<string, LearningProgressSnapshot>();
    const errorsLeft = new Map(Object.entries(PLANNED_ERRORS));
    let elapsedMs = 0;
    let attemptSequence = 0;
    let newExposures = 0;

    const expose = (board: GameBoard) => {
      for (const exposure of session.recordExposures(visibleIds(board), clock)) {
        if (!exposure.isNew) continue;
        newExposures += 1;
        const current = progress.get(exposure.wordId);
        progress.set(
          exposure.wordId,
          createLearningProgressSnapshot({
            timesShown: (current?.timesShown ?? 0) + 1,
            correctCount: current?.correctCount ?? 0,
            wrongCount: current?.wrongCount ?? 0,
            totalCorrectResponseTimeMs: current?.totalCorrectResponseTimeMs ?? 0,
          }),
        );
      }
    };

    const attempt = (promptWordId: string, selectedWordId: string, responseTimeMs: number) => {
      clock.advance(responseTimeMs);
      elapsedMs += responseTimeMs;
      attemptSequence += 1;
      const input = {
        attemptId: `attempt-${attemptSequence}`,
        promptWordId,
        selectedWordId,
        responseTimeMs,
      };
      const before = session.attempts.length;
      const result = session.recordAttempt(input, clock);
      if (session.attempts.length > before) {
        const outcome = { isCorrect: result.isCorrect, responseTimeMs };
        const current = progress.get(promptWordId) ?? null;
        assertAttemptProgressAllowed(current, outcome);
        progress.set(promptWordId, applyAttemptToProgress(current, outcome));
      }
      return { input, result };
    };

    let board = createGameBoard(words, random);
    expose(board);
    expose(board);
    expect(newExposures).toBe(BOARD_PAIR_LIMIT);

    while (session.status === "ACTIVE") {
      const ids = visibleIds(board);
      expect(ids.length).toBeLessThanOrEqual(BOARD_PAIR_LIMIT);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(board.englishCards.map((card) => card.wordId))).toEqual(new Set(ids));

      const prompt = board.portugueseCards[0];
      const english = prompt.text.replace("pt-", "");
      const remainingErrors = errorsLeft.get(english) ?? 0;
      if (remainingErrors > 0) {
        const wrongCard = board.englishCards.find((card) => card.wordId !== prompt.wordId);
        expect(wrongCard).toBeDefined();
        const wrong = resolveBoardSelection(
          board,
          { promptWordId: prompt.wordId, selectedWordId: wrongCard!.wordId },
          random,
        );
        expect(wrong.isCorrect).toBe(false);
        expect(wrong.completedWordId).toBeNull();
        expect(wrong.board).toEqual(board);
        const { result } = attempt(prompt.wordId, wrongCard!.wordId, WRONG_MS);
        expect(result.isCorrect).toBe(false);
        expect(result.completedWordId).toBeNull();
        errorsLeft.set(english, remainingErrors - 1);
        board = wrong.board;
        expose(board);
        continue;
      }

      const queuedHead = board.queuedWords[0];
      const right = resolveBoardSelection(
        board,
        { promptWordId: prompt.wordId, selectedWordId: prompt.wordId },
        random,
      );
      expect(right.isCorrect).toBe(true);
      expect(visibleIds(right.board)).not.toContain(prompt.wordId);
      if (queuedHead) {
        expect(visibleIds(right.board)).toContain(queuedHead.id);
        expect(visibleIds(right.board)).toHaveLength(BOARD_PAIR_LIMIT);
      }
      const { input, result } = attempt(
        prompt.wordId,
        prompt.wordId,
        CORRECT_MS[english] ?? DEFAULT_CORRECT_MS,
      );
      expect(result.completedWordId).toBe(prompt.wordId);

      if (attemptSequence === 1) {
        const replay = session.recordAttempt(input, clock);
        expect(replay.attempt.attemptId).toBe(input.attemptId);
        expect(session.attempts).toHaveLength(1);
        expect(() =>
          session.recordAttempt({ ...input, responseTimeMs: input.responseTimeMs + 1 }, clock),
        ).toThrow(AttemptConflictError);
      }

      board = right.board;
      if (board.portugueseCards.length > 0 && session.status === "ACTIVE") {
        expose(board);
      }
    }

    expect(newExposures).toBe(20);
    expect(session.status).toBe("COMPLETED");
    expect(session.words.every((entry) => entry.graded === false)).toBe(true);
    expect(words.some((word) => session.gradesWord(word.id))).toBe(false);

    const correctTotal = ENGLISH.reduce(
      (total, english) => total + (CORRECT_MS[english] ?? DEFAULT_CORRECT_MS),
      0,
    );
    const metrics = session.metrics(clock);
    expect(metrics).toEqual({
      status: "COMPLETED",
      targetWords: 20,
      completedWords: 20,
      correctAnswers: 20,
      wrongAnswers: 5,
      accuracy: 80,
      averageResponseTimeMs: (correctTotal + 5 * WRONG_MS) / 25,
      durationMs: elapsedMs,
    });

    for (const entry of session.words) {
      expect(progress.get(entry.word.id)?.timesShown).toBe(1);
    }
    expect(progress.get("word-egg")).toEqual({
      timesShown: 1,
      correctCount: 1,
      wrongCount: 2,
      totalCorrectResponseTimeMs: 2_500,
    });

    const lists = buildSessionReview({
      words: session.words.map(({ word }) => ({
        wordId: word.id,
        english: word.english,
        portuguese: word.portuguese,
      })),
      attempts: session.attempts,
      progressByWordId: progress,
    });
    expect(lists.reviewWords.map((word) => word.english)).toEqual(["egg", "goat", "hat"]);
    expect(lists.praiseWords.map((word) => [word.english, word.timeToCorrectMs])).toEqual([
      ["fox", 900],
      ["bird", 1_200],
      ["cat", 1_200],
    ]);
    expect(lists.praiseWords.every((word) => word.wrongAnswers === 0)).toBe(true);

    const restored = GameSession.restore(session.toSnapshot());
    expect(restored.metrics(clock)).toEqual(metrics);
    expect(restored.words.every((entry) => entry.graded === false)).toBe(true);
  });

  it("marks an abandoned free session and keeps the attempts already made", () => {
    const clock = new FakeClock(new Date("2026-11-12T12:00:00Z"));
    const words = makeNamedWords();
    const session = startFreeSession(words, clock);
    const board = createGameBoard(words, new SequenceRandom([0.4, 0.2, 0.8]));
    session.recordExposures(visibleIds(board), clock);
    const [first, second] = board.portugueseCards;
    clock.advance(1_000);
    session.recordAttempt(
      {
        attemptId: "a-1",
        promptWordId: first.wordId,
        selectedWordId: second.wordId,
        responseTimeMs: 1_000,
      },
      clock,
    );
    clock.advance(2_000);
    session.abandon(clock);

    expect(session.status).toBe("ABANDONED");
    expect(session.result).toMatchObject({
      status: "ABANDONED",
      correctAnswers: 0,
      wrongAnswers: 1,
      durationMs: 3_000,
    });
    expect(() =>
      session.recordAttempt(
        {
          attemptId: "a-2",
          promptWordId: first.wordId,
          selectedWordId: first.wordId,
          responseTimeMs: 500,
        },
        clock,
      ),
    ).toThrow(SessionEndedError);
  });
});
