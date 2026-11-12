# Review: Task 2 - Banco e recorde

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 2_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`SqliteChallengeRepository` grava a sessão, as palavras da sessão e as tentativas nas tabelas `ChallengeSession`, `ChallengeSessionWord` e `ChallengeAttempt` da migração 1, sobre o mesmo `SqlExecutor` e `RunInTransaction` da fundação. `level` é sempre `1`. O recorde é calculado por consulta (`MAX("score")` das sessões `COMPLETED` do aluno), sem coluna nova e sem migração 2. O domínio ganhou `bestCompletedScore` e `compareWithRecord` (comparação em memória), além de `FixedChallenge.restore` e `toSnapshot`, que o repositório usa para devolver a sessão depois de reabrir o arquivo. O prazo continua sendo `startedAt + 60_000` e não é gravado. Suíte completa: 18 arquivos, 105 testes passando; `tsc --noEmit` sem erros; `expo lint` só com o erro pré-existente de `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/persistence/sqlite-challenge-repository.ts` | ⚠️ Problemas | 2 |
| `src/lib/domain/challenge/fixed-challenge.ts` | ✅ OK | 0 |
| `tests/unit/domain/challenge/fixed-challenge.test.ts` | ✅ OK | 0 |
| `tests/integration/persistence/sqlite-challenge.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `src/persistence/sqlite-challenge-repository.ts`, `writeAttempts`, lê as tentativas já gravadas para validar o prefixo antes de inserir as novas. É leitura dentro de um método de escrita. A leitura existe só para garantir a idempotência (mesmas tentativas não duplicam e tentativas divergentes falham com `StoredAttemptsMismatchError`) e roda dentro da mesma transação. Mantido.

2. `src/persistence/sqlite-challenge-repository.ts` usa `index + 1` para `sequence` e `1 : 0` para o booleano do SQLite. São conversões de formato, não regras de negócio, no mesmo estilo dos demais repositórios da fundação.

## ✅ Destaques Positivos

- Recorde por consulta, sem coluna solta: `bestCompletedScore` (maior score concluído) e `recordFor` (compara com as sessões concluídas antes desta). Abandono fica de fora sem segunda escrita.
- `recordFor` compara só com sessões concluídas que terminaram antes da atual (`finishedAt` menor, com desempate por `id`). Assim, o resultado de uma sessão antiga continua igual depois que sessões novas são jogadas e o arquivo é reaberto. O teste cobre isso.
- Empate não é recorde novo, a primeira conclusão é recorde e uma sessão `ABANDONED` ou `ACTIVE` nunca é recorde. Isso está coberto em memória e no SQLite.
- `save` roda em transação, não reescreve sessão já encerrada (`WHERE "status" = 'ACTIVE'` mais `SessionEndedError` para um status divergente) e é idempotente.
- `FixedChallenge.restore` valida status, horários, prazo, ordem, unicidade e coerência de `isCorrect` das tentativas, e falha com `InvalidGameSessionError`. Um registro adulterado não vira sessão válida.
- O teste de separação compara, antes e depois de uma sessão concluída e de uma abandonada, todas as linhas de `LearnerWordProgress`, `GameSession`, `GameSessionWord`, `GameAnswer`, `ReviewSession`, `ReviewSessionWord` e `TypingAttempt`.
- O teste de schema confirma `user_version = 1` e as 11 colunas originais de `ChallengeSession`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | N/A |
| React | N/A |
| Testes | ✅ |

## Recomendações

1. A tarefa 3.0 deve montar `ChallengeResult` com `recordFor` e gravar com `create` e `save`. O sorteio, a falha com catálogo vazio e o log `challenge.persist_failed` ficam para ela.
2. `npx expo lint` continua com 1 erro pré-existente (`react-hooks/set-state-in-effect`) em `src/hooks/use-color-scheme.web.ts`, arquivo que esta tarefa não altera.
3. `prettier --check` acusa diferenças nos arquivos novos e também nos arquivos existentes de `src/persistence`: o `.prettierrc` pede aspas simples, mas o repositório usa aspas duplas. Segui o padrão do código existente.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem: a sessão concluída sobrevive a reabrir o arquivo com a mesma pontuação, o abandono não altera o recorde, o empate não é anunciado como recorde novo, e as tabelas de progresso e revisão mantêm as mesmas linhas. A tarefa 3.0 pode começar.
