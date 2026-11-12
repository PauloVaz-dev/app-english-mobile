/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createWord, type Word } from "@/lib/domain/game/types";
import { HOME_ENTRY_METRICS, homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";
import {
  PRACTICE_INSUFFICIENT_MESSAGE,
  PRACTICE_INTRO,
  PRACTICE_MIN_TOUCH_TARGET,
  PRACTICE_PERSIST_FAILED_MESSAGE,
  PRACTICE_RESULT_ACTIONS,
  PRACTICE_RESULT_TEXT,
  PracticeScreenController,
  practiceHeaderView,
  practiceResultView,
  type PracticeAttemptOutcome,
  type PracticeBoardAttempt,
  type PracticeOutcome,
  type PracticeScreenAttempt,
  type PracticeScreenPort,
  type PracticeScreenState,
} from "@/lib/presentation/game/practice-screen";
import type { ReviewWordView } from "@/lib/application/game/session-view";

const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");
const TARGET = 20;

function at(offsetMs: number): Date {
  return new Date(OPENED_AT.getTime() + offsetMs);
}

function words(count = TARGET): readonly Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({ id: `w${index}`, english: `english-${index}`, portuguese: `pt-${index}` }),
  );
}

function reviewWord(overrides: Partial<ReviewWordView> = {}): ReviewWordView {
  return {
    wordId: "w1",
    english: "house",
    portuguese: "casa",
    wrongAnswers: 2,
    timeToCorrectMs: 4_120,
    difficulty: "HARD",
    ...overrides,
  };
}

function outcome(overrides: Partial<PracticeOutcome> = {}): PracticeOutcome {
  return {
    durationMs: 95_400,
    correctAnswers: 20,
    wrongAnswers: 5,
    accuracy: 80,
    averageResponseTimeMs: 1_640,
    reviewWords: [reviewWord()],
    praiseWords: [
      reviewWord({
        wordId: "w2",
        english: "bird",
        portuguese: "pássaro",
        wrongAnswers: 0,
        timeToCorrectMs: 1_200,
      }),
    ],
    ...overrides,
  };
}

type Call = string;

class FakePracticePort implements PracticeScreenPort {
  readonly calls: Call[] = [];
  opening: "opened" | "insufficient" | "fail" = "opened";
  failNextWrites = 0;
  resultFailure: Error | null = null;
  storedOutcome: PracticeOutcome = outcome();
  holdStart = false;
  private nextId = 1;
  private releaseStart: (() => void) | null = null;
  private readonly hits = new Map<string, Set<string>>();
  private readonly stored = new Set<string>();

  async start() {
    const sessionId = `practice-${this.nextId}`;
    this.nextId += 1;
    this.calls.push(`start:${sessionId}`);
    if (this.holdStart) {
      await new Promise<void>((resolve) => {
        this.releaseStart = resolve;
      });
    }
    if (this.opening === "fail") {
      throw new Error("disk is full");
    }
    if (this.opening === "insufficient") {
      return { kind: "insufficientCatalog" as const };
    }
    return { kind: "opened" as const, sessionId, targetWords: TARGET, words: words() };
  }

  finishStart() {
    this.releaseStart?.();
  }

  async expose(sessionId: string, wordIds: readonly string[]) {
    this.calls.push(`expose:${sessionId}:${wordIds.join(",")}`);
    this.maybeFail();
  }

  async attempt(input: PracticeScreenAttempt): Promise<PracticeAttemptOutcome> {
    this.calls.push(`attempt:${input.attemptId}`);
    this.maybeFail();
    const hits = this.hits.get(input.sessionId) ?? new Set<string>();
    this.hits.set(input.sessionId, hits);
    if (!this.stored.has(input.attemptId) && input.promptWordId === input.selectedWordId) {
      hits.add(input.promptWordId);
    }
    this.stored.add(input.attemptId);
    return { status: hits.size >= TARGET ? "COMPLETED" : "ACTIVE" };
  }

  async abandon(sessionId: string) {
    this.calls.push(`abandon:${sessionId}`);
  }

  async result(sessionId: string) {
    this.calls.push(`result:${sessionId}`);
    if (this.resultFailure !== null) {
      throw this.resultFailure;
    }
    return this.storedOutcome;
  }

  private maybeFail() {
    if (this.failNextWrites > 0) {
      this.failNextWrites -= 1;
      throw new Error("disk is full");
    }
  }
}

function controllerWith(port: PracticeScreenPort, clock = { now: OPENED_AT }) {
  const seen: PracticeScreenState[] = [];
  const controller = new PracticeScreenController({
    port,
    now: () => new Date(clock.now),
    onChange: (state) => seen.push(state),
  });
  return { controller, seen, clock };
}

function hit(index: number, attemptId = `hit-${index}`): PracticeBoardAttempt {
  return {
    attemptId,
    promptWordId: `w${index}`,
    selectedWordId: `w${index}`,
    isCorrect: true,
    responseTimeMs: 900,
  };
}

function miss(index: number, attemptId = `miss-${index}`): PracticeBoardAttempt {
  return {
    attemptId,
    promptWordId: `w${index}`,
    selectedWordId: `w${index + 1}`,
    isCorrect: false,
    responseTimeMs: 700,
  };
}

function match(controller: PracticeScreenController) {
  const state = controller.state;
  if (state.kind !== "match") {
    throw new Error(`Expected a match, got ${state.kind}.`);
  }
  return state.match;
}

async function playToTheEnd(controller: PracticeScreenController) {
  await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);
  for (let index = 0; index < TARGET; index += 1) {
    await controller.attempt(hit(index));
    if (index + 5 < TARGET) {
      await controller.pairsEntered([`w${index + 5}`]);
    }
  }
}

describe("practice intro", () => {
  it("starts with one tap, without choosing size, deck or difficulty", () => {
    const text = PRACTICE_INTRO.lines.join(" ");

    expect(PRACTICE_INTRO.title).toBe("Treino livre");
    expect(text).toContain("20 palavras");
    expect(PRACTICE_INTRO.start.label).toBe("Começar");
    expect(Object.keys(PRACTICE_INTRO)).not.toEqual(
      expect.arrayContaining(["size", "deck", "difficulty"]),
    );
  });

  it("keeps the targets at 44 points with names for screen readers", () => {
    expect(PRACTICE_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
    expect(PRACTICE_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
    for (const action of [
      PRACTICE_INTRO.start,
      PRACTICE_INTRO.leave,
      PRACTICE_INTRO.retry,
      ...PRACTICE_RESULT_ACTIONS,
    ]) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it("keeps the same four actions on the entry", () => {
    const hrefs = homeEntryLayout({
      dueCount: 0,
      newAvailable: 0,
      nothingToReviewTitle: "Nada para revisar hoje",
      nextReviewDetail: null,
    }).actions.map(({ href }) => href);

    expect(hrefs).toEqual(["/revisar", "/treino-livre", "/desafio", "/palavras"]);
  });
});

describe("practice screen controller with a fake composition", () => {
  it("opens a match of 20 words from the intro with one tap", async () => {
    const port = new FakePracticePort();
    const { controller, seen } = controllerWith(port);

    expect(controller.state).toEqual({ kind: "intro" });
    await controller.start();

    expect(seen[0]).toEqual({ kind: "opening" });
    expect(match(controller)).toMatchObject({
      sessionId: "practice-1",
      targetWords: TARGET,
      correctAnswers: 0,
      wrongAnswers: 0,
      startedAt: OPENED_AT,
      stoppedAt: null,
      halted: false,
    });
    expect(match(controller).words).toHaveLength(TARGET);
    expect(port.calls).toEqual(["start:practice-1"]);
  });

  it("records the first cards and every replacement as exposures", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();

    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);
    await controller.attempt(hit(0));
    await controller.pairsEntered(["w5"]);

    expect(port.calls.slice(1)).toEqual([
      "expose:practice-1:w0,w1,w2,w3,w4",
      "attempt:hit-0",
      "expose:practice-1:w5",
    ]);
  });

  it("counts hits, misses and progress in the header right away", async () => {
    const port = new FakePracticePort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);

    void controller.attempt(miss(0));
    void controller.attempt(hit(0));
    clock.now = at(65_000);

    const header = practiceHeaderView(match(controller), clock.now);
    expect(header.clock.label).toBe("01:05");
    expect(header.clock.accessibilityLabel).toBe("Tempo decorrido: 1 minuto e 5 segundos");
    expect(header.stats).toEqual([
      { label: "Acertos", value: "1", accessibilityLabel: "Acertos: 1" },
      { label: "Erros", value: "1", accessibilityLabel: "Erros: 1" },
      { label: "Progresso", value: "1/20", accessibilityLabel: "Progresso: 1 de 20 palavras" },
    ]);
  });

  it("starts the clock with the match and stops it at the 20th hit", async () => {
    const port = new FakePracticePort();
    port.resultFailure = new Error("hold the match on screen");
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    expect(practiceHeaderView(match(controller), at(0)).clock.label).toBe("00:00");

    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);
    for (let index = 0; index < TARGET - 1; index += 1) {
      await controller.attempt(hit(index));
    }
    clock.now = at(42_000);
    const last = controller.attempt(hit(TARGET - 1));
    const stopped = match(controller);

    expect(stopped.stoppedAt).toEqual(at(42_000));
    expect(practiceHeaderView(stopped, at(99_000)).clock.label).toBe("00:42");
    expect(practiceHeaderView(stopped, at(99_000)).boardDisabled).toBe(true);
    await last;
  });

  it("shows the result after the 20th hit is stored", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();

    await playToTheEnd(controller);

    expect(port.calls).toContain("result:practice-1");
    expect(controller.state).toEqual({
      kind: "result",
      result: practiceResultView(port.storedOutcome),
    });
    expect(port.calls.some((call) => call.startsWith("abandon"))).toBe(false);
  });

  it("pauses the match on a failed write and resends the failed one and the next in order", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);

    port.failNextWrites = 2;
    // The board fires both taps before the first write answers.
    await Promise.all([controller.attempt(miss(0)), controller.attempt(hit(0))]);
    const halted = port.calls.length;
    await controller.attempt(hit(1));
    expect(port.calls).toHaveLength(halted);

    expect(match(controller).halted).toBe(true);
    expect(practiceHeaderView(match(controller), OPENED_AT).boardDisabled).toBe(true);
    expect(PRACTICE_PERSIST_FAILED_MESSAGE).toContain("salvar");
    expect(PRACTICE_INTRO.retry.label).toBe("Tentar de novo");

    await controller.retry();

    expect(match(controller).halted).toBe(false);
    expect(port.calls.slice(-3)).toEqual(["attempt:miss-0", "attempt:hit-0", "attempt:hit-1"]);
    expect(port.calls.filter((call) => call === "attempt:hit-0")).toHaveLength(2);
    expect(match(controller)).toMatchObject({ correctAnswers: 2, wrongAnswers: 1 });
  });

  it("keeps a retried attempt counted once and reaches the result after a failure on the last hit", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);
    for (let index = 0; index < TARGET - 1; index += 1) {
      await controller.attempt(hit(index));
    }

    port.failNextWrites = 1;
    await controller.attempt(hit(TARGET - 1));
    expect(match(controller).halted).toBe(true);

    await controller.retry();

    expect(controller.state.kind).toBe("result");
    expect(port.calls.filter((call) => call === `attempt:hit-${TARGET - 1}`)).toHaveLength(2);
  });

  it("offers retry when the start fails and opens a new match on retry", async () => {
    const port = new FakePracticePort();
    port.opening = "fail";
    const { controller } = controllerWith(port);

    await controller.start();
    expect(controller.state).toEqual({ kind: "failed", retry: "start" });

    port.opening = "opened";
    await controller.retry();
    expect(match(controller).sessionId).toBe("practice-2");
  });

  it("offers retry when the result cannot be read", async () => {
    const port = new FakePracticePort();
    port.resultFailure = new Error("disk is full");
    const { controller } = controllerWith(port);
    await controller.start();
    await playToTheEnd(controller);

    expect(controller.state).toEqual({ kind: "failed", retry: "result" });

    port.resultFailure = null;
    await controller.retry();
    expect(controller.state.kind).toBe("result");
  });

  it("shows its own message when the catalog has fewer than 20 active words", async () => {
    const port = new FakePracticePort();
    port.opening = "insufficient";
    const { controller } = controllerWith(port);

    await controller.start();

    expect(controller.state).toEqual({ kind: "insufficientCatalog" });
    expect(PRACTICE_INSUFFICIENT_MESSAGE).toContain("20");
  });

  it("abandons the active match when the route is left", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.cardsReady(["w0", "w1", "w2", "w3", "w4"]);
    await controller.attempt(hit(0));

    await controller.leave();

    expect(port.calls.at(-1)).toBe("abandon:practice-1");
    expect(controller.state).toEqual({ kind: "intro" });
  });

  it("abandons a match whose opening finishes after the route was left", async () => {
    const port = new FakePracticePort();
    port.holdStart = true;
    const { controller } = controllerWith(port);

    const opening = controller.start();
    await controller.leave();
    port.finishStart();
    await opening;

    expect(port.calls).toContain("abandon:practice-1");
    expect(controller.state).toEqual({ kind: "intro" });
  });

  it("leaves nothing to abandon from the intro or after the match is complete", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.leave();

    await controller.start();
    await playToTheEnd(controller);
    await controller.leave();

    expect(port.calls.some((call) => call.startsWith("abandon"))).toBe(false);
  });

  it("ignores board events of a match that was left", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();
    await controller.leave();
    const before = port.calls.length;

    await controller.cardsReady(["w0"]);
    await controller.attempt(hit(0));

    expect(port.calls).toHaveLength(before);
  });

  it("plays again from the result with a new session and a single opening", async () => {
    const port = new FakePracticePort();
    const { controller } = controllerWith(port);
    await controller.start();
    await playToTheEnd(controller);

    await Promise.all([controller.start(), controller.start()]);

    expect(match(controller)).toMatchObject({ sessionId: "practice-2", correctAnswers: 0 });
    expect(port.calls.filter((call) => call.startsWith("start"))).toHaveLength(2);
  });
});

describe("practice result copy", () => {
  it("shows duration, hits, misses, accuracy and average time in that order", () => {
    const view = practiceResultView(outcome());

    expect(view.title).toBe(PRACTICE_RESULT_TEXT.title);
    expect(view.rows).toEqual([
      { label: "Duração", value: "01:35" },
      { label: "Acertos", value: "20" },
      { label: "Erros", value: "5" },
      { label: "Precisão", value: "80%" },
      { label: "Tempo médio", value: "1.6 s" },
    ]);
  });

  it("lists what to review first and then what went well", () => {
    const view = practiceResultView(outcome());

    expect(view.sections.map(({ title }) => title)).toEqual(["Precisa revisar", "Mandou bem"]);
    const [review, praise] = view.sections;
    expect(review?.items).toEqual([
      {
        key: "w1",
        english: "house",
        portuguese: "casa",
        details: ["2 erros", "4.1 s"],
        accessibilityLabel: "house, casa. 2 erros. Tempo até o acerto: 4.1 s.",
      },
    ]);
    expect(praise?.items).toEqual([
      {
        key: "w2",
        english: "bird",
        portuguese: "pássaro",
        details: ["100%", "1.2 s"],
        accessibilityLabel: "bird, pássaro. Precisão: 100%. Tempo até o acerto: 1.2 s.",
      },
    ]);
  });

  it("says there was no highlight instead of an empty list", () => {
    const view = practiceResultView(outcome({ reviewWords: [], praiseWords: [] }));
    const [review, praise] = view.sections;

    expect(review?.items).toEqual([]);
    expect(review?.emptyText).toBe(PRACTICE_RESULT_TEXT.reviewEmpty);
    expect(praise?.items).toEqual([]);
    expect(praise?.emptyText).toBe(PRACTICE_RESULT_TEXT.praiseEmpty);
    expect(PRACTICE_RESULT_TEXT.praiseEmpty).toContain("destac");
  });

  it("names an unfinished word and a single miss", () => {
    const view = practiceResultView(
      outcome({ reviewWords: [reviewWord({ wrongAnswers: 1, timeToCorrectMs: null })] }),
    );

    expect(view.sections[0]?.items[0]?.details).toEqual(["1 erro", "não concluída"]);
  });

  it("does not show difficulty, weights or sample sizes", () => {
    const text = JSON.stringify(practiceResultView(outcome()));

    expect(text).not.toMatch(/Difícil|HARD|amostra|peso/i);
  });

  it("offers playing again and returning to the entry", () => {
    expect(PRACTICE_RESULT_ACTIONS.map(({ kind }) => kind)).toEqual(["playAgain", "home"]);
  });
});

describe("practice route boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");
  const screenFiles = [
    "src/app/treino-livre.tsx",
    "src/components/game/practice-screen.tsx",
    "src/lib/presentation/game/practice-screen.ts",
  ];

  it("no longer shows the foundation's unavailable activity", () => {
    const route = read("src/app/treino-livre.tsx");

    expect(route).not.toContain("UnavailableActivity");
    expect(route).toContain("PracticeScreen");
  });

  it("keeps the route thin and the screen logic out of src/app", () => {
    const route = read("src/app/treino-livre.tsx");

    expect(route).not.toMatch(/useState|useEffect|PairBoard|composition/);
  });

  it("mounts the board once per session and records through the controller", () => {
    const screen = read("src/components/game/practice-screen.tsx");

    expect(screen).toContain("<PairBoard");
    expect(screen).toMatch(/key=\{[^}]*sessionId\}/);
    expect(screen).toContain("createInstalledPracticePort");
    expect(screen).toContain("createPracticeAttemptId");
  });

  it("does not decide hits outside the board rules", () => {
    for (const file of screenFiles) {
      expect(read(file)).not.toMatch(
        /promptWordId\s*===|===\s*\w*\.?selectedWordId|resolveBoardSelection/,
      );
    }
  });

  it("does not load native modules dynamically and keeps device access in installed files", () => {
    for (const file of [...screenFiles, "src/composition/installed-practice.ts"]) {
      expect(read(file)).not.toMatch(/import\(/);
    }
    expect(read("src/lib/presentation/game/practice-screen.ts")).not.toMatch(
      /from "(react|react-native|expo-[a-z-]+)"/,
    );
    expect(read("src/components/game/practice-screen.tsx")).not.toMatch(/from "expo-crypto"/);
  });
});
