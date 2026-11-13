export class ReviewDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidReviewSessionError extends ReviewDomainError {
  constructor(message: string) {
    super("INVALID_REVIEW_SESSION", message);
  }
}

export class InvalidTypingAttemptError extends ReviewDomainError {
  constructor(message: string) {
    super("INVALID_TYPING_ATTEMPT", message);
  }
}

export class ReviewSessionEndedError extends ReviewDomainError {
  constructor(status: string) {
    super("SESSION_ENDED", `Review session is already ${status.toLowerCase()}.`);
  }
}

export class ReviewWordNotInSessionError extends ReviewDomainError {
  constructor(wordId: string) {
    super(
      "WORD_NOT_IN_SESSION",
      `Word ${wordId} is not part of this review's typing stage.`,
    );
  }
}

export class UnexpectedTypingWordError extends ReviewDomainError {
  constructor(wordId: string) {
    super(
      "UNEXPECTED_TYPING_WORD",
      `Word ${wordId} is not the current typing prompt.`,
    );
  }
}

export class ReviewAttemptConflictError extends ReviewDomainError {
  constructor(attemptId: string) {
    super(
      "ATTEMPT_CONFLICT",
      `Attempt ${attemptId} was already used with different data.`,
    );
  }
}

export class ReviewSessionNotFoundError extends ReviewDomainError {
  constructor(sessionId: string) {
    super("REVIEW_SESSION_NOT_FOUND", `Review session ${sessionId} was not found.`);
  }
}

export class ReviewSessionAlreadyExistsError extends ReviewDomainError {
  constructor(sessionId: string) {
    super(
      "REVIEW_SESSION_ALREADY_EXISTS",
      `Review session ${sessionId} already exists.`,
    );
  }
}

export class ConcurrentReviewUpdateError extends ReviewDomainError {
  constructor(sessionId: string) {
    super(
      "CONCURRENT_REVIEW_UPDATE",
      `Review session ${sessionId} could not be updated after concurrent retries.`,
    );
  }
}
