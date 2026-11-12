import type {
  DailyReviewReader,
  DailyReviewSummary,
  PlanInputs,
} from "@/lib/application/review/ports/daily-review-reader";
import type { Word } from "@/lib/domain/game/types";
import { DAILY_NEW_WORD_LIMIT, type DueReviewWord } from "@/lib/domain/learning/daily-review-plan";
import { localDateOf } from "@/lib/domain/learning/local-day";
import { isReviewDue, type ReviewSchedule } from "@/lib/domain/learning/review-schedule";
import type { ScheduledWordRef } from "@/lib/domain/learning/word-selection";

interface StoredWord {
  readonly id: string;
  readonly active: boolean;
  readonly createdAt: Date;
}

interface StoredProgress {
  readonly schedule: ReviewSchedule | null;
}

interface IntroducedWord {
  readonly visitorId: string;
  readonly localDate: string;
  readonly wordId: string;
}

interface ProgressLookup {
  readonly key: string;
  readonly stored: StoredProgress;
  readonly visitorId: string;
  readonly now: Date;
}

export class ReviewSummaryDouble implements DailyReviewReader {
  private readonly words = new Map<string, StoredWord>();
  private readonly progress = new Map<string, StoredProgress>();
  private readonly introduced: IntroducedWord[] = [];

  addWord(word: Word, createdAt: Date): void {
    this.words.set(word.id, {
      id: word.id,
      active: word.active,
      createdAt,
    });
  }

  addSchedule(visitorId: string, wordId: string, schedule: ReviewSchedule): void {
    this.progress.set(progressKey(visitorId, wordId), { schedule });
  }

  addIntroduced(visitorId: string, localDate: string, wordId: string): void {
    this.introduced.push({ visitorId, localDate, wordId });
  }

  async summary(visitorId: string, now: Date, timeZone: string): Promise<DailyReviewSummary> {
    const due = this.dueWords(visitorId, now);
    const candidates = this.newCandidateIds(visitorId);
    const introducedToday = this.introducedCount(visitorId, localDateOf(now, timeZone));
    const quota = Math.max(0, DAILY_NEW_WORD_LIMIT - introducedToday);
    return {
      dueCount: due.length,
      newAvailable: Math.min(candidates.length, quota),
      nextReviewAt: this.nextFutureReview(visitorId, now),
    };
  }

  async loadPlanInputs(): Promise<PlanInputs> {
    throw new Error("Review plan loading is not available.");
  }

  async findActiveWords(): Promise<readonly Word[]> {
    throw new Error("Active word loading is not available.");
  }

  async listStudied(): Promise<readonly ScheduledWordRef[]> {
    throw new Error("Studied word listing is not available.");
  }

  private dueWords(visitorId: string, now: Date): DueReviewWord[] {
    const due: DueReviewWord[] = [];
    for (const [key, stored] of this.progress) {
      const schedule = this.dueSchedule({ key, stored, visitorId, now });
      if (!schedule) {
        continue;
      }
      due.push({ wordId: wordIdFrom(key, visitorId), schedule });
    }
    due.sort(compareDueWords);
    return due;
  }

  private dueSchedule(lookup: ProgressLookup): ReviewSchedule | null {
    if (!belongsTo(lookup.key, lookup.visitorId) || !lookup.stored.schedule) {
      return null;
    }
    if (!isReviewDue(lookup.stored.schedule, lookup.now)) {
      return null;
    }
    const word = this.words.get(wordIdFrom(lookup.key, lookup.visitorId));
    if (!word?.active) {
      return null;
    }
    return cloneSchedule(lookup.stored.schedule);
  }

  private newCandidateIds(visitorId: string): string[] {
    return [...this.words.values()]
      .filter((word) => word.active && !this.hasSchedule(visitorId, word.id))
      .sort(compareWords)
      .map((word) => word.id);
  }

  private hasSchedule(visitorId: string, wordId: string): boolean {
    return this.progress.get(progressKey(visitorId, wordId))?.schedule != null;
  }

  private introducedCount(visitorId: string, localDate: string): number {
    const wordIds = new Set<string>();
    for (const entry of this.introduced) {
      if (entry.visitorId === visitorId && entry.localDate === localDate) {
        wordIds.add(entry.wordId);
      }
    }
    return wordIds.size;
  }

  private nextFutureReview(visitorId: string, now: Date): Date | null {
    let earliest: Date | null = null;
    for (const [key, stored] of this.progress) {
      const reviewAt = this.futureReviewAt({ key, stored, visitorId, now });
      if (!reviewAt) {
        continue;
      }
      if (earliest === null || reviewAt.getTime() < earliest.getTime()) {
        earliest = reviewAt;
      }
    }
    return earliest;
  }

  private futureReviewAt(lookup: ProgressLookup): Date | null {
    if (!belongsTo(lookup.key, lookup.visitorId) || !lookup.stored.schedule) {
      return null;
    }
    if (lookup.stored.schedule.nextReviewAt.getTime() <= lookup.now.getTime()) {
      return null;
    }
    const word = this.words.get(wordIdFrom(lookup.key, lookup.visitorId));
    if (!word?.active) {
      return null;
    }
    return new Date(lookup.stored.schedule.nextReviewAt);
  }
}

function progressKey(visitorId: string, wordId: string): string {
  return `${visitorId}\0${wordId}`;
}

function belongsTo(key: string, visitorId: string): boolean {
  return key.startsWith(`${visitorId}\0`);
}

function wordIdFrom(key: string, visitorId: string): string {
  return key.slice(visitorId.length + 1);
}

function cloneSchedule(schedule: ReviewSchedule): ReviewSchedule {
  return {
    state: schedule.state,
    repetitions: schedule.repetitions,
    lapses: schedule.lapses,
    intervalDays: schedule.intervalDays,
    easeFactor: schedule.easeFactor,
    nextReviewAt: new Date(schedule.nextReviewAt),
  };
}

function compareDueWords(left: DueReviewWord, right: DueReviewWord): number {
  const timeDelta = left.schedule.nextReviewAt.getTime() - right.schedule.nextReviewAt.getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }
  if (left.wordId < right.wordId) {
    return -1;
  }
  return left.wordId > right.wordId ? 1 : 0;
}

function compareWords(left: StoredWord, right: StoredWord): number {
  const timeDelta = left.createdAt.getTime() - right.createdAt.getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }
  if (left.id < right.id) {
    return -1;
  }
  return left.id > right.id ? 1 : 0;
}
