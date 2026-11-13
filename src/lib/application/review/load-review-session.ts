import type { DailyReviewReader } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository } from "@/lib/application/review/ports/review-session-repository";
import type { Clock } from "@/lib/domain/game/types";
import { ReviewSession, ReviewSessionNotFoundError } from "@/lib/domain/review";

import { toReviewSessionView, type ReviewSessionView } from "./review-session-view";

export async function loadOwnedReview(input: {
  readonly repository: ReviewSessionRepository;
  readonly sessionId: string;
  readonly visitorId: string;
}): Promise<ReviewSession> {
  const session = await input.repository.findById(input.sessionId);
  if (!session || session.visitorId !== input.visitorId) {
    throw new ReviewSessionNotFoundError(input.sessionId);
  }
  return session;
}

export async function completeWhenDone(input: {
  readonly repository: ReviewSessionRepository;
  readonly session: ReviewSession;
}): Promise<ReviewSession> {
  if (input.session.status !== "ACTIVE" || input.session.stage !== "DONE") {
    return input.session;
  }
  return input.repository.finish(input.session.id, "COMPLETED");
}

export async function readReviewView(input: {
  readonly session: ReviewSession;
  readonly reader: DailyReviewReader;
  readonly clock: Clock;
  readonly repository: ReviewSessionRepository;
}): Promise<ReviewSessionView> {
  const now = input.clock.now();
  const game = input.session.gameSessionId
    ? await input.repository.findLinkedGame(input.session.gameSessionId)
    : null;
  if (input.session.status === "ACTIVE") {
    return toReviewSessionView(input.session, null, game, now);
  }
  const summary = await input.reader.summary(
    input.session.visitorId,
    now,
    input.session.timeZone,
  );
  return toReviewSessionView(input.session, summary, game, now);
}
