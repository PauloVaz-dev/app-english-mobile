import type { Clock, RandomSource, Word } from "@/lib/domain/game/types";
import { createWord } from "@/lib/domain/game/types";

export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class SequenceRandom implements RandomSource {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    return value;
  }
}

export function makeWords(count = 20): Word[] {
  return Array.from({ length: count }, (_, index) =>
    createWord({
      id: `word-${index + 1}`,
      english: `english-${index + 1}`,
      portuguese: `portuguese-${index + 1}`,
    }),
  );
}
