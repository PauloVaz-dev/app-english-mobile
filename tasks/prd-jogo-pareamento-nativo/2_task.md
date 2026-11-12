# Tarefa 2.0: Banco da partida e sorteio ponderado

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Gravar a partida no `english.db` e sortear as 20 palavras do treino. O repositório SQLite cria, lê, registra exposição e tentativa, abandona e lê as listas do resultado. O catálogo ganha o sorteio ponderado sobre todas as ativas. Ainda não há composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Sem migração: usar `GameSession`, `GameSessionWord`, `GameAnswer` e `LearnerWordProgress` da versão 1.
- `create` grava a sessão `FREE` com `targetWords = 20` e cada palavra com `graded = 0`.
- `recordExposures` marca `presentedAt` uma vez e soma `timesShown` só na primeira exposição da palavra na sessão.
- `recordAttempt` grava `GameAnswer`, `completedAt` no acerto e o progresso por `applyAttemptToProgress`, numa transação. Repetir o `attemptId` não altera nada.
- Palavra exposta e não acertada guarda exposição e erros, sem tempo de acerto.
- O modo `FREE` não escreve as colunas de agenda de `LearnerWordProgress` (`nextReviewAt`, `reviewState`, `reviewRepetitions`, `reviewLapses`, `reviewIntervalDays`, `reviewEaseFactor`, `lastReviewedAt`).
- Concluir e abandonar gravam `status`, `finishedAt` e `durationMs`.
- `findById` reconstrói a sessão por `GameSession.restore`, e a leitura das listas usa `buildSessionReview`.
- `drawPracticeWords` devolve 20 palavras ativas distintas por `selectWeightedWords` (fácil 1, normal 3, difícil 6; sem histórico, uniforme). Com menos de 20 ativas, falha com `InvalidWordCatalogError`. Usa só o progresso do próprio aluno.
- O sorteio do desafio (`drawChallengeWords`) não muda.
</requirements>

## Subtarefas

- [x] 2.1 Escrever os testes de integração que falham: criar, ler e reabrir o arquivo com o mesmo resultado; exposição repetida; tentativa repetida; palavra exposta e não acertada; agenda intacta; abandono.
- [x] 2.2 Escrever os testes que falham para `drawPracticeWords`: 20 distintas, inativas fora, menos de 20 ativas, histórico de outro aluno ignorado, peso pela classificação.
- [x] 2.3 Implementar `SqliteGameSessionRepository` sobre o executor e a transação da fundação.
- [x] 2.4 Implementar `drawPracticeWords` em `SqliteWordCatalog` reutilizando o carregamento já existente.
- [x] 2.5 Refatorar até os testes passarem, sem mudar regra copiada.

## Detalhes de Implementação

Ver `techspec.md`: Modelos de Dados, Decisões Principais (treino livre ponderado sobre todas as ativas) e Testes de Integração.

Referência de comportamento, somente leitura: `/home/psgvaz/Projetos/app-english/lib/infrastructure/persistence/prisma/repositories/game-session-repository.ts` e `session-review-reader.ts`. O padrão de repositório deste app está em `src/persistence/sqlite-challenge-repository.ts`.

## Critérios de Sucesso

- Uma partida gravada e reaberta devolve as mesmas métricas e listas.
- As colunas de agenda ficam iguais depois de uma partida `FREE`.
- Nenhuma tentativa ou exposição repetida altera os consolidados.
- Os testes do desafio continuam passando sem mudança.

## Testes da Tarefa

- [x] Testes de unidade: conversão de linhas para snapshot e o sorteio ponderado com catálogo falso.
- [x] Testes de integração: repositório e catálogo no `better-sqlite3` com arquivo de verdade.
- [ ] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/persistence/sqlite-game-session-repository.ts`
- `src/persistence/sqlite-word-catalog.ts`
- `src/persistence/sql-executor.ts`
- `src/persistence/schema-version-one.ts`
- `tests/integration/persistence/sqlite-game-session.test.ts`
- `tests/unit/persistence/practice-draw.test.ts`
