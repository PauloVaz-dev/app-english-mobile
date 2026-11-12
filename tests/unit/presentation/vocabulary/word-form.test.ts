/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RegisterWordOutcome, WordRegistration } from "@/composition/word-registration";
import type { VocabularyTextInput } from "@/lib/domain/vocabulary";
import { HOME_ENTRY_METRICS, homeEntryLayout } from "@/lib/presentation/home/home-entry-layout";
import {
  WORD_FORM_BACK,
  WORD_FORM_FAILED_MESSAGE,
  WORD_FORM_MIN_TOUCH_TARGET,
  WORD_FORM_TITLE,
  WordFormController,
  wordFormView,
  type WordFormField,
  type WordFormState,
} from "@/lib/presentation/vocabulary/word-form";

const LONG_TERM = "a".repeat(81);
const LONG_SENTENCE = "b".repeat(241);

type Step = { kind: "outcome"; outcome: RegisterWordOutcome } | { kind: "fail" } | { kind: "hold" };

class FakeRegistration implements WordRegistration {
  readonly calls: VocabularyTextInput[] = [];
  readonly steps: Step[] = [];
  private release: (() => void) | null = null;

  register(input: VocabularyTextInput): Promise<RegisterWordOutcome> {
    this.calls.push(input);
    const step = this.steps.shift() ?? created(input);
    if (step.kind === "fail") {
      return Promise.reject(new Error("disk is full"));
    }
    if (step.kind === "hold") {
      return new Promise((resolve) => {
        this.release = () => resolve(created(input).outcome);
      });
    }
    return Promise.resolve(step.outcome);
  }

  finish(): void {
    this.release?.();
    this.release = null;
  }
}

function created(input: VocabularyTextInput): { kind: "outcome"; outcome: RegisterWordOutcome } {
  return {
    kind: "outcome",
    outcome: {
      kind: "created",
      word: { id: "w1", english: input.english.trim(), portuguese: input.portuguese.trim() },
    },
  };
}

interface Rig {
  readonly controller: WordFormController;
  readonly registration: FakeRegistration;
  readonly log: string[];
  readonly states: WordFormState[];
}

function rig(): Rig {
  const registration = new FakeRegistration();
  const log: string[] = [];
  const states: WordFormState[] = [];
  const controller = new WordFormController({
    registration,
    onChange: (state) => states.push(state),
    focus: (field: WordFormField) => log.push(`focus:${field}`),
    announce: (message: string) => log.push(`announce:${message}`),
  });
  return { controller, registration, log, states };
}

function fill(controller: WordFormController, english: string, portuguese: string, sentence = "") {
  controller.change("english", english);
  controller.change("portuguese", portuguese);
  controller.change("exampleSentence", sentence);
}

function field(state: WordFormState, name: WordFormField) {
  const view = wordFormView(state).fields.find((item) => item.field === name);
  if (view === undefined) {
    throw new Error(`Missing field ${name}.`);
  }
  return view;
}

describe("word form layout", () => {
  it("says it adds a new word and lists English, Portuguese and the optional sentence in order", () => {
    const view = wordFormView(rig().controller.state);

    expect(view.title).toBe(WORD_FORM_TITLE);
    expect(view.title).toMatch(/palavra nova/i);
    expect(view.fields.map((item) => item.field)).toEqual(["english", "portuguese", "exampleSentence"]);
    expect(view.fields.map((item) => item.accessibilityLabel)).toEqual([
      "Inglês, obrigatório",
      "Português, obrigatório",
      "Frase de exemplo, opcional",
    ]);
    expect(view.fields.map((item) => item.marker)).toEqual(["obrigatório", "obrigatório", "opcional"]);
    expect(view.fields.every((item) => item.error === null && item.accessibilityHint === undefined)).toBe(
      true,
    );
    expect(view.notice).toBeNull();
  });

  it("makes Adicionar the main action and Voltar a return without saving", () => {
    const view = wordFormView(rig().controller.state);

    expect(view.submit).toMatchObject({ label: "Adicionar", disabled: false });
    expect(view.submit.accessibilityLabel).toMatch(/Adicionar/);
    expect(WORD_FORM_BACK.label).toBe("Voltar");
    expect(WORD_FORM_BACK.accessibilityLabel).toMatch(/sem salvar/);
  });

  it("keeps touch targets at 44 points like the entry", () => {
    expect(WORD_FORM_MIN_TOUCH_TARGET).toBe(HOME_ENTRY_METRICS.minTouchTarget);
    expect(WORD_FORM_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});

describe("word form controller", () => {
  it("shows both required errors, keeps the text, focuses English and never calls the database", async () => {
    const { controller, registration, log } = rig();
    fill(controller, "   ", "", "A sentence kept.");

    await controller.submit();

    const state = controller.state;
    expect(field(state, "english").error).toBe("Escreva a palavra em inglês.");
    expect(field(state, "portuguese").error).toBe("Escreva a tradução em português.");
    expect(field(state, "english").accessibilityHint).toBe("Escreva a palavra em inglês.");
    expect(field(state, "exampleSentence").error).toBeNull();
    expect(state.values).toEqual({ english: "   ", portuguese: "", exampleSentence: "A sentence kept." });
    expect(registration.calls).toEqual([]);
    expect(log).toEqual(["focus:english"]);
  });

  it("focuses the first invalid field when only a later one fails", async () => {
    const { controller, log } = rig();
    fill(controller, "house", LONG_TERM);

    await controller.submit();

    expect(field(controller.state, "english").error).toBeNull();
    expect(field(controller.state, "portuguese").error).toBe(
      "Use no máximo 80 caracteres em português.",
    );
    expect(log).toEqual(["focus:portuguese"]);
  });

  it("names the limits of English and of the sentence", async () => {
    const { controller, log } = rig();
    fill(controller, LONG_TERM, "casa", LONG_SENTENCE);

    await controller.submit();

    expect(field(controller.state, "english").error).toBe("Use no máximo 80 caracteres em inglês.");
    expect(field(controller.state, "exampleSentence").error).toBe(
      "Use no máximo 240 caracteres na frase.",
    );
    expect(log).toEqual(["focus:english"]);
  });

  it("treats an invalid outcome from the composition like the local check", async () => {
    const { controller, registration, log } = rig();
    registration.steps.push({
      kind: "outcome",
      outcome: { kind: "invalid", issues: [{ field: "portuguese", reason: "required" }] },
    });
    fill(controller, "house", "casa");

    await controller.submit();

    expect(field(controller.state, "portuguese").error).toBe("Escreva a tradução em português.");
    expect(controller.state.values.english).toBe("house");
    expect(controller.state.saving).toBe(false);
    expect(log).toEqual(["focus:portuguese"]);
  });

  it("names the stored duplicate on both fields, keeps the text and announces it", async () => {
    const { controller, registration, log } = rig();
    registration.steps.push({
      kind: "outcome",
      outcome: { kind: "duplicate", existing: { english: "New York", portuguese: "Nova York" } },
    });
    fill(controller, "newyork", "nova york");

    await controller.submit();

    const message = "Já cadastrada: New York — Nova York.";
    expect(field(controller.state, "english").error).toBe(message);
    expect(field(controller.state, "portuguese").error).toBe(message);
    expect(field(controller.state, "portuguese").accessibilityHint).toBe(message);
    expect(field(controller.state, "exampleSentence").error).toBeNull();
    expect(controller.state.values).toMatchObject({ english: "newyork", portuguese: "nova york" });
    expect(log).toEqual([
      "focus:english",
      "announce:Esta palavra já está cadastrada: New York — Nova York.",
    ]);
  });

  it("clears the three fields after success, shows the message and announces it", async () => {
    const { controller, registration, log } = rig();
    fill(controller, " house ", "casa", "My house is blue.");

    await controller.submit();

    expect(registration.calls).toEqual([
      { english: " house ", portuguese: "casa", exampleSentence: "My house is blue." },
    ]);
    expect(controller.state.values).toEqual({ english: "", portuguese: "", exampleSentence: "" });
    expect(wordFormView(controller.state).notice).toEqual({
      tone: "success",
      message: "Palavra adicionada: house — casa.",
    });
    expect(log).toEqual(["focus:english", "announce:Palavra adicionada: house — casa."]);
  });

  it("hides the success message when the next word is typed", async () => {
    const { controller } = rig();
    fill(controller, "house", "casa");
    await controller.submit();

    controller.change("english", "d");

    expect(wordFormView(controller.state).notice).toBeNull();
    expect(controller.state.values.english).toBe("d");
  });

  it("hides the success message when an error appears", async () => {
    const { controller } = rig();
    fill(controller, "house", "casa");
    await controller.submit();

    await controller.submit();

    expect(wordFormView(controller.state).notice).toBeNull();
    expect(field(controller.state, "english").error).not.toBeNull();
  });

  it("keeps the text on a failed save, offers to try again and lets it succeed", async () => {
    const { controller, registration, log } = rig();
    registration.steps.push({ kind: "fail" });
    fill(controller, "house", "casa", "My house.");

    await controller.submit();

    expect(controller.state.values).toEqual({
      english: "house",
      portuguese: "casa",
      exampleSentence: "My house.",
    });
    const view = wordFormView(controller.state);
    expect(view.notice).toEqual({ tone: "alert", message: WORD_FORM_FAILED_MESSAGE });
    expect(WORD_FORM_FAILED_MESSAGE).toBe("Não foi possível salvar. Tente de novo.");
    expect(view.submit).toMatchObject({ label: "Tentar de novo", disabled: false });
    expect(log).toEqual([`announce:${WORD_FORM_FAILED_MESSAGE}`]);

    await controller.submit();

    expect(registration.calls).toHaveLength(2);
    expect(controller.state.values.english).toBe("");
    expect(wordFormView(controller.state).submit.label).toBe("Adicionar");
  });

  it("blocks the button while saving and ignores a second tap", async () => {
    const { controller, registration } = rig();
    registration.steps.push({ kind: "hold" });
    fill(controller, "house", "casa");

    const first = controller.submit();
    expect(controller.state.saving).toBe(true);
    expect(wordFormView(controller.state).submit).toMatchObject({ disabled: true, label: "Salvando…" });

    await controller.submit();
    expect(registration.calls).toHaveLength(1);

    registration.finish();
    await first;
    expect(controller.state.saving).toBe(false);
    expect(wordFormView(controller.state).submit.disabled).toBe(false);
  });

  it("publishes every change to the screen", async () => {
    const { controller, states } = rig();
    controller.change("english", "h");

    expect(states.at(-1)?.values.english).toBe("h");
  });

  it("registers ten words in a row without leaving the form", async () => {
    const { controller, registration } = rig();
    for (let index = 0; index < 10; index += 1) {
      fill(controller, `word-${index}`, `palavra-${index}`);
      await controller.submit();
      expect(controller.state.values.english).toBe("");
    }

    expect(registration.calls).toHaveLength(10);
  });
});

describe("words route boundary", () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), "utf8");

  it("no longer shows the unavailable activity and keeps the route thin", () => {
    const route = read("src/app/palavras.tsx");

    expect(route).not.toContain("UnavailableActivity");
    expect(route).toContain("WordFormScreen");
    expect(route).not.toMatch(/useState|useEffect|createInstalledWordRegistration/);
  });

  it("keeps the entry with the same four actions", () => {
    const layout = homeEntryLayout({
      dueCount: 0,
      newAvailable: 0,
      nothingToReviewTitle: null,
      nextReviewDetail: null,
    });

    expect(layout.actions.map(({ href }) => href)).toEqual([
      "/revisar",
      "/treino-livre",
      "/desafio",
      "/palavras",
    ]);
  });

  it("keeps the form logic free of React Native and Expo", () => {
    expect(read("src/lib/presentation/vocabulary/word-form.ts")).not.toMatch(
      /from "(react|react-native|expo-[a-z-]+)"/,
    );
  });

  it("lifts the field over the keyboard and announces with a static import", () => {
    const screen = read("src/components/vocabulary/word-form-screen.tsx");

    expect(screen).toMatch(/<KeyboardAvoidingView[^>]*behavior="padding"/);
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
    expect(screen).toMatch(/import\s*\{[^}]*\bAccessibilityInfo\b[^}]*\}\s*from\s*"react-native"/);
    expect(screen).toContain("AccessibilityInfo.announceForAccessibility");
    expect(screen).toContain("createInstalledWordRegistration");
    expect(screen).not.toMatch(/import\(/);
    expect(screen).not.toMatch(/(error|cause|err)\.message\b/);
  });

  it("holds no draft between visits", () => {
    for (const file of [
      "src/components/vocabulary/word-form-screen.tsx",
      "src/lib/presentation/vocabulary/word-form.ts",
    ]) {
      expect(read(file)).not.toMatch(/AsyncStorage|localStorage|SecureStore|draft|rascunho/i);
    }
  });
});
