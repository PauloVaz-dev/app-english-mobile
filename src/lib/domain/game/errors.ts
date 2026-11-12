export class GameDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidWordError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_WORD", message);
  }
}

export class InvalidGameSessionError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_GAME_SESSION", message);
  }
}

export class InvalidAttemptError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_ATTEMPT", message);
  }
}

export class SessionEndedError extends GameDomainError {
  constructor(status: string) {
    super("SESSION_ENDED", `Game session is already ${status.toLowerCase()}.`);
  }
}

export class WordNotInSessionError extends GameDomainError {
  constructor(wordId: string) {
    super("WORD_NOT_IN_SESSION", `Word ${wordId} does not belong to the session.`);
  }
}

export class WordAlreadyCompletedError extends GameDomainError {
  constructor(wordId: string) {
    super("WORD_ALREADY_COMPLETED", `Word ${wordId} was already completed.`);
  }
}

export class AttemptConflictError extends GameDomainError {
  constructor(attemptId: string) {
    super(
      "ATTEMPT_CONFLICT",
      `Attempt ${attemptId} was already used with different data.`,
    );
  }
}

export class ConcurrentSessionUpdateError extends GameDomainError {
  constructor(sessionId: string) {
    super(
      "CONCURRENT_SESSION_UPDATE",
      `Game session ${sessionId} could not be updated after concurrent retries.`,
    );
  }
}

export class InvalidRandomValueError extends GameDomainError {
  constructor(value: number) {
    super(
      "INVALID_RANDOM_VALUE",
      `Random source must return a value from 0 (inclusive) to 1 (exclusive); received ${value}.`,
    );
  }
}

export class InvalidBoardError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_BOARD", message);
  }
}

export class CardNotOnBoardError extends GameDomainError {
  constructor(wordId: string, language: "english" | "portuguese") {
    super(
      "CARD_NOT_ON_BOARD",
      `The ${language} card for word ${wordId} is not visible.`,
    );
  }
}

export class GameSessionNotFoundError extends GameDomainError {
  constructor(sessionId: string) {
    super("GAME_SESSION_NOT_FOUND", `Game session ${sessionId} was not found.`);
  }
}

export class GameSessionAlreadyExistsError extends GameDomainError {
  constructor(sessionId: string) {
    super(
      "GAME_SESSION_ALREADY_EXISTS",
      `Game session ${sessionId} already exists.`,
    );
  }
}

export class InvalidWordCatalogError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_WORD_CATALOG", message);
  }
}

export class InvalidExposureBatchError extends GameDomainError {
  constructor(message: string) {
    super("INVALID_EXPOSURE_BATCH", message);
  }
}
