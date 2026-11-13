export class NothingToReviewError extends Error {
  readonly code = "NOTHING_TO_REVIEW";

  constructor() {
    super("There is nothing to review today.");
    this.name = "NothingToReviewError";
  }
}
