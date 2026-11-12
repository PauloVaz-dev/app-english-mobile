# Review: Task 1 - Repositório pronto com as regras de estudo

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 1_task.md
**Status**: APPROVED WITH OBSERVATIONS

## Resumo

A tarefa deixa o aplicativo instalável e traz as regras de estudo do site para `src/lib`, sem Prisma, Next ou infraestrutura. O caso de uso do resumo e o cálculo do dia local foram copiados sem mudança de regra. Os testes de dia local, do texto da entrada e do caso de uso passam, e a varredura do grafo rejeita `@prisma/client` e `next`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `package.json` | ✅ OK | 0 |
| `app.json` | ✅ OK | 0 |
| `vitest.config.mts` | ✅ OK | 0 |
| `nativewind-env.d.ts` | ✅ OK | 0 |
| `eslint.config.js` | ✅ OK | 0 |
| `prisma/schema.prisma` | ✅ OK | 0 |
| `prisma/seed-data.ts` | ✅ OK | 0 |
| `src/lib/application/review/get-daily-review-summary.ts` | ✅ OK | 0 |
| `src/lib/application/review/ports/daily-review-reader.ts` | ✅ OK | 0 |
| `src/lib/application/review/ports/visitor-preferences.ts` | ✅ OK | 0 |
| `src/lib/presentation/review/home-review-copy.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/local-day.ts` | ⚠️ Problemas | 1 |
| `src/lib/domain/learning/review-schedule.ts` | ⚠️ Problemas | 1 |
| `src/lib/domain/learning/errors.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/daily-review-plan.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/difficulty-policy.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/progress-metrics.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/selection-weights.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/types.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/word-selection.ts` | ✅ OK | 0 |
| `src/lib/domain/game/types.ts` | ✅ OK | 0 |
| `src/lib/domain/game/errors.ts` | ✅ OK | 0 |
| `tests/integration/lib-boundary.test.ts` | ✅ OK | 0 |
| `tests/support/review-summary-double.ts` | ✅ OK | 0 |
| `tests/unit/application/review/get-daily-review-summary.test.ts` | ✅ OK | 0 |
| `tests/unit/domain/learning/local-day.test.ts` | ✅ OK | 0 |
| `tests/unit/presentation/review/home-review-copy.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. `src/lib/domain/learning/local-day.ts`, linhas 3 e 25-29, e `src/lib/domain/learning/review-schedule.ts`, linhas 7, 12, 56-60, 72 e 81-84, mantêm comentários do site. O padrão do repositório pede código sem comentário. Esses textos explicam a regra de estudo e foram preservados de propósito: a tarefa proíbe alterar a regra para fazer o teste passar.

```ts
/** Used when the learner's browser does not report a time zone. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
```

Correção sugerida: nenhuma nesta tarefa. Uma limpeza de comentário só cabe se a regra for reescrita num PRD futuro.

## ✅ Destaques Positivos

- `GetDailyReviewSummary`, `local-day.ts`, `home-review-copy.ts`, a semente e o `schema.prisma` estão idênticos à origem.
- Nenhum arquivo em `src/lib` importa `@prisma/client` ou `next`. O teste de fronteira também segue import relativo que sai da pasta.
- Os testes de dia local e do texto da entrada vieram na íntegra e passam com o mesmo comportamento.
- O caso de uso continua só escolhendo o fuso e delegando a conta ao reader. A cota, as vencidas e a próxima revisão do teste usam `DAILY_NEW_WORD_LIMIT`, `isReviewDue` e `localDateOf`.
- `expo-router` e `expo-sqlite` permaneceram. `expo-localization` e `expo-crypto` entraram com `npx expo install`. O alias `@/` continua em `src/*`.
- `app-english` não foi editado.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ |
| Logging | ✅ |
| React | ✅ |
| Testes | ✅ |

## Recomendações

1. Manter os comentários do domínio copiado até uma tarefa que possa reescrever a regra. Não são bloqueio.
2. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo do template que esta tarefa não alterou. O hook faz `setState` no efeito para a hidratação web. Não bloqueia a tarefa 1.
3. A semente e o schema ficam só como referência. A inserção idempotente e a migração SQL são as tarefas 2 e 3.

## Veredito

APPROVED WITH OBSERVATIONS. A tarefa 1 está pronta para a tarefa 2. Não há problema crítico nem major. O TypeScript do projeto compila com `npx tsc --noEmit`. `npx vitest run` executou 4 arquivos e 21 testes, todos passando.

Durante a revisão foram corrigidos dois pontos antes do veredito: a declaração de módulos `*.css` em `nativewind-env.d.ts`, que fazia o `tsc` falhar nos imports de CSS já existentes, e a config do Vitest em `vitest.config.mts`, para o carregador ESM não tratar o arquivo como CommonJS. A referência `types="node"` no teste de fronteira garante que o prefixo `node:` resolva no TypeScript 6 deste app.
