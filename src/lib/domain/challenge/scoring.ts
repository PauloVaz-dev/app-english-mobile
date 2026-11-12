export const BASE_POINTS = 100;
export const STREAK_BONUS_STEP = 10;
export const MAX_STREAK_BONUS = 50;

export interface ChallengeScore {
  readonly score: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly correctAnswers: number;
  readonly wrongAnswers: number;
}

export const EMPTY_CHALLENGE_SCORE: ChallengeScore = Object.freeze({
  score: 0,
  streak: 0,
  bestStreak: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
});

/** Points for a correct match that makes the streak reach `streak`. */
export function pointsForStreak(streak: number): number {
  if (!Number.isInteger(streak) || streak < 1) {
    return 0;
  }
  return BASE_POINTS + Math.min((streak - 1) * STREAK_BONUS_STEP, MAX_STREAK_BONUS);
}

export function applyOutcome(
  current: ChallengeScore,
  isCorrect: boolean,
): ChallengeScore {
  if (!isCorrect) {
    return Object.freeze({
      ...current,
      streak: 0,
      wrongAnswers: current.wrongAnswers + 1,
    });
  }
  const streak = current.streak + 1;
  return Object.freeze({
    score: current.score + pointsForStreak(streak),
    streak,
    bestStreak: Math.max(current.bestStreak, streak),
    correctAnswers: current.correctAnswers + 1,
    wrongAnswers: current.wrongAnswers,
  });
}

export function scoreOutcomes(outcomes: readonly boolean[]): ChallengeScore {
  return outcomes.reduce(applyOutcome, EMPTY_CHALLENGE_SCORE);
}
