import type { DailyReviewReader } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository } from "@/lib/application/review/ports/review-session-repository";
import type { Clock } from "@/lib/domain/game/types";

import { loadOwnedReview, readReviewView } from "./load-review-session";
import type { ReviewSessionView } from "./review-session-view";

export interface FinishReviewDependencies {
  readonly repository: ReviewSessionRepository;
  readonly reader: DailyReviewReader;
  readonly clock: Clock;
}

export interface FinishReviewSessionInput {
  readonly sessionId: string;
  readonly visitorId: string;
  readonly reason: "abandoned";
}

export class FinishReviewSession {
  constructor(private readonly dependencies: FinishReviewDependencies) {}

  async execute(input: FinishReviewSessionInput): Promise<ReviewSessionView> {
    await loadOwnedReview({
      repository: this.dependencies.repository,
      sessionId: input.sessionId,
      visitorId: input.visitorId,
    });
    const session = await this.dependencies.repository.finish(input.sessionId, "ABANDONED");
    return readReviewView({
      session,
      reader: this.dependencies.reader,
      clock: this.dependencies.clock,
      repository: this.dependencies.repository,
    });
  }
}
