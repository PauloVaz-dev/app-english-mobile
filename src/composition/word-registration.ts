import { CreateWord } from "@/lib/application/vocabulary/create-word";
import type { VocabularyRepository } from "@/lib/application/vocabulary/ports/vocabulary-repository";
import {
  DuplicateVocabularyError,
  InvalidVocabularyTextError,
  type VocabularyTextInput,
  type VocabularyTextIssue,
} from "@/lib/domain/vocabulary";

export const WORDS_CREATE_FAILED = "words.create_failed";

export type WordRegistrationEvent = typeof WORDS_CREATE_FAILED;
/** Receives only the event name: the typed text never reaches the log. */
export type WordRegistrationEventRecorder = (event: WordRegistrationEvent) => void;

export type RegisterWordOutcome =
  | { kind: "created"; word: { id: string; english: string; portuguese: string } }
  | { kind: "invalid"; issues: readonly VocabularyTextIssue[] }
  | { kind: "duplicate"; existing: { english: string; portuguese: string } };

export interface WordRegistration {
  /** Invalid text and duplicates are outcomes; any other failure is logged and rejects. */
  register(input: VocabularyTextInput): Promise<RegisterWordOutcome>;
}

export interface WordRegistrationDependencies {
  readonly repository: VocabularyRepository;
  readonly createId: () => string;
  readonly recordEvent: WordRegistrationEventRecorder;
}

/**
 * Runs one registration at a time, in call order. On the device the
 * transaction runs through `withTransactionAsync`, and a second transaction
 * started while the first is open may land inside it.
 */
class RegistrationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export function createWordRegistration(
  dependencies: WordRegistrationDependencies,
): WordRegistration {
  const createWord = new CreateWord({
    repository: dependencies.repository,
    idGenerator: { generate: dependencies.createId },
  });
  const queue = new RegistrationQueue();

  return {
    register(input) {
      return queue.run(async () => {
        try {
          const word = await createWord.execute(input);
          return {
            kind: "created",
            word: { id: word.id, english: word.english, portuguese: word.portuguese },
          };
        } catch (cause) {
          if (cause instanceof InvalidVocabularyTextError) {
            return { kind: "invalid", issues: cause.issues };
          }
          if (cause instanceof DuplicateVocabularyError) {
            const { english, portuguese } = cause.existing;
            return { kind: "duplicate", existing: { english, portuguese } };
          }
          recordQuietly(dependencies.recordEvent);
          throw cause;
        }
      });
    },
  };
}

export interface PreparedWordRegistrationInput {
  /** Opens the database and builds the registration; called again after a failure. */
  readonly prepare: () => Promise<WordRegistration>;
  readonly recordEvent: WordRegistrationEventRecorder;
}

/**
 * The registration the screen holds: it prepares the database once, on the
 * first call, and every call goes through the same registration and queue.
 * A failed preparation is logged, rejects, and is tried again on the next call.
 */
export function createPreparedWordRegistration(
  input: PreparedWordRegistrationInput,
): WordRegistration {
  let pending: Promise<WordRegistration> | null = null;
  const prepared = () => {
    if (pending === null) {
      pending = input.prepare().catch((cause: unknown) => {
        pending = null;
        throw cause;
      });
    }
    return pending;
  };

  return {
    async register(text) {
      let registration: WordRegistration;
      try {
        registration = await prepared();
      } catch (cause) {
        recordQuietly(input.recordEvent);
        throw cause;
      }
      return registration.register(text);
    },
  };
}

function recordQuietly(recordEvent: WordRegistrationEventRecorder): void {
  try {
    recordEvent(WORDS_CREATE_FAILED);
  } catch {
    // A failed log must not change the outcome of the registration.
  }
}
