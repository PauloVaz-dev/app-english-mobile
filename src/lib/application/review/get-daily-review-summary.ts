import type {
  DailyReviewReader,
  DailyReviewSummary,
} from "@/lib/application/review/ports/daily-review-reader";
import type { VisitorPreferences } from "@/lib/application/review/ports/visitor-preferences";
import type { Clock } from "@/lib/domain/game/types";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/domain/learning/local-day";

export interface DailySummaryDependencies {
  readonly reader: DailyReviewReader;
  readonly preferences: VisitorPreferences;
  readonly clock: Clock;
}

export interface GetDailyReviewSummaryInput {
  readonly visitorId: string;
}

export class GetDailyReviewSummary {
  constructor(private readonly dependencies: DailySummaryDependencies) {}

  async execute(input: GetDailyReviewSummaryInput): Promise<DailyReviewSummary> {
    const stored = await this.dependencies.preferences.getTimeZone(input.visitorId);
    const timeZone = stored && isValidTimeZone(stored) ? stored : DEFAULT_TIME_ZONE;
    return this.dependencies.reader.summary(input.visitorId, this.dependencies.clock.now(), timeZone);
  }
}
