# Review: Task 1 - Sessão de 60 segundos e pontuação

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 1_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A pontuação do site foi copiada byte a byte de `app-english/lib/domain/challenge/scoring.ts`. A nova `FixedChallenge` é a sessão do modo único: prazo absoluto `startedAt + 60_000`, tentativa rejeitada 1 ms depois do prazo, expiração só a partir do prazo, abandono e idempotência por `attemptId`. Não há `level`, `levels.ts`, `ATTEMPT_GRACE_MS` nem `EXPIRE_TOLERANCE_MS`. Os 23 testes da tarefa e os 89 da suíte passaram, e o TypeScript compilou.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/lib/domain/challenge/scoring.ts` | ⚠️ Problemas | 1 |
| `src/lib/domain/challenge/fixed-challenge.ts` | ⚠️ Problemas | 1 |
| `tests/unit/domain/challenge/fixed-challenge.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `src/lib/domain/challenge/scoring.ts`, linha 21, mantém o comentário JSDoc do site. O padrão pede código sem comentário, mas a tarefa exige cópia sem alteração, como já foi feito com `local-day.ts` na tarefa 1 da fundação.

2. `src/lib/domain/challenge/fixed-challenge.ts`, `recordAttempt`, grava a tentativa e devolve a tentativa registrada, misturando mutação e consulta. O formato segue a sessão do site e a interface `attempt` da techspec, que também devolve o estado. Mantido.

## ✅ Destaques Positivos

- O prazo nunca é recalculado: `begin` só grava `startedAt` uma vez, e o teste do segundo plano confirma o mesmo `deadline` e 10 s restantes depois de um salto de 30 s.
- A comparação é estrita: `now > deadline` rejeita e `now < deadline` impede a expiração. A tentativa no instante exato do prazo entra.
- A tentativa rejeitada não muda pontuação nem lista de tentativas.
- O teste de integração em memória compara a sessão com `scoreOutcomes` das tentativas aceitas, incluindo a tentativa no prazo e a rejeitada 1 ms depois.
- O domínio importa só `game/errors`, `game/types` e `scoring`. Nada de Expo, React Native ou banco.

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

1. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo que esta task não altera. O erro é `react-hooks/set-state-in-effect`. Os arquivos desta task passam no `eslint` sem erro.
2. Os testes de pontuação do site e o teste de integração em memória ficaram em `tests/unit/domain/challenge/fixed-challenge.test.ts`, o único arquivo de teste listado na tarefa. O teste de integração com SQLite fica para a tarefa 2.0.
3. A tarefa 2.0 vai precisar restaurar a sessão gravada. O `restore` não foi antecipado aqui.

## Veredito

Aprovado com observações. A task 1.0 está concluída. A próxima é a 2.0, banco e recorde.
