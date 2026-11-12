export interface VocabularySeedEntry {
  readonly id: string;
  readonly english: string;
  readonly portuguese: string;
  readonly exampleSentence: string;
}

const pairs = [
  ["apple", "maçã", "I eat an apple every morning."],
  ["book", "livro", "She reads a book before bed."],
  ["house", "casa", "Their house has a red door."],
  ["water", "água", "Please drink more water today."],
  ["food", "comida", "The food at this restaurant is great."],
  ["dog", "cachorro", "My dog loves to play outside."],
  ["cat", "gato", "The cat is sleeping on the sofa."],
  ["sun", "sol", "The sun is bright today."],
  ["moon", "lua", "We watched the moon rise at night."],
  ["school", "escola", "Children walk to school together."],
  ["friend", "amigo", "He met a friend at the park."],
  ["family", "família", "Family dinner is on Sundays."],
  ["work", "trabalho", "She goes to work by bus."],
  ["city", "cidade", "This city has many museums."],
  ["street", "rua", "Cross the street carefully."],
  ["car", "carro", "He drives a blue car."],
  ["bicycle", "bicicleta", "She rides her bicycle to work."],
  ["morning", "manhã", "I exercise every morning."],
  ["night", "noite", "The stars shine at night."],
  ["happy", "feliz", "They feel happy after the news."],
  ["sad", "triste", "It is okay to feel sad sometimes."],
  ["big", "grande", "That is a big tree."],
  ["small", "pequeno", "She lives in a small apartment."],
  ["fast", "rápido", "The train is very fast."],
  ["slow", "lento", "Traffic was slow this morning."],
  ["open", "abrir", "Please open the window."],
  ["close", "fechar", "Close the door quietly."],
  ["read", "ler", "I read the news online."],
  ["write", "escrever", "She will write an email now."],
  ["speak", "falar", "Please speak clearly."],
  ["listen", "escutar", "Listen to the teacher carefully."],
  ["learn", "aprender", "We learn something new every day."],
] as const;

export const vocabularySeed: readonly VocabularySeedEntry[] = pairs.map(
  ([english, portuguese, exampleSentence], index) => ({
    id: `00000000-0000-4${(index + 1).toString(16).padStart(3, "0")}-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    english,
    portuguese,
    exampleSentence,
  }),
);

export function normalizeVocabularyText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
