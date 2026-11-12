export class LearningDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidLearningSnapshotError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_LEARNING_SNAPSHOT", message);
  }
}

export class InvalidReviewCandidateError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_REVIEW_CANDIDATE", message);
  }
}

export class InvalidWeightedSelectionError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_WEIGHTED_SELECTION", message);
  }
}

export class InvalidLearnerWordFilterError extends LearningDomainError {
  constructor() {
    super("INVALID_LEARNER_WORD_FILTER", "Unknown learner word list filter.");
  }
}

export class InvalidReviewScheduleError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_REVIEW_SCHEDULE", message);
  }
}

export class InvalidDailyReviewPlanError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_DAILY_REVIEW_PLAN", message);
  }
}

export class InvalidWordSelectionError extends LearningDomainError {
  constructor(message: string) {
    super("INVALID_WORD_SELECTION", message);
  }
}

export class NotEnoughStudiedWordsError extends LearningDomainError {
  constructor(
    readonly available: number,
    readonly minimum: number,
  ) {
    super(
      "NOT_ENOUGH_STUDIED_WORDS",
      `Free practice needs at least ${minimum} studied words; ${available} are available.`,
    );
  }
}
