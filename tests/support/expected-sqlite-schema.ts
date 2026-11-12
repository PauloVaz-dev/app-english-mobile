export interface ColumnExpectation {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: number;
  defaultValue: string | null;
}

export interface ForeignKeyExpectation {
  from: string;
  table: string;
  to: string;
  onDelete: "CASCADE" | "RESTRICT";
  onUpdate: "CASCADE";
}

export interface IndexExpectation {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface TableExpectation {
  columns: ColumnExpectation[];
  foreignKeys: ForeignKeyExpectation[];
  indexes: IndexExpectation[];
}

const NOT_PRIMARY_KEY = 0;
const FIRST_PRIMARY_KEY = 1;
const SECOND_PRIMARY_KEY = 2;
const TIMESTAMP_DEFAULT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const RESTRICT = "RESTRICT" as const;
const CASCADE = "CASCADE" as const;

export const REQUIRED_TABLE_COUNT = 12;

function defineRequiredText(
  name: string,
  primaryKey: number,
  defaultValue: string | null,
): ColumnExpectation {
  return {
    name,
    type: "TEXT",
    notNull: true,
    primaryKey,
    defaultValue,
  };
}

function defineOptionalText(name: string): ColumnExpectation {
  return {
    name,
    type: "TEXT",
    notNull: false,
    primaryKey: NOT_PRIMARY_KEY,
    defaultValue: null,
  };
}

function defineRequiredInteger(name: string, defaultValue: string | null): ColumnExpectation {
  return {
    name,
    type: "INTEGER",
    notNull: true,
    primaryKey: NOT_PRIMARY_KEY,
    defaultValue,
  };
}

function defineOptionalInteger(name: string): ColumnExpectation {
  return {
    name,
    type: "INTEGER",
    notNull: false,
    primaryKey: NOT_PRIMARY_KEY,
    defaultValue: null,
  };
}

function defineRequiredReal(name: string, defaultValue: string): ColumnExpectation {
  return {
    name,
    type: "REAL",
    notNull: true,
    primaryKey: NOT_PRIMARY_KEY,
    defaultValue,
  };
}

function defineForeignKey(
  from: string,
  table: string,
  onDelete: "CASCADE" | "RESTRICT",
): ForeignKeyExpectation {
  return {
    from,
    table,
    to: "id",
    onDelete,
    onUpdate: CASCADE,
  };
}

function definePlainIndex(name: string, columns: string[]): IndexExpectation {
  return { name, unique: false, columns };
}

function defineUniqueIndex(name: string, columns: string[]): IndexExpectation {
  return { name, unique: true, columns };
}

export const EXPECTED_TABLES: Record<string, TableExpectation> = {
  AnonymousVisitor: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, TIMESTAMP_DEFAULT),
      defineRequiredText("lastSeenAt", NOT_PRIMARY_KEY, TIMESTAMP_DEFAULT),
      defineOptionalText("timeZone"),
    ],
    foreignKeys: [],
    indexes: [],
  },
  Word: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("english", NOT_PRIMARY_KEY, null),
      defineRequiredText("portuguese", NOT_PRIMARY_KEY, null),
      defineRequiredText("englishNormalized", NOT_PRIMARY_KEY, null),
      defineRequiredText("portugueseNormalized", NOT_PRIMARY_KEY, null),
      defineOptionalText("exampleSentence"),
      defineRequiredInteger("active", "1"),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, TIMESTAMP_DEFAULT),
      defineRequiredText("updatedAt", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [],
    indexes: [
      definePlainIndex("Word_active_idx", ["active"]),
      defineUniqueIndex("Word_englishNormalized_portugueseNormalized_key", [
        "englishNormalized",
        "portugueseNormalized",
      ]),
    ],
  },
  GameSession: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("visitorId", NOT_PRIMARY_KEY, null),
      defineRequiredText("status", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("targetWords", null),
      defineRequiredInteger("correctAnswers", "0"),
      defineRequiredInteger("wrongAnswers", "0"),
      defineRequiredText("startedAt", NOT_PRIMARY_KEY, null),
      defineOptionalText("finishedAt"),
      defineOptionalInteger("durationMs"),
      defineRequiredText("mode", NOT_PRIMARY_KEY, "'CLASSIC'"),
    ],
    foreignKeys: [defineForeignKey("visitorId", "AnonymousVisitor", RESTRICT)],
    indexes: [
      definePlainIndex("GameSession_status_idx", ["status"]),
      definePlainIndex("GameSession_visitorId_idx", ["visitorId"]),
    ],
  },
  GameSessionWord: {
    columns: [
      defineRequiredText("sessionId", FIRST_PRIMARY_KEY, null),
      defineRequiredText("wordId", SECOND_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineOptionalText("presentedAt"),
      defineOptionalText("completedAt"),
      defineRequiredInteger("graded", "1"),
    ],
    foreignKeys: [
      defineForeignKey("sessionId", "GameSession", CASCADE),
      defineForeignKey("wordId", "Word", RESTRICT),
    ],
    indexes: [
      defineUniqueIndex("GameSessionWord_sessionId_sequence_key", ["sessionId", "sequence"]),
      definePlainIndex("GameSessionWord_wordId_idx", ["wordId"]),
    ],
  },
  GameAnswer: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("attemptId", NOT_PRIMARY_KEY, null),
      defineRequiredText("sessionId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineRequiredText("promptWordId", NOT_PRIMARY_KEY, null),
      defineRequiredText("selectedWordId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("isCorrect", null),
      defineRequiredInteger("responseTimeMs", null),
      defineRequiredInteger("responseTimeMeasurementVersion", "2"),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [
      defineForeignKey("promptWordId", "Word", RESTRICT),
      defineForeignKey("selectedWordId", "Word", RESTRICT),
      defineForeignKey("sessionId", "GameSession", CASCADE),
    ],
    indexes: [
      defineUniqueIndex("GameAnswer_attemptId_key", ["attemptId"]),
      definePlainIndex("GameAnswer_promptWordId_createdAt_idx", ["promptWordId", "createdAt"]),
      definePlainIndex("GameAnswer_promptWordId_idx", ["promptWordId"]),
      definePlainIndex("GameAnswer_selectedWordId_idx", ["selectedWordId"]),
      definePlainIndex("GameAnswer_sessionId_idx", ["sessionId"]),
      defineUniqueIndex("GameAnswer_sessionId_sequence_key", ["sessionId", "sequence"]),
    ],
  },
  LearnerWordProgress: {
    columns: [
      defineRequiredText("visitorId", FIRST_PRIMARY_KEY, null),
      defineRequiredText("wordId", SECOND_PRIMARY_KEY, null),
      defineRequiredInteger("timesShown", "0"),
      defineRequiredInteger("correctCount", "0"),
      defineRequiredInteger("wrongCount", "0"),
      defineRequiredInteger("totalCorrectResponseTimeMs", "0"),
      defineOptionalText("lastReviewedAt"),
      defineOptionalText("nextReviewAt"),
      defineRequiredInteger("reviewRepetitions", "0"),
      defineRequiredInteger("reviewLapses", "0"),
      defineRequiredInteger("reviewIntervalDays", "0"),
      defineRequiredReal("reviewEaseFactor", "2.5"),
      defineRequiredText("reviewState", NOT_PRIMARY_KEY, "'LEARNING'"),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, TIMESTAMP_DEFAULT),
      defineRequiredText("updatedAt", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [
      defineForeignKey("visitorId", "AnonymousVisitor", RESTRICT),
      defineForeignKey("wordId", "Word", RESTRICT),
    ],
    indexes: [
      definePlainIndex("LearnerWordProgress_visitorId_nextReviewAt_idx", [
        "visitorId",
        "nextReviewAt",
      ]),
      definePlainIndex("LearnerWordProgress_wordId_idx", ["wordId"]),
    ],
  },
  ChallengeSession: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("visitorId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("level", null),
      defineRequiredText("status", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("score", "0"),
      defineRequiredInteger("bestStreak", "0"),
      defineRequiredInteger("correctAnswers", "0"),
      defineRequiredInteger("wrongAnswers", "0"),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, null),
      defineOptionalText("startedAt"),
      defineOptionalText("finishedAt"),
    ],
    foreignKeys: [defineForeignKey("visitorId", "AnonymousVisitor", RESTRICT)],
    indexes: [
      definePlainIndex("ChallengeSession_visitorId_level_status_idx", [
        "visitorId",
        "level",
        "status",
      ]),
    ],
  },
  ChallengeSessionWord: {
    columns: [
      defineRequiredText("sessionId", FIRST_PRIMARY_KEY, null),
      defineRequiredText("wordId", SECOND_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineOptionalText("completedAt"),
    ],
    foreignKeys: [
      defineForeignKey("sessionId", "ChallengeSession", CASCADE),
      defineForeignKey("wordId", "Word", RESTRICT),
    ],
    indexes: [
      defineUniqueIndex("ChallengeSessionWord_sessionId_sequence_key", ["sessionId", "sequence"]),
      definePlainIndex("ChallengeSessionWord_wordId_idx", ["wordId"]),
    ],
  },
  ChallengeAttempt: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("attemptId", NOT_PRIMARY_KEY, null),
      defineRequiredText("sessionId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineRequiredText("promptWordId", NOT_PRIMARY_KEY, null),
      defineRequiredText("selectedWordId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("isCorrect", null),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [defineForeignKey("sessionId", "ChallengeSession", CASCADE)],
    indexes: [
      defineUniqueIndex("ChallengeAttempt_attemptId_key", ["attemptId"]),
      defineUniqueIndex("ChallengeAttempt_sessionId_sequence_key", ["sessionId", "sequence"]),
    ],
  },
  ReviewSession: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("visitorId", NOT_PRIMARY_KEY, null),
      defineRequiredText("localDate", NOT_PRIMARY_KEY, null),
      defineRequiredText("timeZone", NOT_PRIMARY_KEY, null),
      defineRequiredText("status", NOT_PRIMARY_KEY, null),
      defineOptionalText("gameSessionId"),
      defineRequiredText("startedAt", NOT_PRIMARY_KEY, null),
      defineOptionalText("finishedAt"),
    ],
    foreignKeys: [
      defineForeignKey("gameSessionId", "GameSession", RESTRICT),
      defineForeignKey("visitorId", "AnonymousVisitor", RESTRICT),
    ],
    indexes: [
      defineUniqueIndex("ReviewSession_gameSessionId_key", ["gameSessionId"]),
      definePlainIndex("ReviewSession_visitorId_localDate_idx", ["visitorId", "localDate"]),
    ],
  },
  ReviewSessionWord: {
    columns: [
      defineRequiredText("sessionId", FIRST_PRIMARY_KEY, null),
      defineRequiredText("wordId", SECOND_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineRequiredText("stage", NOT_PRIMARY_KEY, null),
      defineRequiredText("origin", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [
      defineForeignKey("sessionId", "ReviewSession", CASCADE),
      defineForeignKey("wordId", "Word", RESTRICT),
    ],
    indexes: [
      defineUniqueIndex("ReviewSessionWord_sessionId_sequence_key", ["sessionId", "sequence"]),
      definePlainIndex("ReviewSessionWord_wordId_idx", ["wordId"]),
    ],
  },
  TypingAttempt: {
    columns: [
      defineRequiredText("id", FIRST_PRIMARY_KEY, null),
      defineRequiredText("attemptId", NOT_PRIMARY_KEY, null),
      defineRequiredText("sessionId", NOT_PRIMARY_KEY, null),
      defineRequiredInteger("sequence", null),
      defineRequiredText("wordId", NOT_PRIMARY_KEY, null),
      defineRequiredText("outcome", NOT_PRIMARY_KEY, null),
      defineOptionalText("typedText"),
      defineRequiredInteger("usedHint", null),
      defineRequiredInteger("responseTimeMs", null),
      defineOptionalText("grade"),
      defineRequiredInteger("isReinforcement", null),
      defineRequiredText("createdAt", NOT_PRIMARY_KEY, null),
    ],
    foreignKeys: [
      defineForeignKey("sessionId", "ReviewSession", CASCADE),
      defineForeignKey("wordId", "Word", RESTRICT),
    ],
    indexes: [
      defineUniqueIndex("TypingAttempt_attemptId_key", ["attemptId"]),
      definePlainIndex("TypingAttempt_sessionId_idx", ["sessionId"]),
      defineUniqueIndex("TypingAttempt_sessionId_sequence_key", ["sessionId", "sequence"]),
    ],
  },
};

export function listExpectedTableNames(): string[] {
  return Object.keys(EXPECTED_TABLES).sort((left, right) => left.localeCompare(right));
}
