import type { GameSession } from "@/lib/domain/game/game-session";
import type {
  FinishedReviewSessionStatus,
  RecordTypingAttemptInput,
  ReviewSession,
  TypingAttemptOutcome,
} from "@/lib/domain/review";

export interface RecordTypingAttempt extends RecordTypingAttemptInput {
  readonly sessionId: string;
}

export interface TypingAttemptResult extends TypingAttemptOutcome {
  readonly session: ReviewSession;
}

export interface ReviewSessionRepository {
  create(session: ReviewSession, game: GameSession | null): Promise<void>;
  findById(id: string): Promise<ReviewSession | null>;
  findActiveByVisitor(visitorId: string): Promise<ReviewSession | null>;
  recordTypingAttempt(input: RecordTypingAttempt): Promise<TypingAttemptResult>;
  finish(id: string, status: FinishedReviewSessionStatus): Promise<ReviewSession>;
  findLinkedGame(gameSessionId: string): Promise<GameSession | null>;
}
