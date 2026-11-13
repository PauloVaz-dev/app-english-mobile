import type { DailyReviewReader } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository } from "@/lib/application/review/ports/review-session-repository";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import type { Clock } from "@/lib/domain/game/types";
import type { ReviewGrade } from "@/lib/domain/learning/review-schedule";
import type { TypingOutcome } from "@/lib/domain/learning/typing-answer";

import { completeWhenDone, loadOwnedReview, readReviewView } from "./load-review-session";
import type { ReviewSessionView } from "./review-session-view";
import { acceptTimeZone, requestedTimeZoneIsInvalid } from "./resolve-time-zone";

export interface TypingAnswerDependencies {
  readonly repository: ReviewSessionRepository;
  readonly reader: DailyReviewReader;
  readonly preferences: VisitorPreferences;
  readonly clock: Clock;
  readonly onInvalidTimeZone: () => void;
}

export interface RecordTypingAnswerInput {
  readonly sessionId: string;
  readonly visitorId: string;
  readonly attemptId: string;
  readonly wordId: string;
  readonly typedText: string | null;
  readonly usedHint: boolean;
  readonly responseTimeMs: number;
  readonly timeZone?: string;
}

export interface RecordTypingAnswerResult {
  readonly outcome: TypingOutcome;
  readonly expected: string;
  readonly exampleSentence: string | null;
  readonly grade: ReviewGrade | null;
  readonly isReinforcement: boolean;
  readonly usedHint: boolean;
  readonly view: ReviewSessionView;
}

export class RecordTypingAnswer {
  constructor(private readonly dependencies: TypingAnswerDependencies) {}

  async execute(input: RecordTypingAnswerInput): Promise<RecordTypingAnswerResult> {
    await this.rememberTimeZone(input.visitorId, input.timeZone);
    await loadOwnedReview({
      repository: this.dependencies.repository,
      sessionId: input.sessionId,
      visitorId: input.visitorId,
    });
    const recorded = await this.dependencies.repository.recordTypingAttempt({
      sessionId: input.sessionId,
      attemptId: input.attemptId,
      wordId: input.wordId,
      typedText: input.typedText,
      usedHint: input.usedHint,
      responseTimeMs: input.responseTimeMs,
    });
    const session = await completeWhenDone({
      repository: this.dependencies.repository,
      session: recorded.session,
    });
    return {
      outcome: recorded.outcome,
      expected: recorded.expected,
      exampleSentence: recorded.exampleSentence,
      grade: recorded.grade,
      isReinforcement: recorded.isReinforcement,
      usedHint: input.usedHint,
      view: await readReviewView({
        session,
        reader: this.dependencies.reader,
        clock: this.dependencies.clock,
        repository: this.dependencies.repository,
      }),
    };
  }

  private async rememberTimeZone(visitorId: string, timeZone: string | undefined): Promise<void> {
    if (requestedTimeZoneIsInvalid(timeZone)) {
      this.dependencies.onInvalidTimeZone();
    }
    const accepted = acceptTimeZone(timeZone);
    if (!accepted) return;
    await this.dependencies.preferences.saveTimeZone(
      visitorId,
      accepted,
      this.dependencies.clock.now(),
    );
  }
}
