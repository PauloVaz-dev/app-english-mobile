# Tarefa 2.0: Gravação da palavra

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Gravar a palavra no `english.db`. O repositório SQLite e o caso de uso `create-word` validam, procuram a duplicata e inserem numa transação. Ainda não há composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Sem migração: usar a tabela `Word` da versão 1.
- Texto inválido não abre transação nem toca o banco.
- A duplicata é procurada por `vocabularyKey` lendo o catálogo inteiro dentro da transação, incluindo palavras inativas. Duplicata não cria linha nem altera a existente, e devolve o inglês e o português gravados.
- A linha nova é ativa, com o texto limpo, `exampleSentence` nula quando vazia, `englishNormalized` e `portugueseNormalized` por `normalizeVocabularyText`, e `updatedAt` do relógio.
- Nenhuma linha em `LearnerWordProgress`.
- Falha no meio da transação não deixa linha parcial.
- Violação do índice único dentro da transação vira duplicata.
- A palavra gravada sobrevive a fechar e reabrir o arquivo, e a semeadura do vocabulário inicial não a duplica.
</requirements>

## Subtarefas

- [x] 2.1 Escrever os testes de unidade que falham para `create-word` com repositório em memória: inválido, duplicata, sucesso.
- [x] 2.2 Escrever os testes de integração que falham no `better-sqlite3`: gravar e reabrir, duplicata do vocabulário inicial, duplicata de inativa, falha sem linha parcial, semeadura sem duplicar, palavra nova sorteável sem histórico.
- [x] 2.3 Implementar a porta `VocabularyRepository` e `SqliteVocabularyRepository`.
- [x] 2.4 Implementar `create-word`, adaptado do site para esta porta.
- [x] 2.5 Refatorar até os testes passarem, sem mudar regra copiada.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`VocabularyRepository`), Modelos de Dados (as duas comparações) e Testes de Integração.

Referência, somente leitura: `/home/psgvaz/Projetos/app-english/lib/application/vocabulary/create-word.ts` e `/home/psgvaz/Projetos/app-english/lib/infrastructure/persistence/prisma/repositories/vocabulary-repository.ts`. O padrão de repositório deste app está em `src/persistence/sqlite-game-session-repository.ts`; a semeadura em `src/seed/seed-vocabulary.ts`.

## Critérios de Sucesso

- Uma palavra gravada e reaberta tem o mesmo texto, com acento e maiúscula.
- Duplicata, inclusive de inativa, não muda nenhuma linha.
- A palavra nova sai em `drawPracticeWords` e `drawChallengeWords` como palavra sem histórico.
- Os testes já existentes continuam passando.

## Testes da Tarefa

- [x] Testes de unidade: `create-word` com repositório em memória.
- [x] Testes de integração: repositório e caso de uso no `better-sqlite3` com arquivo de verdade.
- [x] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/application/vocabulary/create-word.ts`
- `src/lib/application/vocabulary/ports/vocabulary-repository.ts`
- `src/persistence/sqlite-vocabulary-repository.ts`
- `src/seed/seed-vocabulary.ts`
- `tests/unit/application/vocabulary/create-word.test.ts`
- `tests/integration/persistence/sqlite-vocabulary.test.ts`
