import { speak } from "expo-speech";

import { logDeviceEvent } from "@/observability/device-event-log";

import {
  CHALLENGE_SPEECH_FAILED,
  type ChallengePronunciation,
} from "@/composition/challenge";

export const PRONUNCIATION_LANGUAGE = "en-US";

export type SpeechFailureRecorder = (event: typeof CHALLENGE_SPEECH_FAILED) => void;

/**
 * Speaks the English word with the device voice. The call returns at once,
 * never waits for the utterance and never throws: an engine error, reported
 * through `onError` or thrown by `speak`, only logs `challenge.speech_failed`
 * on the device. Voices are not listed because `getAvailableVoicesAsync` may
 * never settle when the engine is missing. The practice passes its own
 * recorder (`recordPracticeSpeechFailure`), which logs `practice.speech_failed`.
 */
export function createDeviceSpeech(
  recordEvent: SpeechFailureRecorder = recordSpeechFailure,
): ChallengePronunciation {
  const fail = () => {
    try {
      recordEvent(CHALLENGE_SPEECH_FAILED);
    } catch {
      // A failed log must not reach the round.
    }
  };

  return {
    pronounce(english) {
      try {
        speak(english, { language: PRONUNCIATION_LANGUAGE, onError: fail });
      } catch {
        fail();
      }
    },
  };
}

export const recordSpeechFailure: SpeechFailureRecorder = (event) => {
  logDeviceEvent(event);
};
