import type { DailyReviewReader } from "@/lib/application/review/ports/daily-review-reader";
import type { ReviewSessionRepository } from "@/lib/application/review/ports/review-session-repository";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import type { IdGenerator } from "@/lib/application/shared/id-generator";
import { GameSession } from "@/lib/domain/game/game-session";
import type { Clock, Word } from "@/lib/domain/game/types";
import {
  DAILY_NEW_WORD_LIMIT,
  DAILY_REVIEW_SESSION_LIMIT,
  planDailyReview,
  type DailyReviewPlan,
} from "@/lib/domain/learning/daily-review-plan";
import { selectDistractorWordIds } from "@/lib/domain/learning/word-selection";
import { InvalidReviewSessionError, ReviewSession } from "@/lib/domain/review";
import type { ReviewWordOrigin, ReviewWordStage } from "@/lib/domain/review";

import { NothingToReviewError } from "./errors";
import { toReviewSessionView, type ReviewSessionView } from "./review-session-view";
import {
  acceptTimeZone,
  requestedTimeZoneIsInvalid,
  reviewTimeZone,
} from "./resolve-time-zone";

export interface StartDailyReviewDependencies {
  readonly repository: ReviewSessionRepository;
  readonly reader: DailyReviewReader;
  readonly preferences: VisitorPreferences;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly onInvalidTimeZone: () => void;
}

export interface StartDailyReviewInput {
  readonly visitorId: string;
  readonly timeZone?: string;
}

export interface StartedDailyReview {
  readonly view: ReviewSessionView;
  readonly typingCount: number;
  readonly matchingCount: number;
  readonly newCount: number;
  readonly distractorCount: number;
}

interface PlannedWord {
  readonly word: Word;
  readonly stage: ReviewWordStage;
  readonly origin: ReviewWordOrigin;
}

interface AssembledReview {
  readonly reviewWords: readonly PlannedWord[];
  readonly gameWords: readonly Word[];
  readonly distractorIds: readonly string[];
  readonly typingCount: number;
  readonly matchingCount: number;
  readonly newCount: number;
}

export class StartDailyReview {
  constructor(private readonly dependencies: StartDailyReviewDependencies) {}

  async execute(input: StartDailyReviewInput): Promise<StartedDailyReview> {
    const timeZone = await this.resolveTimeZone(input);
    const now = this.dependencies.clock.now();
    const plan = await this.planFor(input.visitorId, now, timeZone);
    if (plan.typingWordIds.length === 0 && plan.matchingWordIds.length === 0) {
      throw new NothingToReviewError();
    }
    const assembled = await this.assemble(input.visitorId, plan, now);
    const sessionId = this.dependencies.idGenerator.generate();
    const gameSessionId =
      assembled.gameWords.length > 0 ? this.dependencies.idGenerator.generate() : null;
    const session = ReviewSession.start(
      {
        id: sessionId,
        visitorId: input.visitorId,
        timeZone,
        words: assembled.reviewWords,
        gameSessionId,
      },
      this.dependencies.clock,
    );
    const game = this.linkedGame({
      visitorId: input.visitorId,
      gameSessionId,
      gameWords: assembled.gameWords,
      distractorIds: assembled.distractorIds,
    });
    session.assertLinkedGame(game);
    await this.dependencies.repository.create(session, game);
    return {
      view: toReviewSessionView(session, null, game, this.dependencies.clock.now()),
      typingCount: assembled.typingCount,
      matchingCount: assembled.matchingCount,
      newCount: assembled.newCount,
      distractorCount: assembled.distractorIds.length,
    };
  }

  private async resolveTimeZone(input: StartDailyReviewInput): Promise<string> {
    if (requestedTimeZoneIsInvalid(input.timeZone)) {
      this.dependencies.onInvalidTimeZone();
    }
    const stored = await this.dependencies.preferences.getTimeZone(input.visitorId);
    const timeZone = reviewTimeZone({ requested: input.timeZone, stored });
    const accepted = acceptTimeZone(input.timeZone);
    if (accepted) {
      await this.dependencies.preferences.saveTimeZone(
        input.visitorId,
        accepted,
        this.dependencies.clock.now(),
      );
    }
    return timeZone;
  }

  private async planFor(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewPlan> {
    const inputs = await this.dependencies.reader.loadPlanInputs(visitorId, now, timeZone);
    return planDailyReview({
      ...inputs,
      sessionLimit: DAILY_REVIEW_SESSION_LIMIT,
      dailyNewLimit: DAILY_NEW_WORD_LIMIT,
      now,
    });
  }

  private async assemble(
    visitorId: string,
    plan: DailyReviewPlan,
    now: Date,
  ): Promise<AssembledReview> {
    const distractorIds = selectDistractorWordIds({
      matchingWordIds: plan.matchingWordIds,
      reservedWordIds: plan.typingWordIds,
      studied: await this.dependencies.reader.listStudied(visitorId),
      now,
    });
    const loaded = await this.dependencies.reader.findActiveWords([
      ...plan.typingWordIds,
      ...plan.matchingWordIds,
      ...distractorIds,
    ]);
    const byId = new Map(loaded.map((entry) => [entry.id, entry]));
    const newWordIds = new Set(plan.newWordIds);
    const reviewWords = [
      ...plan.typingWordIds.map((wordId) =>
        plannedWord({ words: byId, wordId, stage: "TYPING", origin: "DUE" }),
      ),
      ...plan.matchingWordIds.map((wordId) =>
        plannedWord({
          words: byId,
          wordId,
          stage: "MATCHING",
          origin: newWordIds.has(wordId) ? "NEW" : "DUE",
        }),
      ),
      ...distractorIds.map((wordId) =>
        plannedWord({ words: byId, wordId, stage: "MATCHING", origin: "DISTRACTOR" }),
      ),
    ];
    return {
      reviewWords,
      gameWords: reviewWords.filter((entry) => entry.stage === "MATCHING").map((entry) => entry.word),
      distractorIds,
      typingCount: plan.typingWordIds.length,
      matchingCount: plan.matchingWordIds.length,
      newCount: plan.newWordIds.length,
    };
  }

  private linkedGame(input: {
    readonly visitorId: string;
    readonly gameSessionId: string | null;
    readonly gameWords: readonly Word[];
    readonly distractorIds: readonly string[];
  }): GameSession | null {
    if (input.gameSessionId === null) return null;
    return GameSession.start(
      {
        id: input.gameSessionId,
        visitorId: input.visitorId,
        words: input.gameWords,
        mode: "REVIEW",
        ungradedWordIds: input.distractorIds,
      },
      this.dependencies.clock,
    );
  }
}

function plannedWord(input: {
  readonly words: ReadonlyMap<string, Word>;
  readonly wordId: string;
  readonly stage: ReviewWordStage;
  readonly origin: ReviewWordOrigin;
}): PlannedWord {
  const word = input.words.get(input.wordId);
  if (!word) {
    throw new InvalidReviewSessionError(`Word ${input.wordId} is not available for review.`);
  }
  return { word, stage: input.stage, origin: input.origin };
}
