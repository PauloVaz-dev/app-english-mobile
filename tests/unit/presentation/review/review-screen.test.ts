/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ReviewSessionResultView } from "@/lib/application/review/review-session-view";
import { createWord, type Word } from "@/lib/domain/game/types";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/lib/domain/learning/local-day";
import { HOME_ENTRY_METRICS, homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";
import {
  REVIEW_HOME_ACTION,
  REVIEW_MIN_TOUCH_TARGET,
  REVIEW_NOTHING_MESSAGE,
  REVIEW_PERSIST_FAILED_MESSAGE,
  REVIEW_PRACTICE_ACTION,
  REVIEW_RETRY_ACTION,
  ReviewScreenController,
  reviewProgressView,
  reviewResultView,
  type ReviewBoardAttempt,
  type ReviewScreenMatchInput,
  type ReviewScreenPort,
  type ReviewScreenStart,
  type ReviewScreenState,
  type ReviewScreenTypingInput,
  type ReviewScreenTypingResult,
} from "@/lib/presentation/review/review-screen";
import type { TypingCardPrompt, TypingCardSubmission } from "@/lib/presentation/review/typing-card";

const NOW = new Date("2026-11-12T15:00:00.000Z");
const TOMORROW = startOfLocalDay(NOW, DEFAULT_TIME_ZONE, 1).toISOString();
const LATER = new Date("2026-11-20T15:00:00.000Z").toISOString();

function prompt(wordId: string, portuguese: string, firstLetter: string, reinforcement = false): TypingCardPrompt {
  return { wordId, portuguese, firstLetter, reinforcement };
}

function word(id: string, english = id, portuguese = id): Word {
  return createWord({ id, english, portuguese });
}

function finished(overrides: Partial<ReviewSessionResultView> = {}): ReviewSessionResultView {
  return {
    status: "COMPLETED",
    correctAnswers: 2,
    wrongAnswers: 1,
    reviewWords: [],
    remainingDueToday: 1,
    nextReviewAt: TOMORROW,
    pendingReview: true,
    timeZone: DEFAULT_TIME_ZONE,
    ...overrides,
  };
}

function typingStart(): Extract<ReviewScreenStart, { kind: "opened" }> {
  return {
    kind: "opened",
    sessionId: "review-1",
    stage: "TYPING",
    prompt: prompt("apple", "maçã", "a"),
    typingRemaining: 2,
    gameSessionId: "game-1",
    matchingWords: [],
    typingCount: 2,
    matchingCount: 1,
    distractorCount: 2,
    result: null,
  };
}

function matchingStart(): Extract<ReviewScreenStart, { kind: "opened" }> {
  return {
    kind: "opened",
    sessionId: "review-1",
    stage: "MATCHING",
    prompt: null,
    typingRemaining: 0,
    gameSessionId: "game-1",
    matchingWords: [word("book", "book", "livro"), word("house", "house", "casa"), word("river", "river", "rio")],
    typingCount: 0,
    matchingCount: 3,
    distractorCount: 0,
    result: null,
  };
}

function typingFeedback(overrides: Partial<ReviewScreenTypingResult> = {}): ReviewScreenTypingResult {
  return {
    outcome: "CORRECT",
    expected: "apple",
    exampleSentence: "An apple.",
    stage: "TYPING",
    prompt: prompt("book", "livro", "b"),
    typingRemaining: 1,
    gameSessionId: "game-1",
    matchingWords: [],
    result: null,
    ...overrides,
  };
}

function submission(overrides: Partial<TypingCardSubmission> = {}): TypingCardSubmission {
  return {
    wordId: "apple",
    reinforcement: false,
    kind: "answer",
    typed: "apple",
    usedHint: false,
    responseTimeMs: 3_000,
    ...overrides,
  };
}

function hit(wordId: string): ReviewBoardAttempt {
  return {
    attemptId: `pair-${wordId}`,
    promptWordId: wordId,
    selectedWordId: wordId,
    isCorrect: true,
    responseTimeMs: 3_000,
  };
}

class FakeReviewPort implements ReviewScreenPort {
  readonly typed: ReviewScreenTypingInput[] = [];
  readonly exposes: { sessionId: string; wordIds: readonly string[] }[] = [];
  readonly matches: ReviewScreenMatchInput[] = [];
  readonly finishes: string[] = [];
  readonly abandons: string[] = [];
  opening: ReviewScreenStart = typingStart();
  feedback: ReviewScreenTypingResult = typingFeedback();
  outcome: ReviewSessionResultView = finished();
  failStart = false;
  failNextTypes = 0;
  failNextMatches = 0;
  failNextFinishes = 0;

  async start(): Promise<ReviewScreenStart> {
    if (this.failStart) {
      throw new Error("disk is full");
    }
    return this.opening;
  }

  async type(input: ReviewScreenTypingInput): Promise<ReviewScreenTypingResult> {
    this.typed.push(input);
    if (this.failNextTypes > 0) {
      this.failNextTypes -= 1;
      throw new Error("disk is full");
    }
    return this.feedback;
  }

  async expose(sessionId: string, wordIds: readonly string[]): Promise<void> {
    this.exposes.push({ sessionId, wordIds: [...wordIds] });
  }

  async match(input: ReviewScreenMatchInput): Promise<void> {
    this.matches.push(input);
    if (this.failNextMatches > 0) {
      this.failNextMatches -= 1;
      throw new Error("disk is full");
    }
  }

  async finish(sessionId: string): Promise<ReviewSessionResultView> {
    this.finishes.push(sessionId);
    if (this.failNextFinishes > 0) {
      this.failNextFinishes -= 1;
      throw new Error("disk is full");
    }
    return this.outcome;
  }

  async abandon(sessionId: string): Promise<void> {
    this.abandons.push(sessionId);
  }
}

function controllerWith(port: FakeReviewPort) {
  const seen: ReviewScreenState[] = [];
  let attempt = 0;
  const controller = new ReviewScreenController({
    port,
    now: () => NOW,
    createAttemptId: () => {
      attempt += 1;
      return `attempt-${attempt}`;
    },
    onChange: (state) => seen.push(state),
  });
  return { controller, seen };
}

function typingOf(controller: ReviewScreenController) {
  const state = controller.state;
  if (state.kind !== "typing") {
    throw new Error(`Expected typing, got ${state.kind}.`);
  }
  return state.typing;
}

function matchingOf(controller: ReviewScreenController) {
  const state = controller.state;
  if (state.kind !== "matching") {
    throw new Error(`Expected matching, got ${state.kind}.`);
  }
  return state.matching;
}

describe("review progress copy", () => {
  it("names the typing stage and the session progress", () => {
    const view = reviewProgressView({
      stage: "TYPING",
      hasTyping: true,
      hasMatching: true,
      completed: 0,
      total: 5,
    });

    expect(view.stageLabel).toBe("Etapa 1 de 2 — Digitar");
    expect(view.progressLabel).toBe("Progresso 0/5");
    expect(view.remainingLabel).toBe("Faltam 5 palavras");
    expect(view.ratio).toBe(0);
    expect(view.accessibilityLabel).toBe(
      "Etapa 1 de 2 — Digitar. Faltam 5 palavras. Progresso: 0 de 5 palavras.",
    );
  });

  it("uses the singular when one word remains and names a matching-only stage", () => {
    expect(
      reviewProgressView({
        stage: "TYPING",
        hasTyping: true,
        hasMatching: false,
        completed: 0,
        total: 1,
      }).stageLabel,
    ).toBe("Etapa 1 — Digitar");
    expect(
      reviewProgressView({
        stage: "MATCHING",
        hasTyping: false,
        hasMatching: true,
        completed: 2,
        total: 3,
      }),
    ).toMatchObject({
      stageLabel: "Etapa 1 — Associar",
      progressLabel: "Progresso 2/3",
      remainingLabel: "Falta 1 palavra",
    });
    expect(
      reviewProgressView({
        stage: "MATCHING",
        hasTyping: true,
        hasMatching: true,
        completed: 5,
        total: 5,
      }).remainingLabel,
    ).toBeNull();
  });
});

describe("review result copy", () => {
  it("shows hits, misses, what is still due today and the next review date", () => {
    const view = reviewResultView(finished(), NOW);

    expect(view.title).toBe("Revisão concluída");
    expect(view.rows).toEqual([
      { label: "Acertos", value: "2" },
      { label: "Erros", value: "1" },
    ]);
    expect(view.remainingLabel).toBe("1 palavra ainda vence hoje");
    expect(view.nextReviewLabel).toBe("Próxima revisão amanhã");
    expect(view.continueReview).toBe(true);
    expect(view.continueAction?.label).toBe("Continuar");
    expect(view.homeAction).toEqual(REVIEW_HOME_ACTION);
    expect(view.announcement).toBe(
      "Revisão concluída. 2 acertos e 1 erro. 1 palavra ainda vence hoje. Próxima revisão amanhã.",
    );
  });

  it("hides continue when nothing is still due and names a later date", () => {
    const view = reviewResultView(
      finished({
        correctAnswers: 4,
        wrongAnswers: 0,
        remainingDueToday: 0,
        pendingReview: true,
        nextReviewAt: LATER,
      }),
      NOW,
    );

    expect(view.continueReview).toBe(false);
    expect(view.continueAction).toBeNull();
    expect(view.remainingLabel).toBe("Nenhuma palavra ainda vence hoje");
    expect(view.nextReviewLabel).toBe("Próxima revisão em 20 de novembro");
    expect(view.announcement).toContain("4 acertos e 0 erros");
  });

  it("says when no next review is scheduled", () => {
    expect(reviewResultView(finished({ nextReviewAt: null, remainingDueToday: 3 }), NOW).nextReviewLabel).toBe(
      "Sem data de próxima revisão",
    );
    expect(reviewResultView(finished({ remainingDueToday: 3 }), NOW).remainingLabel).toBe(
      "3 palavras ainda vencem hoje",
    );
  });
});

describe("review screen session", () => {
  it("shows the current stage and the session progress", async () => {
    const port = new FakeReviewPort();
    const { controller } = controllerWith(port);

    await controller.start();

    expect(typingOf(controller).prompt).toEqual(prompt("apple", "maçã", "a"));
    expect(typingOf(controller).progress).toEqual(
      reviewProgressView({
        stage: "TYPING",
        hasTyping: true,
        hasMatching: true,
        completed: 0,
        total: 5,
      }),
    );
    expect(REVIEW_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
  });

  it("skips an empty typing stage and an empty matching stage", async () => {
    const matchingPort = new FakeReviewPort();
    matchingPort.opening = matchingStart();
    const matchingRun = controllerWith(matchingPort);
    await matchingRun.controller.start();

    expect(matchingRun.seen.map((state) => state.kind)).not.toContain("typing");
    expect(matchingOf(matchingRun.controller).words.map((entry) => entry.id)).toEqual([
      "book",
      "house",
      "river",
    ]);
    expect(matchingOf(matchingRun.controller).progress.stageLabel).toBe("Etapa 1 — Associar");

    const typingPort = new FakeReviewPort();
    typingPort.feedback = typingFeedback({
      stage: "DONE",
      prompt: null,
      typingRemaining: 0,
      matchingWords: [],
      result: finished({ remainingDueToday: 0, pendingReview: false }),
    });
    const typingRun = controllerWith(typingPort);
    await typingRun.controller.start();
    await typingRun.controller.submitTyping(submission());
    await typingRun.controller.advance();

    expect(typingRun.seen.map((state) => state.kind)).not.toContain("matching");
    expect(typingRun.controller.state.kind).toBe("result");
  });

  it("moves to the next card and then records the board through the composition", async () => {
    const port = new FakeReviewPort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.submitTyping(submission());

    expect(typingOf(controller).result).toEqual({
      outcome: "CORRECT",
      expected: "apple",
      exampleSentence: "An apple.",
    });
    expect(typingOf(controller).prompt.wordId).toBe("apple");
    expect(typingOf(controller).progress.progressLabel).toBe("Progresso 1/5");

    await controller.advance();
    expect(typingOf(controller).prompt).toEqual(prompt("book", "livro", "b"));

    port.feedback = typingFeedback({
      stage: "MATCHING",
      prompt: null,
      typingRemaining: 0,
      matchingWords: matchingStart().matchingWords,
      result: null,
    });
    await controller.submitTyping(submission({ wordId: "book", typed: "book" }));
    await controller.advance();
    const matching = matchingOf(controller);
    await controller.cardsReady(matching.words.map((entry) => entry.id));
    await controller.pairsEntered(["river"]);
    await controller.attempt(hit("book"));

    expect(port.typed.map((input) => input.sessionId)).toEqual(["review-1", "review-1"]);
    expect(port.exposes).toEqual([
      { sessionId: "game-1", wordIds: ["book", "house", "river"] },
      { sessionId: "game-1", wordIds: ["river"] },
    ]);
    expect(port.matches[0]).toMatchObject({
      sessionId: "game-1",
      attemptId: "pair-book",
      promptWordId: "book",
      selectedWordId: "book",
    });
    expect(matchingOf(controller).progress).toEqual(
      reviewProgressView({
        stage: "MATCHING",
        hasTyping: true,
        hasMatching: true,
        completed: 3,
        total: 5,
      }),
    );
  });

  it("shows try again and resends the same typing attempt id", async () => {
    const port = new FakeReviewPort();
    port.failNextTypes = 1;
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.submitTyping(submission());

    expect(typingOf(controller).halted).toBe(true);
    expect(typingOf(controller).failureMessage).toBe(REVIEW_PERSIST_FAILED_MESSAGE);
    expect(REVIEW_RETRY_ACTION.label).toBe("Tentar de novo");
    expect(port.typed).toHaveLength(1);

    await controller.retry();

    expect(port.typed.map((input) => input.attemptId)).toEqual(["attempt-1", "attempt-1"]);
    expect(typingOf(controller).halted).toBe(false);
    expect(typingOf(controller).result?.outcome).toBe("CORRECT");
  });

  it("resends the same board attempt and finishes only after it is stored", async () => {
    const port = new FakeReviewPort();
    port.opening = matchingStart();
    port.outcome = finished({ correctAnswers: 3, wrongAnswers: 0, remainingDueToday: 0 });
    port.failNextMatches = 1;
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.attempt(hit("book"));

    expect(matchingOf(controller).halted).toBe(true);
    expect(port.finishes).toEqual([]);

    await controller.attempt(hit("house"));
    await controller.retry();

    expect(port.matches.map((input) => input.attemptId)).toEqual(["pair-book", "pair-book", "pair-house"]);
    expect(port.finishes).toEqual([]);
    expect(controller.state.kind).toBe("matching");

    await controller.attempt(hit("river"));

    expect(controller.state.kind).toBe("result");
    expect(port.finishes).toEqual(["review-1"]);
  });

  it("offers continue only while words are still due, then opens another session", async () => {
    const port = new FakeReviewPort();
    port.feedback = typingFeedback({
      stage: "DONE",
      prompt: null,
      typingRemaining: 0,
      result: finished(),
    });
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.submitTyping(submission());
    await controller.advance();
    const result = controller.state;
    if (result.kind !== "result") {
      throw new Error(`Expected a result, got ${result.kind}.`);
    }

    expect(result.result.continueReview).toBe(true);
    expect(result.result.correctAnswers).toBe(2);
    expect(result.result.wrongAnswers).toBe(1);
    expect(result.result.remainingDueToday).toBe(1);
    expect(result.result.nextReviewLabel).toBe("Próxima revisão amanhã");

    port.opening = {
      ...typingStart(),
      sessionId: "review-2",
      typingCount: 1,
      matchingCount: 0,
      distractorCount: 0,
      typingRemaining: 1,
      gameSessionId: null,
    };
    await controller.start();

    expect(typingOf(controller).sessionId).toBe("review-2");
    expect(typingOf(controller).progress.stageLabel).toBe("Etapa 1 — Digitar");
  });

  it("says there is nothing to review and offers free practice", async () => {
    const port = new FakeReviewPort();
    port.opening = { kind: "nothing" };
    const { controller } = controllerWith(port);

    await controller.start();

    expect(controller.state).toEqual({
      kind: "nothing",
      message: REVIEW_NOTHING_MESSAGE,
      practice: REVIEW_PRACTICE_ACTION,
      home: REVIEW_HOME_ACTION,
    });
    expect(REVIEW_NOTHING_MESSAGE.toLowerCase()).toContain("nada para revisar");
    expect(REVIEW_PRACTICE_ACTION.href).toBe("/treino-livre");
  });

  it("abandons the open session when the route is left and keeps a finished one", async () => {
    const port = new FakeReviewPort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.leave();

    expect(port.abandons).toEqual(["review-1"]);

    const done = new FakeReviewPort();
    done.feedback = typingFeedback({
      stage: "DONE",
      prompt: null,
      typingRemaining: 0,
      result: finished({ remainingDueToday: 0 }),
    });
    const second = controllerWith(done);
    await second.controller.start();
    await second.controller.submitTyping(submission());
    await second.controller.advance();
    await second.controller.leave();

    expect(done.abandons).toEqual([]);
  });

  it("abandons the session when leaving after the result fails to save", async () => {
    const port = new FakeReviewPort();
    port.opening = matchingStart();
    port.failNextFinishes = 1;
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.attempt(hit("book"));
    await controller.attempt(hit("house"));
    await controller.attempt(hit("river"));

    expect(controller.state).toMatchObject({ kind: "failed", retry: "finish" });

    await controller.leave();

    expect(port.abandons).toEqual(["review-1"]);
    expect(port.finishes).toEqual(["review-1"]);
  });
});

describe("review route boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");

  it("opens the session from the route instead of the unavailable activity", () => {
    const route = read("src/app/revisar.tsx");

    expect(route).not.toContain("UnavailableActivity");
    expect(route).toContain("ReviewScreen");
    expect(route).not.toMatch(/useState|useEffect|PairBoard|TypingCard/);
  });

  it("keeps one composition and the screen logic outside the route", () => {
    const screen = read("src/components/review/review-screen.tsx");
    const presentation = read("src/lib/presentation/review/review-screen.ts");
    const installed = read("src/composition/installed-review.ts");

    expect(presentation).not.toMatch(/from "(react|react-native|expo-[a-z-]+)"/);
    expect(screen).toContain("<TypingCard");
    expect(screen).toContain("<PairBoard");
    expect(screen).toMatch(/key=\{session\.gameSessionId\}/);
    expect(screen).toContain("cardsReady");
    expect(screen).toContain("pairsEntered");
    expect(screen).toContain("controller.attempt");
    expect(screen.match(/createInstalledReviewPort\(\)/g)).toHaveLength(1);
    expect(screen).toContain("createReviewAttemptId");
    expect(installed).toContain("createInstalledReview()");
    expect(installed).not.toMatch(/\bimport\s*\(/);
  });

  it("rereads the daily summary when the entry gains focus and keeps the four actions", () => {
    const home = read("src/components/home/home-entry-screen.tsx");
    const layout = homeEntryLayout({
      dueCount: 2,
      newAvailable: 1,
      nothingToReviewTitle: null,
      nextReviewDetail: null,
    });

    expect(home).toMatch(/useFocusEffect\(\s*useCallback\(\(\) => \{\s*retry\(\);/);
    expect(layout.actions.map((action) => [action.href, action.label])).toEqual([
      ["/revisar", "Revisar hoje"],
      ["/treino-livre", "Treino livre"],
      ["/desafio", "Desafio"],
      ["/palavras", "Palavras"],
    ]);
  });
});
