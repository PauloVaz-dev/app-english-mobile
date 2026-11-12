import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SpeechOptions } from "expo-speech";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHALLENGE_SPEECH_FAILED, type ChallengeEvent } from "@/composition/challenge";
import { createDeviceSpeech, PRONUNCIATION_LANGUAGE } from "@/speech/device-speech";

const voice = vi.hoisted(() => {
  return {
    behavior: "silent" as "silent" | "error" | "throw",
    spoken: [] as { text: string; options: SpeechOptions | undefined }[],
    voiceLookups: 0,
  };
});

vi.mock("expo-speech", () => {
  return {
    speak(text: string, options?: SpeechOptions) {
      voice.spoken.push({ text, options });
      if (voice.behavior === "throw") {
        throw new Error("Speech engine is missing.");
      }
      if (voice.behavior === "error") {
        options?.onError?.(new Error("Speech engine died."));
      }
    },
    async getAvailableVoicesAsync() {
      voice.voiceLookups += 1;
      return [];
    },
  };
});

describe("device speech", () => {
  beforeEach(() => {
    voice.behavior = "silent";
    voice.spoken.length = 0;
    voice.voiceLookups = 0;
  });

  it("speaks the English text in en-US without looking up voices", () => {
    const events: ChallengeEvent[] = [];
    const speech = createDeviceSpeech((event) => events.push(event));

    speech.pronounce("apple");

    expect(PRONUNCIATION_LANGUAGE).toBe("en-US");
    expect(voice.spoken).toHaveLength(1);
    expect(voice.spoken[0]?.text).toBe("apple");
    expect(voice.spoken[0]?.options?.language).toBe("en-US");
    expect(voice.voiceLookups).toBe(0);
    expect(events).toEqual([]);
  });

  it("does not throw to the caller when the voice reports onError", () => {
    voice.behavior = "error";
    const events: ChallengeEvent[] = [];
    const speech = createDeviceSpeech((event) => events.push(event));

    expect(() => speech.pronounce("apple")).not.toThrow();
    expect(events).toEqual([CHALLENGE_SPEECH_FAILED]);
  });

  it("does not throw to the caller when the device has no voice engine", () => {
    voice.behavior = "throw";
    const events: ChallengeEvent[] = [];
    const speech = createDeviceSpeech((event) => events.push(event));

    expect(() => speech.pronounce("apple")).not.toThrow();
    expect(events).toEqual([CHALLENGE_SPEECH_FAILED]);
  });

  it("does not throw when recording the failure also fails", () => {
    voice.behavior = "error";
    const speech = createDeviceSpeech(() => {
      throw new Error("Log is unavailable.");
    });

    expect(() => speech.pronounce("apple")).not.toThrow();
  });

  it("warns about the failure on the device by default, without an error overlay", () => {
    voice.behavior = "error";
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      createDeviceSpeech().pronounce("apple");
      expect(log).toHaveBeenCalledWith(CHALLENGE_SPEECH_FAILED);
    } finally {
      log.mockRestore();
    }
  });
});

describe("challenge boundary", () => {
  it("keeps expo-speech out of the challenge domain and the composition", () => {
    const root = fileURLToPath(new URL("../../../src", import.meta.url));
    const domain = path.join(root, "lib/domain/challenge");
    const files = [
      ...readdirSync(domain).map((name) => path.join(domain, name)),
      path.join(root, "composition/challenge.ts"),
    ];
    const importers = files.filter((file) => readFileSync(file, "utf8").includes("expo-speech"));
    expect(importers).toEqual([]);
  });
});
