# Review: Task 2.0 - Plano do dia e sessão de revisão no banco

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 2_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

O leitor do plano deixa de recusar `loadPlanInputs`, `findActiveWords` e `listStudied`. Ele devolve só palavras ativas: vencidas com `nextReviewAt` no instante atual ou antes, da mais atrasada para a menos atrasada, e candidatas novas na ordem de criação, junto com a contagem do que já entrou hoje como `NEW`. O repositório grava `ReviewSession` e `ReviewSessionWord` numa transação, e a partida ligada quando há pareamento. A primeira tentativa com nota chama `scheduleReview` na mesma transação; o reforço grava `isReinforcement = 1` sem nota; o mesmo `attemptId` não mexe na agenda. Concluir e abandonar gravam `status` e `finishedAt`. A sessão ativa do aluno fica disponível para a tarefa 4.0. A regra de domínio copiada não foi reescrita. A nota do pareamento continua fora desta tarefa.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/persistence/sqlite-daily-review-reader.ts` | ✅ OK | 0 |
| `src/persistence/sqlite-review-session-repository.ts` | ✅ OK | 0 |
| `src/lib/application/review/ports/review-session-repository.ts` | ✅ OK | 0 |
| `tests/unit/persistence/review-session-rows.test.ts` | ✅ OK | 0 |
| `tests/integration/persistence/sqlite-review-plan.test.ts` | ⚠️ Problemas | 1 minor |
| `tests/integration/persistence/sqlite-review-session.test.ts` | ⚠️ Problemas | 1 minor |
| `tests/unit/persistence/sqlite-daily-review-reader.test.ts` | ✅ OK | removido: o comportamento que ele travava deixou de existir |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `tests/integration/persistence/sqlite-review-plan.test.ts`, por volta da linha 185, o caso da cota já usada passa de 50 linhas porque monta sessões abandonadas, duplicadas, de outro dia e de outro aluno no próprio `it`. O mesmo vale para `tests/integration/persistence/sqlite-review-session.test.ts`, por volta da linha 164, no caso da agenda. O comportamento está coberto e o padrão do repositório já aceita cenário de integração longo. Uma melhoria possível é extrair a montagem da cota e da agenda para auxiliares com nome de cenário.

2. `src/persistence/sqlite-review-session-repository.ts`, `recordTypingAttempt` (linha 312) e `finish` (linha 352) leem e gravam na mesma transação, e guardam o resultado numa variável `let` porque `RunInTransaction` devolve `void`. É o mesmo desenho de `SqliteGameSessionRepository`. A consulta e a gravação da agenda ficam em funções separadas (`readScheduleRow` e `writeTypingSchedule`). Mantido.

## ✅ Destaques Positivos

- O resumo da entrada continua nas consultas que devolvem no máximo uma linha. `loadPlanInputs` é outro caminho. O teste de 5.000 palavras confere que os dois caminhos contam o mesmo número de vencidas e de novas.
- Palavra com revisão futura, palavra inativa e progresso sem `nextReviewAt` ficam de fora do plano. A cota usa `DAILY_NEW_WORD_LIMIT` e conta `NEW` distinto do dia local, inclusive sessão abandonada, sem contar origem `DUE`, o dia anterior nem outro aluno.
- A tentativa e a agenda entram na mesma transação. Reforço não chama `scheduleReview`. Repetir o `attemptId` com a mesma carga não cria outra linha; carga diferente ou outra sessão lança `ReviewAttemptConflictError`.
- Palavra ausente do catálogo reverte a sessão e a partida ligada e vira `InvalidReviewSessionError`. Identificador repetido vira o erro de domínio correspondente.
- A partida `REVIEW` é só o tabuleiro: `graded = 0` na distratora e `graded = 1` na palavra agendada. A nota do pareamento não foi ligada. `SqliteGameSessionRepository.create` continua recusando `REVIEW`.
- A conversão de linha para snapshot e para agenda está em funções puras, com teste de unidade para ordem, datas, reforço sem nota e estado desconhecido.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ (testes de integração longos; transação que lê e grava, como no repositório da partida) |
| TypeScript/Node.js | ✅ `npx tsc --noEmit` sem erros |
| REST/HTTP | ✅ não se aplica |
| Logging | ✅ não se aplica |
| React | ✅ não se aplica; não há tela |
| Testes | ✅ unidade e integração no `better-sqlite3`; E2E não se aplica |

## Recomendações

1. Na tarefa 3.0, ligar a nota do pareamento sem duplicar a inserção do tabuleiro que esta tarefa já grava.
2. Na tarefa 4.0, abandonar a sessão devolvida por `findActiveByVisitor` antes de abrir outra. O método não existe na porta do site; foi acrescentado porque esta tarefa pede a sessão ativa do aluno.
3. Extrair a preparação dos cenários longos de cota e de agenda se esses testes crescerem de novo.

## Veredito

Aprovado com observações. Não há issue crítica nem major. A tarefa 3.0 pode começar pelo modo `REVIEW` no repositório da partida, usando o tabuleiro que esta tarefa já persiste.
