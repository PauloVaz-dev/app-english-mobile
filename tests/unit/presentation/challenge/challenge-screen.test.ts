/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HOME_ENTRY_METRICS, homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";
import type { Word } from "@/lib/domain/game/types";
import type { PairBoardAttempt } from "@/lib/presentation/game/pair-board-state";
import {
  CHALLENGE_EXHAUSTED_MESSAGE,
  CHALLENGE_INTRO,
  CHALLENGE_MIN_TOUCH_TARGET,
  CHALLENGE_RESULT_ACTIONS,
  CHALLENGE_TIME_UP_HOLD_MS,
  CHALLENGE_TIME_UP_MESSAGE,
  ChallengeScreenController,
  challengeBoardDisabled,
  challengeClockView,
  challengeResultView,
  challengeTimeAnnouncement,
  type ChallengeAttemptOutcome,
  type ChallengeOutcome,
  type ChallengeScreenAttempt,
  type ChallengeScreenPort,
  type ChallengeScreenState,
} from "@/lib/presentation/challenge/challenge-screen";

const OPENED_AT = new Date("2026-11-12T12:00:00.000Z");
const ROUND_MS = 60_000;

function at(offsetMs: number): Date {
  return new Date(OPENED_AT.getTime() + offsetMs);
}

function outcome(overrides: Partial<ChallengeOutcome> = {}): ChallengeOutcome {
  return {
    correctAnswers: 6,
    wrongAnswers: 2,
    accuracy: 75,
    bestStreak: 4,
    score: 640,
    previousBest: 500,
    isNewRecord: true,
    ...overrides,
  };
}

const WORDS: readonly Word[] = ["one", "two", "three"].map((english, index) => ({
  id: `word-${index}`,
  english,
  portuguese: `palavra-${index}`,
  exampleSentence: null,
  active: true,
}));

function boardAttempt(attemptId: string, wordId: string, selectedWordId = wordId): PairBoardAttempt {
  return {
    attemptId,
    promptWordId: wordId,
    selectedWordId,
    isCorrect: wordId === selectedWordId,
    responseTimeMs: 800,
  };
}

function accepted(score: number, streak: number, correctAnswers: number): ChallengeAttemptOutcome {
  return { kind: "accepted", score, streak, correctAnswers };
}

class FakeScreenPort implements ChallengeScreenPort {
  readonly calls: string[] = [];
  readonly attempts: { input: ChallengeScreenAttempt; now: Date }[] = [];
  /** Outcomes handed back in order; an Error is thrown instead. */
  readonly outcomes: (ChallengeAttemptOutcome | Error)[] = [];
  opening: "opened" | "insufficient" | "fail" = "opened";
  words: readonly Word[] = WORDS;
  private releaseBegin: (() => void) | null = null;
  holdBegin = false;
  expireFailure: Error | null = null;
  result: ChallengeOutcome = outcome();
  private nextId = 1;
  private releaseStart: (() => void) | null = null;
  holdStart = false;

  async start() {
    const id = `challenge-${this.nextId}`;
    this.nextId += 1;
    this.calls.push(`start:${id}`);
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
    return { kind: "opened" as const, challengeId: id, words: this.words };
  }

  finishStart() {
    this.releaseStart?.();
  }

  async begin(challengeId: string, now: Date) {
    this.calls.push(`begin:${challengeId}@${now.toISOString()}`);
    if (this.holdBegin) {
      await new Promise<void>((resolve) => {
        this.releaseBegin = resolve;
      });
    }
  }

  finishBegin() {
    this.releaseBegin?.();
  }

  async attempt(input: ChallengeScreenAttempt, now: Date): Promise<ChallengeAttemptOutcome> {
    this.calls.push(`attempt:${input.attemptId}`);
    this.attempts.push({ input, now });
    const next = this.outcomes.shift() ?? accepted(0, 0, 0);
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  async expire(challengeId: string, now: Date) {
    this.calls.push(`expire:${challengeId}@${now.toISOString()}`);
    if (this.expireFailure !== null) {
      throw this.expireFailure;
    }
    return this.result;
  }

  async abandon(challengeId: string, now: Date) {
    this.calls.push(`abandon:${challengeId}@${now.toISOString()}`);
  }
}

function controllerWith(port: ChallengeScreenPort, clock: { now: Date }) {
  const seen: ChallengeScreenState[] = [];
  const holds: number[] = [];
  const controller = new ChallengeScreenController({
    port,
    now: () => new Date(clock.now),
    wait: async (ms) => {
      holds.push(ms);
    },
    onChange: (state) => seen.push(state),
  });
  return { controller, seen, holds };
}

describe("challenge intro copy", () => {
  it("says the round lasts 60 seconds, aims at pairs and rewards the streak", () => {
    const text = CHALLENGE_INTRO.lines.join(" ");

    expect(text).toContain("60 segundos");
    expect(text).toContain("máximo de pares");
    expect(text).toContain("sequência");
    expect(text).toContain("pontos");
    expect(CHALLENGE_INTRO.startLabel).toBe("Começar");
  });

  it("keeps the review and the 20-word practice as separate paths", () => {
    const hrefs = homeEntryLayout({
      dueCount: 0,
      newAvailable: 0,
      nothingToReviewTitle: "Nada para revisar hoje",
      nextReviewDetail: null,
    }).actions.map(({ href }) => href);

    expect(hrefs).toEqual(["/revisar", "/treino-livre", "/desafio", "/palavras"]);
    expect(CHALLENGE_INTRO.calmerPath).toContain("revisão");
    expect(CHALLENGE_INTRO.calmerPath).toContain("treino livre");
  });

  it("keeps main targets at 44 points with names for screen readers", () => {
    expect(CHALLENGE_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
    expect(CHALLENGE_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
    for (const action of [
      CHALLENGE_INTRO.start,
      CHALLENGE_INTRO.leave,
      ...CHALLENGE_RESULT_ACTIONS,
    ]) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it("says the vocabulary ran out with its own message", () => {
    expect(CHALLENGE_EXHAUSTED_MESSAGE).toContain("acabaram");
    expect(CHALLENGE_EXHAUSTED_MESSAGE).toContain("tempo");
  });
});

describe("challenge clock", () => {
  it("shows the full minute while the cards are not touchable yet", () => {
    const view = challengeClockView(null, OPENED_AT);

    expect(view.waiting).toBe(true);
    expect(view.seconds).toBe(60);
    expect(view.label).toBe("1:00");
    expect(view.urgent).toBe(false);
  });

  it("derives the remaining time from the deadline, not from ticks", () => {
    const deadline = at(ROUND_MS);

    expect(challengeClockView(deadline, at(15_200)).seconds).toBe(45);
    expect(challengeClockView(deadline, at(15_200)).label).toBe("0:45");
    expect(challengeClockView(deadline, at(15_200)).accessibilityLabel).toBe(
      "Tempo restante: 45 segundos",
    );
  });

  it("writes the last ten seconds as a number, not only as color", () => {
    const deadline = at(ROUND_MS);
    const calm = challengeClockView(deadline, at(49_000));
    const urgent = challengeClockView(deadline, at(50_500));

    expect(calm.urgent).toBe(false);
    expect(calm.urgentText).toBeNull();
    expect(urgent.urgent).toBe(true);
    expect(urgent.seconds).toBe(10);
    expect(urgent.urgentText).toBe("Faltam 10 segundos");
    expect(challengeClockView(deadline, at(59_100)).urgentText).toBe("Falta 1 segundo");
  });

  it("stops at zero once the deadline passed", () => {
    const view = challengeClockView(at(ROUND_MS), at(ROUND_MS + 5_000));

    expect(view.seconds).toBe(0);
    expect(view.expired).toBe(true);
    expect(view.label).toBe("0:00");
  });

  it("announces the time at useful moments only", () => {
    expect(challengeTimeAnnouncement(46, 45)).toBeNull();
    expect(challengeTimeAnnouncement(31, 30)).toBe("Faltam 30 segundos");
    expect(challengeTimeAnnouncement(11, 10)).toBe("Faltam 10 segundos");
    expect(challengeTimeAnnouncement(9, 8)).toBeNull();
    expect(challengeTimeAnnouncement(40, 5)).toBe("Faltam 5 segundos");
    expect(challengeTimeAnnouncement(1, 0)).toBe(CHALLENGE_TIME_UP_MESSAGE);
    expect(challengeTimeAnnouncement(0, 0)).toBeNull();
  });
});

describe("challenge result copy", () => {
  it("shows hits, score, accuracy, best streak and a new record", () => {
    const view = challengeResultView(outcome());

    expect(view.rows).toEqual([
      { label: "Acertos", value: "6" },
      { label: "Pontuação", value: "640" },
      { label: "Precisão", value: "75%" },
      { label: "Maior sequência", value: "4" },
    ]);
    expect(view.isNewRecord).toBe(true);
    expect(view.recordText).toBe("Recorde novo! O anterior era 500 pontos.");
  });

  it("calls the first completed challenge a record", () => {
    const view = challengeResultView(outcome({ previousBest: null, isNewRecord: true }));

    expect(view.recordText).toBe("Recorde novo! É o seu primeiro desafio concluído.");
  });

  it("does not present a tie as a new record", () => {
    const view = challengeResultView(outcome({ score: 500, previousBest: 500, isNewRecord: false }));

    expect(view.isNewRecord).toBe(false);
    expect(view.recordText).toBe("Você empatou com o seu recorde de 500 pontos.");
    expect(view.recordText).not.toContain("novo");
  });

  it("shows the record that still stands below it", () => {
    const view = challengeResultView(outcome({ score: 300, previousBest: 500, isNewRecord: false }));

    expect(view.recordText).toBe("Seu recorde continua 500 pontos.");
  });

  it("rounds accuracy to a whole percent", () => {
    expect(challengeResultView(outcome({ accuracy: 66.666 })).rows[2]).toEqual({
      label: "Precisão",
      value: "67%",
    });
  });

  it("offers playing again and returning to the entry", () => {
    expect(CHALLENGE_RESULT_ACTIONS.map(({ kind }) => kind)).toEqual(["playAgain", "home"]);
  });
});

describe("challenge screen controller with a fake composition", () => {
  it("starts on the intro and opens a round that waits for the cards", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller, seen } = controllerWith(port, clock);

    expect(controller.state).toEqual({ kind: "intro" });

    await controller.start();

    expect(seen[0]).toEqual({ kind: "opening" });
    expect(controller.state).toEqual({
      kind: "round",
      challengeId: "challenge-1",
      words: WORDS,
      deadline: null,
      score: 0,
      streak: 0,
      halted: false,
      exhausted: false,
    });
  });

  it("starts the 60 seconds only when the board says the cards can be touched", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();

    clock.now = at(2_000);
    await controller.cardsReady();
    await controller.cardsReady();

    expect(port.calls.filter((call) => call.startsWith("begin"))).toEqual([
      `begin:challenge-1@${at(2_000).toISOString()}`,
    ]);
    expect(controller.state).toMatchObject({ kind: "round", deadline: at(62_000) });
  });

  it("shows the insufficient catalog state", async () => {
    const port = new FakeScreenPort();
    port.opening = "insufficient";
    const { controller } = controllerWith(port, { now: OPENED_AT });

    await controller.start();

    expect(controller.state).toEqual({ kind: "insufficientCatalog" });
  });

  it("keeps the intro reachable through retry when opening fails", async () => {
    const port = new FakeScreenPort();
    port.opening = "fail";
    const { controller } = controllerWith(port, { now: OPENED_AT });

    await controller.start();
    expect(controller.state).toEqual({ kind: "failed", retry: "start" });

    port.opening = "opened";
    await controller.retry();
    expect(controller.state).toMatchObject({ kind: "round", challengeId: "challenge-2" });
  });

  it("does nothing on refresh before the deadline, even after a jump from background", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();

    clock.now = at(40_000);
    await controller.refresh();

    expect(controller.state).toMatchObject({ kind: "round", deadline: at(ROUND_MS) });
    expect(port.calls.some((call) => call.startsWith("expire") || call.startsWith("abandon"))).toBe(
      false,
    );
  });

  it("shows that time is up before the result, with and without a new record", async () => {
    for (const result of [outcome(), outcome({ score: 500, previousBest: 500, isNewRecord: false })]) {
      const port = new FakeScreenPort();
      port.result = result;
      const clock = { now: OPENED_AT };
      const { controller, seen, holds } = controllerWith(port, clock);
      await controller.start();
      await controller.cardsReady();

      clock.now = at(ROUND_MS + 300);
      await controller.refresh();

      const kinds = seen.map(({ kind }) => kind);
      expect(kinds.indexOf("timeUp")).toBeGreaterThan(-1);
      expect(kinds.indexOf("timeUp")).toBeLessThan(kinds.indexOf("result"));
      expect(holds).toEqual([CHALLENGE_TIME_UP_HOLD_MS]);
      expect(controller.state).toEqual({
        kind: "result",
        result: challengeResultView(result),
      });
      expect(port.calls).toContain(`expire:challenge-1@${at(ROUND_MS + 300).toISOString()}`);
    }
  });

  it("expires once even when refresh repeats while the expiry is pending", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();

    clock.now = at(ROUND_MS);
    await Promise.all([controller.refresh(), controller.refresh()]);

    expect(port.calls.filter((call) => call.startsWith("expire"))).toHaveLength(1);
  });

  it("offers retry when the expiry cannot be stored", async () => {
    const port = new FakeScreenPort();
    port.expireFailure = new Error("disk is full");
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();

    clock.now = at(ROUND_MS);
    await controller.refresh();
    expect(controller.state).toEqual({ kind: "failed", retry: "expire" });

    port.expireFailure = null;
    await controller.retry();
    expect(controller.state.kind).toBe("result");
  });

  it("abandons the active round when the route is left", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();

    clock.now = at(20_000);
    await controller.leave();

    expect(port.calls).toContain(`abandon:challenge-1@${at(20_000).toISOString()}`);
    expect(port.calls.some((call) => call.startsWith("expire"))).toBe(false);
  });

  it("concludes instead of abandoning when the route is left after the deadline", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();

    clock.now = at(ROUND_MS + 1);
    await controller.leave();

    expect(port.calls.some((call) => call.startsWith("abandon"))).toBe(false);
    expect(port.calls).toContain(`expire:challenge-1@${at(ROUND_MS + 1).toISOString()}`);
  });

  it("abandons a round whose opening finishes after the route was left", async () => {
    const port = new FakeScreenPort();
    port.holdStart = true;
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);

    const opening = controller.start();
    await controller.leave();
    port.finishStart();
    await opening;

    expect(port.calls).toContain(`abandon:challenge-1@${OPENED_AT.toISOString()}`);
  });

  it("leaves nothing to abandon from the intro or the result", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.leave();

    await controller.start();
    await controller.cardsReady();
    clock.now = at(ROUND_MS);
    await controller.refresh();
    await controller.leave();

    expect(port.calls.some((call) => call.startsWith("abandon"))).toBe(false);
  });

  it("plays again from the result with a new session", async () => {
    const port = new FakeScreenPort();
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();
    await controller.cardsReady();
    clock.now = at(ROUND_MS);
    await controller.refresh();

    await controller.start();

    expect(controller.state).toMatchObject({ kind: "round", challengeId: "challenge-2", deadline: null });
  });
});

describe("challenge screen controller with the pair board", () => {
  async function roundReady(port = new FakeScreenPort(), clock = { now: OPENED_AT }) {
    const rig = controllerWith(port, clock);
    await rig.controller.start();
    await rig.controller.cardsReady();
    return { ...rig, port, clock };
  }

  it("hands the board's attempt to the composition with the board's attemptId and the tap time", async () => {
    const { controller, port, clock } = await roundReady();

    clock.now = at(3_000);
    await controller.attempt(boardAttempt("tap-1", "word-0", "word-1"));

    expect(port.attempts).toEqual([
      {
        input: {
          challengeId: "challenge-1",
          attemptId: "tap-1",
          promptWordId: "word-0",
          selectedWordId: "word-1",
        },
        now: at(3_000),
      },
    ]);
  });

  it("updates points and streak from the round the composition returns", async () => {
    const port = new FakeScreenPort();
    port.outcomes.push(accepted(100, 1, 1), accepted(210, 2, 2), accepted(210, 0, 2));
    const { controller } = await roundReady(port);

    await controller.attempt(boardAttempt("tap-1", "word-0"));
    expect(controller.state).toMatchObject({ kind: "round", score: 100, streak: 1 });

    await controller.attempt(boardAttempt("tap-2", "word-1"));
    expect(controller.state).toMatchObject({ kind: "round", score: 210, streak: 2 });

    await controller.attempt(boardAttempt("tap-3", "word-2", "word-0"));
    expect(controller.state).toMatchObject({ kind: "round", score: 210, streak: 0 });
  });

  it("sends attempts one at a time, in tap order, after the round began", async () => {
    const port = new FakeScreenPort();
    port.holdBegin = true;
    port.outcomes.push(accepted(100, 1, 1), accepted(210, 2, 2));
    const clock = { now: OPENED_AT };
    const { controller } = controllerWith(port, clock);
    await controller.start();

    const ready = controller.cardsReady();
    const first = controller.attempt(boardAttempt("tap-1", "word-0"));
    const second = controller.attempt(boardAttempt("tap-2", "word-1"));
    await Promise.resolve();
    expect(port.calls.filter((call) => call.startsWith("attempt"))).toEqual([]);

    port.finishBegin();
    await Promise.all([ready, first, second]);

    expect(port.calls.slice(-3)).toEqual([
      `begin:challenge-1@${OPENED_AT.toISOString()}`,
      "attempt:tap-1",
      "attempt:tap-2",
    ]);
    expect(controller.state).toMatchObject({ score: 210, streak: 2 });
  });

  it("ignores attempts outside a running round", async () => {
    const port = new FakeScreenPort();
    const { controller } = controllerWith(port, { now: OPENED_AT });

    await controller.attempt(boardAttempt("tap-0", "word-0"));
    await controller.start();
    await controller.attempt(boardAttempt("tap-1", "word-0"));

    expect(port.attempts).toEqual([]);
  });

  it("disables the board at zero and while a write is pending a retry", () => {
    const round = {
      kind: "round" as const,
      challengeId: "challenge-1",
      words: WORDS,
      deadline: at(ROUND_MS),
      score: 0,
      streak: 0,
      halted: false,
      exhausted: false,
    };

    expect(challengeBoardDisabled({ ...round, deadline: null }, OPENED_AT)).toBe(false);
    expect(challengeBoardDisabled(round, at(ROUND_MS - 1))).toBe(false);
    expect(challengeBoardDisabled(round, at(ROUND_MS))).toBe(true);
    expect(challengeBoardDisabled(round, at(ROUND_MS + 400))).toBe(true);
    expect(challengeBoardDisabled({ ...round, halted: true }, at(1_000))).toBe(true);
    expect(challengeBoardDisabled({ ...round, exhausted: true }, at(1_000))).toBe(true);
  });

  it("keeps the score when the composition refuses an attempt after the deadline", async () => {
    const port = new FakeScreenPort();
    port.outcomes.push(accepted(100, 1, 1), { kind: "late" });
    const { controller, clock } = await roundReady(port);

    await controller.attempt(boardAttempt("tap-1", "word-0"));
    clock.now = at(ROUND_MS + 1);
    await controller.attempt(boardAttempt("tap-late", "word-1"));

    expect(controller.state).toMatchObject({ kind: "round", score: 100, streak: 1, halted: false });
  });

  it("expires only after the attempts already tapped were answered", async () => {
    const port = new FakeScreenPort();
    let release: (value: ChallengeAttemptOutcome) => void = () => undefined;
    const slow = new Promise<ChallengeAttemptOutcome>((resolve) => {
      release = resolve;
    });
    const original = port.attempt.bind(port);
    port.attempt = async (input, now) => {
      await original(input, now);
      return slow;
    };
    const { controller, clock } = await roundReady(port);

    clock.now = at(ROUND_MS - 100);
    const tapped = controller.attempt(boardAttempt("tap-edge", "word-0"));
    clock.now = at(ROUND_MS);
    const expiring = controller.refresh();
    await Promise.resolve();
    expect(port.calls.some((call) => call.startsWith("expire"))).toBe(false);

    release(accepted(100, 1, 1));
    await Promise.all([tapped, expiring]);

    expect(port.calls.slice(-2)).toEqual([
      "attempt:tap-edge",
      `expire:challenge-1@${at(ROUND_MS).toISOString()}`,
    ]);
    expect(controller.state.kind).toBe("result");
  });

  it("shows the exhausted vocabulary once every drawn word was hit, then the result at zero", async () => {
    const port = new FakeScreenPort();
    port.outcomes.push(accepted(100, 1, 1), accepted(210, 2, 2), accepted(330, 3, 3));
    const { controller, clock, seen } = await roundReady(port);

    await controller.attempt(boardAttempt("tap-1", "word-0"));
    await controller.attempt(boardAttempt("tap-2", "word-1"));
    expect(controller.state).toMatchObject({ exhausted: false });
    await controller.attempt(boardAttempt("tap-3", "word-2"));

    expect(controller.state).toMatchObject({ kind: "round", exhausted: true, score: 330 });
    clock.now = at(30_000);
    await controller.refresh();
    expect(controller.state).toMatchObject({ kind: "round", exhausted: true });
    expect(port.calls.some((call) => call.startsWith("expire") || call.startsWith("abandon"))).toBe(
      false,
    );

    clock.now = at(ROUND_MS);
    await controller.refresh();
    const kinds = seen.map(({ kind }) => kind);
    expect(kinds.indexOf("timeUp")).toBeLessThan(kinds.indexOf("result"));
    expect(controller.state.kind).toBe("result");
  });

  it("pauses the board on a failed write and resends the same attempt on retry", async () => {
    const port = new FakeScreenPort();
    port.outcomes.push(new Error("disk is full"), accepted(100, 1, 1), accepted(210, 2, 2));
    const { controller, clock } = await roundReady(port);

    clock.now = at(4_000);
    await controller.attempt(boardAttempt("tap-1", "word-0"));
    expect(controller.state).toMatchObject({ kind: "round", halted: true, score: 0 });

    clock.now = at(5_000);
    await controller.attempt(boardAttempt("tap-2", "word-1"));
    expect(port.attempts.map(({ input }) => input.attemptId)).toEqual(["tap-1"]);

    clock.now = at(9_000);
    await controller.retry();

    expect(port.attempts.map(({ input, now }) => [input.attemptId, now])).toEqual([
      ["tap-1", at(4_000)],
      ["tap-1", at(4_000)],
      ["tap-2", at(5_000)],
    ]);
    expect(controller.state).toMatchObject({ kind: "round", halted: false, score: 210, streak: 2 });
  });
});

describe("challenge route boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");
  const screenFiles = [
    "src/app/desafio.tsx",
    "src/components/challenge/challenge-screen.tsx",
    "src/lib/presentation/challenge/challenge-screen.ts",
  ];

  it("no longer shows the foundation's unavailable activity", () => {
    const route = read("src/app/desafio.tsx");

    expect(route).not.toContain("UnavailableActivity");
    expect(route).toContain("ChallengeScreen");
  });

  it("does not decide hits, misses or replacement outside the pairing rules", () => {
    for (const file of screenFiles) {
      const source = read(file);
      expect(source).not.toMatch(/promptWordId\s*[!=]==|[!=]==\s*[\w.]*selectedWordId/);
      expect(source).not.toMatch(/isCorrect|resolveBoardSelection|createGameBoard|game-engine/);
    }
  });

  it("draws the PairBoard instead of the reserved area and its provisional text", () => {
    const component = read("src/components/challenge/challenge-screen.tsx");
    const presentation = read("src/lib/presentation/challenge/challenge-screen.ts");

    expect(component).toContain("<PairBoard");
    expect(component).toMatch(/key=\{round\.challengeId\}/);
    expect(component).toMatch(/onReady[^\n]*controller\.cardsReady\(\)/);
    expect(component).toMatch(/createAttemptId=\{createChallengeAttemptId\}/);
    expect(component).toMatch(/disabled=\{challengeBoardDisabled\(/);
    for (const source of [component, presentation]) {
      expect(source).not.toContain("CHALLENGE_BOARD_PENDING");
      expect(source).not.toContain("jogo de pareamento");
    }
  });

  it("records no exposure for the challenge", () => {
    for (const file of [...screenFiles, "src/composition/challenge.ts"]) {
      expect(read(file)).not.toMatch(/expose|GameSessionWord|GameAnswer|LearnerWordProgress/);
    }
  });

  it("does not load native modules dynamically", () => {
    for (const file of [...screenFiles, "src/composition/installed-challenge.ts"]) {
      expect(read(file)).not.toMatch(/import\(/);
    }
  });
});
