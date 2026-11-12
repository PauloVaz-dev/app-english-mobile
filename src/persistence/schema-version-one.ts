const CURRENT_INSTANT_DEFAULT = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

export const VERSION_ONE_SQL = `
CREATE TABLE "AnonymousVisitor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TEXT NOT NULL DEFAULT ${CURRENT_INSTANT_DEFAULT},
  "lastSeenAt" TEXT NOT NULL DEFAULT ${CURRENT_INSTANT_DEFAULT},
  "timeZone" TEXT
);
CREATE TABLE "Word" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "english" TEXT NOT NULL,
  "portuguese" TEXT NOT NULL,
  "englishNormalized" TEXT NOT NULL,
  "portugueseNormalized" TEXT NOT NULL,
  "exampleSentence" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL DEFAULT ${CURRENT_INSTANT_DEFAULT},
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE "GameSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "visitorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "targetWords" INTEGER NOT NULL,
  "correctAnswers" INTEGER NOT NULL DEFAULT 0,
  "wrongAnswers" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TEXT NOT NULL,
  "finishedAt" TEXT,
  "durationMs" INTEGER,
  "mode" TEXT NOT NULL DEFAULT 'CLASSIC',
  CONSTRAINT "GameSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AnonymousVisitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "GameSessionWord" (
  "sessionId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "presentedAt" TEXT,
  "completedAt" TEXT,
  "graded" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("sessionId", "wordId"),
  CONSTRAINT "GameSessionWord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GameSessionWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "GameAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attemptId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "promptWordId" TEXT NOT NULL,
  "selectedWordId" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "responseTimeMs" INTEGER NOT NULL,
  "responseTimeMeasurementVersion" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "GameAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GameAnswer_promptWordId_fkey" FOREIGN KEY ("promptWordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GameAnswer_selectedWordId_fkey" FOREIGN KEY ("selectedWordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "LearnerWordProgress" (
  "visitorId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "timesShown" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "totalCorrectResponseTimeMs" INTEGER NOT NULL DEFAULT 0,
  "lastReviewedAt" TEXT,
  "nextReviewAt" TEXT,
  "reviewRepetitions" INTEGER NOT NULL DEFAULT 0,
  "reviewLapses" INTEGER NOT NULL DEFAULT 0,
  "reviewIntervalDays" INTEGER NOT NULL DEFAULT 0,
  "reviewEaseFactor" REAL NOT NULL DEFAULT 2.5,
  "reviewState" TEXT NOT NULL DEFAULT 'LEARNING',
  "createdAt" TEXT NOT NULL DEFAULT ${CURRENT_INSTANT_DEFAULT},
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("visitorId", "wordId"),
  CONSTRAINT "LearnerWordProgress_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AnonymousVisitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LearnerWordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ChallengeSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "visitorId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "bestStreak" INTEGER NOT NULL DEFAULT 0,
  "correctAnswers" INTEGER NOT NULL DEFAULT 0,
  "wrongAnswers" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "startedAt" TEXT,
  "finishedAt" TEXT,
  CONSTRAINT "ChallengeSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AnonymousVisitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ChallengeSessionWord" (
  "sessionId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "completedAt" TEXT,
  PRIMARY KEY ("sessionId", "wordId"),
  CONSTRAINT "ChallengeSessionWord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChallengeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChallengeSessionWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ChallengeAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attemptId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "promptWordId" TEXT NOT NULL,
  "selectedWordId" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "ChallengeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChallengeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ReviewSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "visitorId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "gameSessionId" TEXT,
  "startedAt" TEXT NOT NULL,
  "finishedAt" TEXT,
  CONSTRAINT "ReviewSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AnonymousVisitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewSession_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ReviewSessionWord" (
  "sessionId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "stage" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  PRIMARY KEY ("sessionId", "wordId"),
  CONSTRAINT "ReviewSessionWord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewSessionWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "TypingAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attemptId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "wordId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "typedText" TEXT,
  "usedHint" INTEGER NOT NULL,
  "responseTimeMs" INTEGER NOT NULL,
  "grade" TEXT,
  "isReinforcement" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "TypingAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TypingAttempt_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Word_active_idx" ON "Word"("active");
CREATE UNIQUE INDEX "Word_englishNormalized_portugueseNormalized_key" ON "Word"("englishNormalized", "portugueseNormalized");
CREATE INDEX "GameSession_visitorId_idx" ON "GameSession"("visitorId");
CREATE INDEX "GameSession_status_idx" ON "GameSession"("status");
CREATE INDEX "GameSessionWord_wordId_idx" ON "GameSessionWord"("wordId");
CREATE UNIQUE INDEX "GameSessionWord_sessionId_sequence_key" ON "GameSessionWord"("sessionId", "sequence");
CREATE UNIQUE INDEX "GameAnswer_attemptId_key" ON "GameAnswer"("attemptId");
CREATE INDEX "GameAnswer_sessionId_idx" ON "GameAnswer"("sessionId");
CREATE UNIQUE INDEX "GameAnswer_sessionId_sequence_key" ON "GameAnswer"("sessionId", "sequence");
CREATE INDEX "GameAnswer_promptWordId_idx" ON "GameAnswer"("promptWordId");
CREATE INDEX "GameAnswer_selectedWordId_idx" ON "GameAnswer"("selectedWordId");
CREATE INDEX "GameAnswer_promptWordId_createdAt_idx" ON "GameAnswer"("promptWordId", "createdAt");
CREATE INDEX "LearnerWordProgress_wordId_idx" ON "LearnerWordProgress"("wordId");
CREATE INDEX "LearnerWordProgress_visitorId_nextReviewAt_idx" ON "LearnerWordProgress"("visitorId", "nextReviewAt");
CREATE INDEX "ChallengeSession_visitorId_level_status_idx" ON "ChallengeSession"("visitorId", "level", "status");
CREATE INDEX "ChallengeSessionWord_wordId_idx" ON "ChallengeSessionWord"("wordId");
CREATE UNIQUE INDEX "ChallengeSessionWord_sessionId_sequence_key" ON "ChallengeSessionWord"("sessionId", "sequence");
CREATE UNIQUE INDEX "ChallengeAttempt_attemptId_key" ON "ChallengeAttempt"("attemptId");
CREATE UNIQUE INDEX "ChallengeAttempt_sessionId_sequence_key" ON "ChallengeAttempt"("sessionId", "sequence");
CREATE UNIQUE INDEX "ReviewSession_gameSessionId_key" ON "ReviewSession"("gameSessionId");
CREATE INDEX "ReviewSession_visitorId_localDate_idx" ON "ReviewSession"("visitorId", "localDate");
CREATE INDEX "ReviewSessionWord_wordId_idx" ON "ReviewSessionWord"("wordId");
CREATE UNIQUE INDEX "ReviewSessionWord_sessionId_sequence_key" ON "ReviewSessionWord"("sessionId", "sequence");
CREATE UNIQUE INDEX "TypingAttempt_attemptId_key" ON "TypingAttempt"("attemptId");
CREATE INDEX "TypingAttempt_sessionId_idx" ON "TypingAttempt"("sessionId");
CREATE UNIQUE INDEX "TypingAttempt_sessionId_sequence_key" ON "TypingAttempt"("sessionId", "sequence");
`.trim();
