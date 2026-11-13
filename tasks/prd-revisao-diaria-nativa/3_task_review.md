# Review: Task 3.0 - Pareamento que dá nota

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 3_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`SqliteGameSessionRepository.create` passa a gravar `FREE` e `REVIEW`. A sessão de revisão deixa de ter um `INSERT` próprio do tabuleiro e chama `insertGameSession` dentro da mesma transação. Na tentativa de uma palavra com `graded = 1`, a agenda sai de `applyMatchingReview` e é gravada na mesma transação da tentativa, no fuso da `ReviewSession`. Distratora, palavra que não vence hoje, `attemptId` repetido, treino livre e desafio não movem a agenda. A regra de `matching-review.ts` não foi reescrita. `CLASSIC` continua recusado.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/persistence/sqlite-game-session-repository.ts` | ⚠️ Problemas | 1 minor |
| `src/persistence/sqlite-review-session-repository.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/matching-review.ts` | ✅ OK | 0 (não editado; só reutilizado) |
| `tests/unit/persistence/matching-review-rows.test.ts` | ⚠️ Problemas | 1 minor |
| `tests/integration/persistence/sqlite-review-matching.test.ts` | ✅ OK | 0 |
| `tests/integration/persistence/sqlite-game-session.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `src/persistence/sqlite-game-session-repository.ts`, `storeMatchingSchedule` (linha 379), lê o fuso e a agenda e em seguida grava. É o mesmo desenho de `storeProgress` neste arquivo e de `recordTypingAttempt` na tarefa 2.0: a transação de `recordAttempt` (linha 278) envolve contadores, agenda, resposta e estado. A escolha da nota ficou na função pura `scheduleMatchingAttempt` (linha 464). Mantido.

2. `tests/unit/persistence/matching-review-rows.test.ts`, linha 251, o caso "não vence hoje" soma `86_400_000` em vez de uma constante de um dia. O teste de integração já usa `DAY_MS`. Não muda o comportamento.

## ✅ Destaques Positivos

- O teto continua em `applyMatchingReview`: acerto rápido com pares restantes vira no máximo Bom; o par que completa o tabuleiro, no máximo Difícil. O teste de unidade monta as linhas, restaura a partida e compara com `scheduleReview` no fuso `America/New_York`.
- Só a linha com `graded = 1` em modo `REVIEW` recebe agenda. Distratora e treino livre devolvem `null`. Um erro já gravado nas linhas impede uma segunda nota.
- A palavra que não vence hoje e a distratora mantêm `nextReviewAt`, facilidade e estado. Contadores e exposição seguem o treino livre. O mesmo `attemptId` não cria outra resposta nem muda a agenda.
- O fuso lido é o de `ReviewSession.timeZone`, não um fuso fixo. A primeira nota de uma palavra nova em Nova York cai em `2026-11-13T05:00:00.000Z`.
- A sessão de revisão e o `create` do jogo usam o mesmo `insertGameSession`. Não há transação aninhada: a função só executa o `INSERT`.
- `npx tsc --noEmit` e `npx expo lint` saíram sem erro. `npx vitest run`: 65 arquivos, 545 testes, todos passando. Treino livre e desafio continuam sem escrever a agenda.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ (método da transação lê e grava, como o restante do repositório) |
| TypeScript/Node.js | ✅ `npx tsc --noEmit` sem erros |
| REST/HTTP | ✅ não se aplica |
| Logging | ✅ não se aplica |
| React | ✅ não se aplica; não há tela |
| Testes | ✅ unidade da escolha da nota e integração no `better-sqlite3`; E2E não se aplica |

## Recomendações

1. Na tarefa 4.0, a composição deve chamar `recordAttempt` do repositório da partida para o pareamento, sem recalcular a nota.
2. Trocar `86_400_000` do teste de unidade por uma constante de um dia, se esse arquivo for editado de novo.

## Veredito

Aprovado com observações. Não há issue crítica nem major. A tarefa 4.0 pode compor a revisão em cima deste repositório.
