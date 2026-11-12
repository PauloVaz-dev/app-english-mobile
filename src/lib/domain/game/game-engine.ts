import { CardNotOnBoardError, InvalidBoardError, InvalidRandomValueError } from "./errors";
import { BOARD_PAIR_LIMIT, MAX_BOARD_PAIR_LIMIT, type RandomSource, type Word } from "./types";

export interface GameCard {
  readonly wordId: string;
  readonly text: string;
  readonly language: "english" | "portuguese";
}

export interface GameBoard {
  readonly portugueseCards: readonly GameCard[];
  readonly englishCards: readonly GameCard[];
  readonly queuedWords: readonly Word[];
  readonly completedWordIds: readonly string[];
}

export interface BoardSelection {
  readonly promptWordId: string;
  readonly selectedWordId: string;
}

export interface BoardSelectionResult {
  readonly isCorrect: boolean;
  readonly completedWordId: string | null;
  readonly board: GameBoard;
}

export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValue = random.next();
    if (
      typeof randomValue !== "number" ||
      !Number.isFinite(randomValue) ||
      randomValue < 0 ||
      randomValue >= 1
    ) {
      throw new InvalidRandomValueError(randomValue);
    }
    const target = Math.floor(randomValue * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createGameBoard(
  words: readonly Word[],
  random: RandomSource,
  pairLimit = BOARD_PAIR_LIMIT,
): GameBoard {
  validatePairLimit(pairLimit);
  const distinctIds = new Set(words.map(({ id }) => id));
  if (distinctIds.size !== words.length) {
    throw new InvalidBoardError("Board words must be distinct.");
  }
  if (words.some((word) => !word.active)) {
    throw new InvalidBoardError("Board words must be active.");
  }
  const orderedWords = shuffle(words, random);
  const visibleWords = orderedWords.slice(0, pairLimit);
  return buildBoard(visibleWords, orderedWords.slice(pairLimit), [], random);
}

export function resolveBoardSelection(
  board: GameBoard,
  selection: BoardSelection,
  random: RandomSource,
): BoardSelectionResult {
  assertVisible(board.portugueseCards, selection.promptWordId, "portuguese");
  assertVisible(board.englishCards, selection.selectedWordId, "english");
  const isCorrect = selection.promptWordId === selection.selectedWordId;
  if (!isCorrect) {
    return {
      isCorrect: false,
      completedWordId: null,
      board: cloneBoard(board),
    };
  }
  const matchedWordId = selection.promptWordId;
  const remainingVisibleWords = board.portugueseCards
    .filter(({ wordId }) => wordId !== matchedWordId)
    .map((card) => wordFromBoard(board, card.wordId));
  const queuedWords = [...board.queuedWords];
  const replacement = queuedWords.shift();
  if (replacement) remainingVisibleWords.push(replacement);
  return {
    isCorrect: true,
    completedWordId: matchedWordId,
    board: buildBoard(
      remainingVisibleWords,
      queuedWords,
      [...board.completedWordIds, matchedWordId],
      random,
    ),
  };
}

function buildBoard(
  visibleWords: readonly Word[],
  queuedWords: readonly Word[],
  completedWordIds: readonly string[],
  random: RandomSource,
): GameBoard {
  const portugueseCards = shuffle(
    visibleWords.map((word) => ({
      wordId: word.id,
      text: word.portuguese,
      language: "portuguese" as const,
    })),
    random,
  );
  let englishCards = shuffle(
    visibleWords.map((word) => ({
      wordId: word.id,
      text: word.english,
      language: "english" as const,
    })),
    random,
  );
  if (
    englishCards.length > 1 &&
    englishCards.every((card, index) => card.wordId === portugueseCards[index].wordId)
  ) {
    englishCards = [...englishCards.slice(1), englishCards[0]];
  }
  return {
    portugueseCards,
    englishCards,
    queuedWords: [...queuedWords],
    completedWordIds: [...completedWordIds],
  };
}

function wordFromBoard(board: GameBoard, wordId: string): Word {
  const portuguese = board.portugueseCards.find((card) => card.wordId === wordId);
  const english = board.englishCards.find((card) => card.wordId === wordId);
  if (!portuguese || !english) {
    throw new InvalidBoardError("Visible board columns are inconsistent.");
  }
  return Object.freeze({
    id: wordId,
    english: english.text,
    portuguese: portuguese.text,
    exampleSentence: null,
    active: true,
  });
}

function cloneBoard(board: GameBoard): GameBoard {
  return {
    portugueseCards: board.portugueseCards.map((card) => ({ ...card })),
    englishCards: board.englishCards.map((card) => ({ ...card })),
    queuedWords: board.queuedWords.map((word) => ({ ...word })),
    completedWordIds: [...board.completedWordIds],
  };
}

function assertVisible(
  cards: readonly GameCard[],
  wordId: string,
  language: "english" | "portuguese",
): void {
  if (!cards.some((card) => card.wordId === wordId)) {
    throw new CardNotOnBoardError(wordId, language);
  }
}

function validatePairLimit(pairLimit: number): void {
  if (!Number.isInteger(pairLimit) || pairLimit < 1 || pairLimit > MAX_BOARD_PAIR_LIMIT) {
    throw new InvalidBoardError(
      `Pair limit must be an integer between 1 and ${MAX_BOARD_PAIR_LIMIT}.`,
    );
  }
}
